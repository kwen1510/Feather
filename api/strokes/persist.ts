import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from '@neondatabase/serverless';

interface Participant {
  id: string;
  session_id: string;
  client_id: string;
  student_id: string | null;
  role: string;
  name: string | null;
}

interface Question {
  id: string;
  session_id: string;
  question_number: number;
  content_type: string;
  template_type?: string | null;
  image_data?: unknown | null;
}

interface StudentData {
  studentLines?: unknown[];
  teacherAnnotations?: unknown[];
  studentName?: string;
}

interface PersistBody {
  sessionId: string;
  questionNumber: number;
  contentType?: string;
  content?: {
    type?: string;
    [key: string]: unknown;
  };
  studentsData?: Record<string, StudentData>;
}

/**
 * Get or create a participant record in Neon
 */
async function getOrCreateParticipant(
  pool: Pool,
  sessionId: string,
  studentId: string,
  name: string,
  role: string
): Promise<Participant> {
  try {
    // First try to find existing participant
    const existingResult = await pool.query(
      `SELECT * FROM participants 
       WHERE session_id = $1 AND student_id = $2`,
      [sessionId, studentId]
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0] as Participant;
      
      // Update name if it has changed
      if (name && existing.name !== name) {
        const updateResult = await pool.query(
          `UPDATE participants 
           SET name = $1 
           WHERE id = $2 
           RETURNING *`,
          [name, existing.id]
        );
        
        if (updateResult.rows.length > 0) {
          return updateResult.rows[0] as Participant;
        }
        return existing;
      }

      return existing;
    }

    // Create new participant
    const clientId = `${role}-${Date.now()}`;
    const insertResult = await pool.query(
      `INSERT INTO participants (session_id, client_id, student_id, role, name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [sessionId, clientId, studentId, role, name]
    );

    if (insertResult.rows.length === 0) {
      throw new Error('Failed to create participant');
    }

    return insertResult.rows[0] as Participant;
  } catch (error) {
    console.error('getOrCreateParticipant error:', error);
    throw error;
  }
}

/**
 * Save a question to Neon
 */
async function saveQuestion(
  pool: Pool,
  sessionId: string,
  questionNumber: number,
  contentType: string | undefined,
  content: { type?: string; [key: string]: unknown } | undefined
): Promise<Question> {
  try {
    const finalContentType = contentType || 'blank';
    const templateType = (contentType === 'template' && content?.type) ? content.type : null;
    const imageData = (contentType === 'image' && content) ? JSON.stringify(content) : null;

    const result = await pool.query(
      `INSERT INTO questions (session_id, question_number, content_type, template_type, image_data)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [sessionId, questionNumber, finalContentType, templateType, imageData]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to save question');
    }

    console.log(`✅ Saved question ${questionNumber} to Neon`);
    return result.rows[0] as Question;
  } catch (error) {
    console.error('saveQuestion error:', error);
    throw error;
  }
}

/**
 * Save annotations (student lines + teacher annotations) to Neon
 */
async function saveAnnotations(
  pool: Pool,
  sessionId: string,
  questionId: string,
  participantId: string,
  studentLines: unknown[],
  teacherAnnotations: unknown[]
): Promise<boolean> {
  try {
    // Check if annotation already exists
    const existingResult = await pool.query(
      `SELECT id FROM annotations 
       WHERE participant_id = $1 AND question_id = $2`,
      [participantId, questionId]
    );

    const studentLinesJson = JSON.stringify(studentLines || []);
    const teacherAnnotationsJson = JSON.stringify(teacherAnnotations || []);

    if (existingResult.rows.length > 0) {
      // Update existing annotation
      await pool.query(
        `UPDATE annotations 
         SET student_lines = $1::jsonb, 
             teacher_annotations = $2::jsonb
         WHERE id = $3`,
        [studentLinesJson, teacherAnnotationsJson, existingResult.rows[0].id]
      );
    } else {
      // Insert new annotation
      await pool.query(
        `INSERT INTO annotations (session_id, participant_id, question_id, student_lines, teacher_annotations)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
        [sessionId, participantId, questionId, studentLinesJson, teacherAnnotationsJson]
      );
    }

    return true;
  } catch (error) {
    console.error('saveAnnotations error:', error);
    throw error;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Create pool inside handler for serverless environment
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    res.status(500).json({ error: 'POSTGRES_URL environment variable is not set' });
    return;
  }

  const pool = new Pool({ connectionString });

  try {
    const body = req.body as PersistBody;
    const { sessionId, questionNumber, contentType, content, studentsData } = body;

    if (!sessionId || questionNumber === undefined) {
      res.status(400).json({ error: 'Missing required fields: sessionId, questionNumber' });
      return;
    }

    console.log(`📝 Persisting question ${questionNumber} for session ${sessionId}`);

    // Step 1: Create the question
    const question = await saveQuestion(pool, sessionId, questionNumber, contentType, content);

    // Step 2: Save all student data provided from IndexedDB
    // studentsData format: { studentId: { studentLines, teacherAnnotations, studentName } }
    let savedCount = 0;

    if (studentsData && typeof studentsData === 'object') {
      for (const [studentId, data] of Object.entries(studentsData)) {
        const { studentLines = [], teacherAnnotations = [], studentName = 'Unknown Student' } = data;

        // Only save if there's actual content
        if ((studentLines && studentLines.length > 0) || (teacherAnnotations && teacherAnnotations.length > 0)) {
          // Get or create participant
          const participant = await getOrCreateParticipant(
            pool,
            sessionId,
            studentId,
            studentName,
            'student'
          );

          // Save annotations
          await saveAnnotations(
            pool,
            sessionId,
            question.id,
            participant.id,
            studentLines as unknown[],
            teacherAnnotations as unknown[]
          );

          savedCount++;
        }
      }
    }

    console.log(`✅ Persisted ${savedCount} student responses for question ${questionNumber}`);

    res.status(200).json({
      success: true,
      questionId: question.id,
      savedCount
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Persist strokes error:', err);
    res.status(500).json({ error: 'Failed to persist strokes', details: errorMessage });
  } finally {
    // End the pool to release connections
    await pool.end();
  }
}
