import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from '@neondatabase/serverless';

interface Participant {
  id: string;
  session_id: string;
  client_id: string;
  student_id: string | null;
  role: 'teacher' | 'student';
  name: string | null;
  is_flagged: boolean;
  joined_at: string;
  left_at: string | null;
}

interface Annotation {
  id: string;
  session_id: string;
  participant_id: string;
  question_id: string;
  student_lines: unknown[];
  teacher_annotations: unknown[];
  is_flagged: boolean;
  created_at: string;
  last_updated_at: string;
}

interface AnnotationWithParticipant extends Annotation {
  participant: Participant;
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
  
  // Extract questionId from URL path: /api/responses/[questionId]
  // Try req.query first (Vercel pattern), then parse from URL
  let questionId = req.query.questionId as string | undefined;
  if (!questionId && req.url) {
    const match = req.url.match(/\/api\/responses\/([^/?]+)/);
    questionId = match ? match[1] : undefined;
  }

  if (!questionId) {
    res.status(400).json({ error: 'Question ID is required' });
    await pool.end();
    return;
  }

  try {
    const result = await pool.query(
      `SELECT 
         a.id,
         a.session_id,
         a.participant_id,
         a.question_id,
         a.student_lines,
         a.teacher_annotations,
         a.is_flagged,
         a.created_at,
         a.last_updated_at,
         json_build_object(
           'id', p.id,
           'session_id', p.session_id,
           'client_id', p.client_id,
           'student_id', p.student_id,
           'role', p.role,
           'name', p.name,
           'is_flagged', p.is_flagged,
           'joined_at', p.joined_at,
           'left_at', p.left_at
         ) as participant
       FROM annotations a
       INNER JOIN participants p ON a.participant_id = p.id
       WHERE a.question_id = $1
         AND p.role = 'student'
       ORDER BY a.created_at ASC`,
      [questionId]
    );

    // Transform the result to match the expected format
    const responses: AnnotationWithParticipant[] = result.rows.map((row) => ({
      id: row.id,
      session_id: row.session_id,
      participant_id: row.participant_id,
      question_id: row.question_id,
      student_lines: row.student_lines,
      teacher_annotations: row.teacher_annotations,
      is_flagged: row.is_flagged,
      created_at: row.created_at,
      last_updated_at: row.last_updated_at,
      participant: row.participant as Participant,
    }));

    res.status(200).json(responses);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Fetch responses error:', err);
    res.status(500).json({ error: 'Failed to fetch responses', details: errorMessage });
  } finally {
    await pool.end();
  }
}

