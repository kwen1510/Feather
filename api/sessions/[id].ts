import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from '@neondatabase/serverless';

interface Session {
  id: string;
  room_code: string;
  teacher_name: string | null;
  status: 'created' | 'active' | 'ended';
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    res.status(500).json({ error: 'POSTGRES_URL environment variable is not set' });
    return;
  }

  const pool = new Pool({ connectionString });
  
  // Extract room code from URL path: /api/sessions/[id]
  // Try req.query first (Vercel pattern), then parse from URL
  let roomCode = req.query.id as string | undefined;
  if (!roomCode && req.url) {
    const match = req.url.match(/\/api\/sessions\/([^/?]+)/);
    roomCode = match ? match[1] : undefined;
  }

  if (!roomCode) {
    res.status(400).json({ error: 'Room code is required' });
    await pool.end();
    return;
  }

  try {
    if (req.method === 'GET') {
      // Fetch session by room code (case-insensitive)
      const result = await pool.query(
        `SELECT * FROM sessions
         WHERE room_code ILIKE $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [roomCode]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const session = result.rows[0] as Session;
      res.status(200).json(session);
    } else if (req.method === 'POST') {
      // Create or reactivate session
      // First check if session exists
      const existingResult = await pool.query(
        `SELECT * FROM sessions
         WHERE room_code ILIKE $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [roomCode]
      );

      let session: Session;

      if (existingResult.rows.length > 0) {
        const existingSession = existingResult.rows[0] as Session;

        if (existingSession.status === 'ended') {
          // Reactivate ended session
          const updateResult = await pool.query(
            `UPDATE sessions
             SET status = 'created', started_at = NULL, ended_at = NULL
             WHERE id = $1
             RETURNING *`,
            [existingSession.id]
          );

          if (updateResult.rows.length === 0) {
            res.status(500).json({ error: 'Failed to reactivate session' });
            return;
          }

          session = updateResult.rows[0] as Session;
        } else {
          // Return existing active session
          session = existingSession;
        }
      } else {
        // Create new session
        try {
          const insertResult = await pool.query(
            `INSERT INTO sessions (room_code, status)
             VALUES ($1, 'created')
             RETURNING *`,
            [roomCode]
          );

          if (insertResult.rows.length === 0) {
            res.status(500).json({ error: 'Failed to create session' });
            return;
          }

          session = insertResult.rows[0] as Session;
        } catch (insertError: any) {
          // Handle duplicate key error (23505) - race condition
          if (insertError.code === '23505' || insertError.message?.includes('duplicate')) {
            const conflictResult = await pool.query(
              `SELECT * FROM sessions
               WHERE room_code ILIKE $1
               ORDER BY created_at DESC
               LIMIT 1`,
              [roomCode]
            );

            if (conflictResult.rows.length > 0) {
              session = conflictResult.rows[0] as Session;
            } else {
              res.status(500).json({ error: 'Duplicate key reported but session not found' });
              return;
            }
          } else {
            throw insertError;
          }
        }
      }

      res.status(200).json(session);
    } else if (req.method === 'PUT') {
      // Update session status
      const body = req.body as { status?: 'active' | 'ended' };
      const { status } = body;

      if (!status || (status !== 'active' && status !== 'ended')) {
        res.status(400).json({ error: 'Invalid status. Must be "active" or "ended"' });
        return;
      }

      // First get the session
      const existingResult = await pool.query(
        `SELECT * FROM sessions
         WHERE room_code ILIKE $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [roomCode]
      );

      if (existingResult.rows.length === 0) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const existingSession = existingResult.rows[0] as Session;
      const now = new Date().toISOString();

      let updateQuery: string;
      let queryParams: unknown[];

      if (status === 'active') {
        updateQuery = `UPDATE sessions
                       SET status = 'active', started_at = $1
                       WHERE id = $2
                       RETURNING *`;
        queryParams = [now, existingSession.id];
      } else {
        // status === 'ended'
        updateQuery = `UPDATE sessions
                       SET status = 'ended', ended_at = $1
                       WHERE id = $2
                       RETURNING *`;
        queryParams = [now, existingSession.id];
      }

      const updateResult = await pool.query(updateQuery, queryParams);

      if (updateResult.rows.length === 0) {
        res.status(500).json({ error: 'Failed to update session' });
        return;
      }

      const updatedSession = updateResult.rows[0] as Session;
      res.status(200).json(updatedSession);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Session operation error:', err);
    
    // Check if error is due to missing table
    if (err?.code === '42P01' || errorMessage.includes('does not exist')) {
      res.status(500).json({ 
        error: 'Database schema not initialized', 
        details: 'The sessions table does not exist. Please run the database schema migration.',
        hint: 'See neon-schema.sql in the project root or call /api/db/init to initialize the database.'
      });
      return;
    }
    
    res.status(500).json({ error: 'Failed to process session operation', details: errorMessage });
  } finally {
    await pool.end();
  }
}

