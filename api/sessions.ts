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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    res.status(500).json({ error: 'POSTGRES_URL environment variable is not set' });
    return;
  }

  const pool = new Pool({ connectionString });

  try {
    const result = await pool.query(
      `SELECT * FROM sessions
       ORDER BY created_at DESC`
    );

    const sessions = result.rows as Session[];
    res.status(200).json(sessions);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Fetch sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions', details: errorMessage });
  } finally {
    await pool.end();
  }
}

