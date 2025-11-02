import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
);

interface Participant {
  id: string;
  session_id: string;
  client_id: string;
  student_id: string;
  role: string;
  name: string;
}

interface Question {
  id: string;
  session_id: string;
  question_number: number;
  content_type: string;
  template_type?: string;
  image_data?: unknown;
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
 * Get or create a participant record in Supabase
 */
async function getOrCreateParticipant(
  sessionId: string,
  studentId: string,
  name: string,
  role: string
): Promise<Participant> {
  try {
    // First try to find existing participant
    const { data: existing, error: findError } = await supabase
      .from('participants')
      .select('*')
      .eq('session_id', sessionId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (findError && findError.code !== 'PGRST116') {
      console.error('Error finding participant:', findError);
      throw findError;
    }

    if (existing) {
      if (name && existing.name !== name) {
        const { data: updated, error: updateError } = await supabase
          .from('participants')
          .update({ name })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating participant name:', updateError);
          return existing as Participant;
        }

        return updated as Participant;
      }

      return existing as Participant;
    }

    // Create new participant
    const { data: newParticipant, error: insertError } = await supabase
      .from('participants')
      .insert([{
        session_id: sessionId,
        client_id: `${role}-${Date.now()}`,
        student_id: studentId,
        role: role,
        name: name,
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Error creating participant:', insertError);
      throw insertError;
    }

    return newParticipant as Participant;
  } catch (error) {
    console.error('getOrCreateParticipant error:', error);
    throw error;
  }
}

/**
 * Save a question to Supabase
 */
async function saveQuestionToSupabase(
  sessionId: string,
  questionNumber: number,
  contentType: string | undefined,
  content: { type?: string; [key: string]: unknown } | undefined
): Promise<Question> {
  try {
    const questionData: {
      session_id: string;
      question_number: number;
      content_type: string;
      template_type?: string;
      image_data?: unknown;
    } = {
      session_id: sessionId,
      question_number: questionNumber,
      content_type: contentType || 'blank',
    };

    // Add template type if it's a template
    if (contentType === 'template' && content?.type) {
      questionData.template_type = content.type;
    }

    // Add image data if it's an image
    if (contentType === 'image' && content) {
      questionData.image_data = content;
    }

    const { data, error } = await supabase
      .from('questions')
      .insert([questionData])
      .select()
      .single();

    if (error) {
      console.error('Error saving question:', error);
      throw error;
    }

    console.log(`✅ Saved question ${questionNumber} to Supabase`);
    return data as Question;
  } catch (error) {
    console.error('saveQuestionToSupabase error:', error);
    throw error;
  }
}

/**
 * Save annotations (student lines + teacher annotations) to Supabase
 */
async function saveAnnotationsToSupabase(
  sessionId: string,
  questionId: string,
  participantId: string,
  studentLines: unknown[],
  teacherAnnotations: unknown[]
): Promise<boolean> {
  try {
    // Check if annotation already exists
    const { data: existing } = await supabase
      .from('annotations')
      .select('id')
      .eq('participant_id', participantId)
      .eq('question_id', questionId)
      .maybeSingle();

    if (existing) {
      // Update existing annotation
      const { error } = await supabase
        .from('annotations')
        .update({
          student_lines: studentLines || [],
          teacher_annotations: teacherAnnotations || [],
        })
        .eq('id', existing.id);

      if (error) throw error;
    } else {
      // Insert new annotation
      const { error } = await supabase
        .from('annotations')
        .insert([{
          session_id: sessionId,
          participant_id: participantId,
          question_id: questionId,
          student_lines: studentLines || [],
          teacher_annotations: teacherAnnotations || [],
        }]);

      if (error) throw error;
    }

    return true;
  } catch (error) {
    console.error('saveAnnotationsToSupabase error:', error);
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

  try {
    const body = req.body as PersistBody;
    const { sessionId, questionNumber, contentType, content, studentsData } = body;

    if (!sessionId || questionNumber === undefined) {
      res.status(400).json({ error: 'Missing required fields: sessionId, questionNumber' });
      return;
    }

    console.log(`📝 Persisting question ${questionNumber} for session ${sessionId}`);

    // Step 1: Create the question in Supabase
    const question = await saveQuestionToSupabase(sessionId, questionNumber, contentType, content);

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
            sessionId,
            studentId,
            studentName,
            'student'
          );

          // Save annotations to Supabase
          await saveAnnotationsToSupabase(
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
  }
}

