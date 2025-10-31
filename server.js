import { createServer } from 'http';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

const require = createRequire(import.meta.url);
const Ably = require('ably/promises');

const PORT = 8080;

// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

// Helper function to parse request body
const parseBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
};

// ==================== SUPABASE HELPER FUNCTIONS ====================

/**
 * Get or create a participant record in Supabase
 */
async function getOrCreateParticipant(sessionId, studentId, name, role) {
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
      return existing;
    }

    // Create new participant
    const { data: newParticipant, error: insertError } = await supabase
      .from('participants')
      .insert([{
        session_id: sessionId,
        client_id: `${role}-${Date.now()}`,
        student_id: studentId,
        role: role,
        student_name: name,
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Error creating participant:', insertError);
      throw insertError;
    }

    return newParticipant;
  } catch (error) {
    console.error('getOrCreateParticipant error:', error);
    throw error;
  }
}

/**
 * Save a question to Supabase
 */
async function saveQuestionToSupabase(sessionId, questionNumber, contentType, content) {
  try {
    const questionData = {
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
    return data;
  } catch (error) {
    console.error('saveQuestionToSupabase error:', error);
    throw error;
  }
}

/**
 * Save annotations (student lines + teacher annotations) to Supabase
 */
async function saveAnnotationsToSupabase(sessionId, questionId, participantId, studentLines, teacherAnnotations) {
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

const server = createServer(async (req, res) => {
  // Enable CORS for Vite dev server
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle /api/token endpoint
  if (req.url.startsWith('/api/token')) {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const clientId = url.searchParams.get('clientId') || `client-${Date.now()}`;

      const client = new Ably.Rest({ key: process.env.ABLY_API_KEY });
      const tokenRequest = await client.auth.createTokenRequest({ clientId });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tokenRequest));
    } catch (err) {
      console.error('Token error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to create Ably token' }));
    }
    return;
  }

  // Handle POST /api/strokes/persist - Save IndexedDB data to Supabase
  if (req.url === '/api/strokes/persist' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { sessionId, questionNumber, contentType, content, studentsData } = body;

      if (!sessionId || questionNumber === undefined) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: sessionId, questionNumber' }));
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
          if (studentLines.length > 0 || teacherAnnotations.length > 0) {
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
              studentLines,
              teacherAnnotations
            );

            savedCount++;
          }
        }
      }

      console.log(`✅ Persisted ${savedCount} student responses for question ${questionNumber}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        questionId: question.id,
        savedCount
      }));
    } catch (err) {
      console.error('Persist strokes error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to persist strokes', details: err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end('404 Not Found');
});

server.listen(PORT, () => {
  console.log(`\n🚀 Ably Token Server running on http://localhost:${PORT}\n`);
  console.log('📝 Providing authentication tokens for Ably\n');
  console.log('✨ Press Ctrl+C to stop the server\n');
});
