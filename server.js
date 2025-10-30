import { createServer } from 'http';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

const require = createRequire(import.meta.url);
const Ably = require('ably/promises');

const PORT = 8080;

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

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

// ==================== REDIS HELPER FUNCTIONS ====================

/**
 * Get Redis key for student lines
 */
function getStudentLinesKey(roomId, studentId) {
  return `room:${roomId}:student:${studentId}:lines`;
}

/**
 * Get Redis key for teacher annotations for a specific student
 */
function getTeacherAnnotationsKey(roomId, studentId) {
  return `room:${roomId}:teacher:annotations:${studentId}`;
}

/**
 * Get Redis key for current question metadata
 */
function getQuestionMetaKey(roomId) {
  return `room:${roomId}:question:meta`;
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

  // Handle POST /api/strokes/save - Save strokes to Redis
  if (req.url === '/api/strokes/save' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { roomId, studentId, lines, annotations, studentName } = body;

      if (!roomId || !studentId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing roomId or studentId' }));
        return;
      }

      // Save student lines to Redis
      if (lines !== undefined) {
        const key = getStudentLinesKey(roomId, studentId);
        await redis.set(key, JSON.stringify(lines), { ex: 86400 }); // 24 hour expiry
      }

      // Save teacher annotations to Redis (if provided)
      if (annotations !== undefined) {
        const key = getTeacherAnnotationsKey(roomId, studentId);
        await redis.set(key, JSON.stringify(annotations), { ex: 86400 });
      }

      // Save student metadata (name) for later reference
      if (studentName) {
        const metaKey = `room:${roomId}:student:${studentId}:meta`;
        await redis.set(metaKey, JSON.stringify({ name: studentName }), { ex: 86400 });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error('Save strokes error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save strokes' }));
    }
    return;
  }

  // Handle GET /api/strokes/load - Load strokes from Redis
  if (req.url.startsWith('/api/strokes/load') && req.method === 'GET') {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const roomId = url.searchParams.get('roomId');
      const studentId = url.searchParams.get('studentId');

      if (!roomId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing roomId' }));
        return;
      }

      // If studentId provided, load specific student's data
      if (studentId) {
        const linesKey = getStudentLinesKey(roomId, studentId);
        const annotationsKey = getTeacherAnnotationsKey(roomId, studentId);

        try {
          const [lines, annotations] = await Promise.all([
            redis.get(linesKey),
            redis.get(annotationsKey)
          ]);

          // Handle Redis returning null, objects, or strings
          let parsedLines = [];
          let parsedAnnotations = [];

          if (lines) {
            parsedLines = typeof lines === 'string' ? JSON.parse(lines) : (Array.isArray(lines) ? lines : []);
          }
          
          if (annotations) {
            parsedAnnotations = typeof annotations === 'string' ? JSON.parse(annotations) : (Array.isArray(annotations) ? annotations : []);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            studentId,
            lines: parsedLines,
            annotations: parsedAnnotations
          }));
        } catch (parseError) {
          console.error(`Error loading data for student ${studentId}:`, parseError.message);
          // Return empty data if parsing fails
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            studentId,
            lines: [],
            annotations: []
          }));
        }
        return;
      }

      // If no studentId, load all students' data for this room (for teacher)
      // Use scan instead of keys for better Upstash compatibility
      const pattern = `room:${roomId}:student:*:lines`;
      let keys = [];
      
      try {
        const scanResult = await redis.keys(pattern);
        // Upstash returns array directly
        keys = Array.isArray(scanResult) ? scanResult : [];
      } catch (scanError) {
        console.warn('Redis keys scan failed, trying alternative:', scanError.message);
        // If keys fails, return empty (no cached data)
        keys = [];
      }
      
      const studentsData = {};
      
      if (keys.length > 0) {
        for (const key of keys) {
          // Extract studentId from key: room:roomId:student:studentId:lines
          const parts = key.split(':');
          if (parts.length < 4) continue; // Skip invalid keys
          
          const sid = parts[3];
          
          const linesKey = getStudentLinesKey(roomId, sid);
          const annotationsKey = getTeacherAnnotationsKey(roomId, sid);
          const metaKey = `room:${roomId}:student:${sid}:meta`;

          try {
            const [lines, annotations, meta] = await Promise.all([
              redis.get(linesKey),
              redis.get(annotationsKey),
              redis.get(metaKey)
            ]);

            studentsData[sid] = {
              studentId: sid,
              lines: lines ? (typeof lines === 'string' ? JSON.parse(lines) : lines) : [],
              annotations: annotations ? (typeof annotations === 'string' ? JSON.parse(annotations) : annotations) : [],
              meta: meta ? (typeof meta === 'string' ? JSON.parse(meta) : meta) : {}
            };
          } catch (parseError) {
            console.error(`Error loading data for student ${sid}:`, parseError.message);
            // Skip this student if data is corrupted
            continue;
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ students: studentsData }));
    } catch (err) {
      console.error('Load strokes error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load strokes' }));
    }
    return;
  }

  // Handle POST /api/strokes/persist - Move Redis data to Supabase
  if (req.url === '/api/strokes/persist' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { roomId, sessionId, questionNumber, contentType, content } = body;

      if (!roomId || !sessionId || questionNumber === undefined) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields' }));
        return;
      }

      console.log(`📝 Persisting question ${questionNumber} for session ${sessionId}`);

      // Step 1: Create the question in Supabase
      const question = await saveQuestionToSupabase(sessionId, questionNumber, contentType, content);

      // Step 2: Load all student data from Redis
      const pattern = `room:${roomId}:student:*:lines`;
      let keys = [];
      
      try {
        const scanResult = await redis.keys(pattern);
        keys = Array.isArray(scanResult) ? scanResult : [];
      } catch (scanError) {
        console.warn('Redis keys scan failed:', scanError.message);
        keys = [];
      }
      
      let savedCount = 0;
      for (const key of keys) {
        const parts = key.split(':');
        if (parts.length < 4) continue;
        
        const studentId = parts[3];
        
        const linesKey = getStudentLinesKey(roomId, studentId);
        const annotationsKey = getTeacherAnnotationsKey(roomId, studentId);
        const metaKey = `room:${roomId}:student:${studentId}:meta`;

        let studentLines = [];
        let teacherAnnotations = [];
        let studentMeta = {};

        try {
          const [lines, annotations, meta] = await Promise.all([
            redis.get(linesKey),
            redis.get(annotationsKey),
            redis.get(metaKey)
          ]);

          studentLines = lines ? (typeof lines === 'string' ? JSON.parse(lines) : lines) : [];
          teacherAnnotations = annotations ? (typeof annotations === 'string' ? JSON.parse(annotations) : annotations) : [];
          studentMeta = meta ? (typeof meta === 'string' ? JSON.parse(meta) : meta) : {};
        } catch (parseError) {
          console.error(`Error parsing data for student ${studentId}:`, parseError.message);
          continue;
        }

        // Only save if there's actual content
        if (studentLines.length > 0 || teacherAnnotations.length > 0) {
          // Get or create participant
          const participant = await getOrCreateParticipant(
            sessionId,
            studentId,
            studentMeta.name || 'Unknown Student',
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

  // Handle DELETE /api/strokes/clear - Clear Redis data after persisting
  if (req.url.startsWith('/api/strokes/clear') && req.method === 'DELETE') {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const roomId = url.searchParams.get('roomId');

      if (!roomId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing roomId' }));
        return;
      }

      // Delete all Redis keys for this room
      const patterns = [
        `room:${roomId}:student:*:lines`,
        `room:${roomId}:student:*:meta`,
        `room:${roomId}:teacher:annotations:*`,
        `room:${roomId}:question:meta`
      ];

      let deletedCount = 0;
      for (const pattern of patterns) {
        try {
          const scanResult = await redis.keys(pattern);
          const keys = Array.isArray(scanResult) ? scanResult : [];
          
          for (const key of keys) {
            await redis.del(key);
            deletedCount++;
          }
        } catch (error) {
          console.warn(`Failed to clear pattern ${pattern}:`, error.message);
        }
      }

      console.log(`🗑️ Cleared ${deletedCount} Redis keys for room ${roomId}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, deletedCount }));
    } catch (err) {
      console.error('Clear strokes error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to clear strokes' }));
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
