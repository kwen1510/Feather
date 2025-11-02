import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from '@neondatabase/serverless';

interface Question {
  id: string;
  session_id: string;
  question_number: number;
  content_type: 'blank' | 'template' | 'image';
  template_type: 'hanzi' | 'graph-corner' | 'graph-cross' | null;
  image_data: unknown | null;
  sent_at: string;
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
  
  // Extract sessionId from URL path: /api/questions/[sessionId]
  // Try req.query first (Vercel pattern), then parse from URL
  let sessionId = req.query.sessionId as string | undefined;
  if (!sessionId && req.url) {
    const match = req.url.match(/\/api\/questions\/([^/?]+)/);
    sessionId = match ? match[1] : undefined;
  }

  if (!sessionId) {
    res.status(400).json({ error: 'Session ID is required' });
    await pool.end();
    return;
  }

  try {
    const result = await pool.query(
      `SELECT * FROM questions
       WHERE session_id = $1
       ORDER BY question_number ASC`,
      [sessionId]
    );

    const questions = result.rows as Question[];
    res.status(200).json(questions);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Fetch questions error:', err);
    res.status(500).json({ error: 'Failed to fetch questions', details: errorMessage });
  } finally {
    await pool.end();
  }
}

