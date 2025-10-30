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
 * Get Redis key for an individual student stroke
 */
function getStudentStrokeKey(roomId, studentId, strokeId) {
  return `room:${roomId}:student:${studentId}:stroke:${strokeId}`;
}

/**
 * Get Redis key pattern for all student strokes
 */
function getStudentStrokesPattern(roomId, studentId) {
  return `room:${roomId}:student:${studentId}:stroke:*`;
}

/**
 * Get Redis key for an individual teacher annotation stroke
 * Includes studentId to associate annotation with specific student
 */
function getTeacherStrokeKey(roomId, studentId, strokeId) {
  return `room:${roomId}:teacher:${studentId}:stroke:${strokeId}`;
}

/**
 * Get Redis key pattern for all teacher strokes (all students)
 */
function getTeacherStrokesPattern(roomId) {
  return `room:${roomId}:teacher:*:stroke:*`;
}

/**
 * Get Redis key pattern for teacher strokes for specific student
 */
function getTeacherStrokesPatternForStudent(roomId, studentId) {
  return `room:${roomId}:teacher:${studentId}:stroke:*`;
}

/**
 * Get Redis key for student metadata
 */
function getStudentMetaKey(roomId, studentId) {
  return `room:${roomId}:student:${studentId}:meta`;
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

  // Handle POST /api/strokes/save - Save individual strokes to Redis
  if (req.url === '/api/strokes/save' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { roomId, strokes, party, studentId, studentName, annotations } = body;

      // party: 'student' or 'teacher'
      // strokes: array of stroke objects (for students), each with strokeId
      // annotations: object keyed by studentId (for teacher), each value is array of strokes

      if (!roomId || !party) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: roomId, party' }));
        return;
      }

      if (party === 'student' && (!studentId || !strokes)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing studentId or strokes for student party' }));
        return;
      }

      if (party === 'teacher' && !annotations) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing annotations for teacher party' }));
        return;
      }

      let savedCount = 0;

      if (party === 'teacher') {
        // Save teacher annotations grouped by studentId
        for (const [targetStudentId, annotationStrokes] of Object.entries(annotations)) {
          for (const stroke of annotationStrokes) {
            if (!stroke.strokeId) {
              console.warn('Annotation missing strokeId, skipping');
              continue;
            }

            const key = getTeacherStrokeKey(roomId, targetStudentId, stroke.strokeId);
            await redis.set(key, JSON.stringify(stroke), { ex: 86400 }); // 24 hour expiry
            savedCount++;
          }
        }
      } else {
        // Save student strokes
        for (const stroke of strokes) {
          if (!stroke.strokeId) {
            console.warn('Stroke missing strokeId, skipping');
            continue;
          }

          const key = getStudentStrokeKey(roomId, studentId, stroke.strokeId);
          await redis.set(key, JSON.stringify(stroke), { ex: 86400 }); // 24 hour expiry
          savedCount++;
        }

        // Save student metadata (name) for later reference
        if (studentName) {
          const metaKey = getStudentMetaKey(roomId, studentId);
          await redis.set(metaKey, JSON.stringify({ name: studentName }), { ex: 86400 });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, savedCount }));
    } catch (err) {
      console.error('Save strokes error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save strokes' }));
    }
    return;
  }

  // Handle GET /api/strokes/load - Load strokes by party from Redis
  if (req.url.startsWith('/api/strokes/load') && req.method === 'GET') {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const roomId = url.searchParams.get('roomId');
      const party = url.searchParams.get('party'); // 'teacher' or 'students'
      const studentId = url.searchParams.get('studentId'); // required if party=students

      if (!roomId || !party) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing roomId or party' }));
        return;
      }

      if (party === 'teacher') {
        // Load all teacher annotation strokes grouped by studentId
        const pattern = getTeacherStrokesPattern(roomId);
        let keys = [];

        try {
          const scanResult = await redis.keys(pattern);
          keys = Array.isArray(scanResult) ? scanResult : [];
        } catch (scanError) {
          console.warn('Redis keys scan failed:', scanError.message);
          keys = [];
        }

        // Group annotations by studentId
        // Key format: room:{roomId}:teacher:{studentId}:stroke:{strokeId}
        const annotations = {};
        for (const key of keys) {
          try {
            // Extract studentId from key
            const parts = key.split(':');
            const studentId = parts[3]; // room:{roomId}:teacher:{studentId}:stroke:{strokeId}

            const strokeData = await redis.get(key);
            if (strokeData) {
              const stroke = typeof strokeData === 'string' ? JSON.parse(strokeData) : strokeData;

              if (!annotations[studentId]) {
                annotations[studentId] = [];
              }
              annotations[studentId].push(stroke);
            }
          } catch (parseError) {
            console.error(`Error parsing stroke from key ${key}:`, parseError.message);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ party: 'teacher', annotations }));
        return;
      }

      if (party === 'students') {
        // Load all students' strokes for this room
        // Get all unique student IDs first by scanning for meta keys
        const metaPattern = `room:${roomId}:student:*:meta`;
        let metaKeys = [];
        
        try {
          const scanResult = await redis.keys(metaPattern);
          metaKeys = Array.isArray(scanResult) ? scanResult : [];
        } catch (scanError) {
          console.warn('Redis keys scan failed:', scanError.message);
          metaKeys = [];
        }

        const studentsData = {};

        for (const metaKey of metaKeys) {
          // Extract studentId from meta key
          const parts = metaKey.split(':');
          if (parts.length < 4) continue;
          const sid = parts[3];

          // Load all strokes for this student
          const strokePattern = getStudentStrokesPattern(roomId, sid);
          let strokeKeys = [];
          
          try {
            const scanResult = await redis.keys(strokePattern);
            strokeKeys = Array.isArray(scanResult) ? scanResult : [];
          } catch (scanError) {
            console.warn(`Failed to scan strokes for student ${sid}`);
            strokeKeys = [];
          }

          const studentStrokes = [];
          for (const strokeKey of strokeKeys) {
            try {
              const strokeData = await redis.get(strokeKey);
              if (strokeData) {
                const stroke = typeof strokeData === 'string' ? JSON.parse(strokeData) : strokeData;
                studentStrokes.push(stroke);
              }
            } catch (parseError) {
              console.error(`Error parsing stroke for student ${sid}:`, parseError.message);
            }
          }

          // Get student metadata
          let meta = {};
          try {
            const metaData = await redis.get(metaKey);
            if (metaData) {
              meta = typeof metaData === 'string' ? JSON.parse(metaData) : metaData;
            }
          } catch (parseError) {
            console.error(`Error parsing meta for student ${sid}:`, parseError.message);
          }

          studentsData[sid] = {
            studentId: sid,
            strokes: studentStrokes,
            meta
          };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ party: 'students', students: studentsData }));
        return;
      }

      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid party. Must be "teacher" or "students"' }));
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

      // Step 2: Load all student data from Redis (using new individual stroke structure)
      const metaPattern = `room:${roomId}:student:*:meta`;
      let metaKeys = [];
      
      try {
        const scanResult = await redis.keys(metaPattern);
        metaKeys = Array.isArray(scanResult) ? scanResult : [];
      } catch (scanError) {
        console.warn('Redis keys scan failed:', scanError.message);
        metaKeys = [];
      }
      
      let savedCount = 0;
      for (const metaKey of metaKeys) {
        const parts = metaKey.split(':');
        if (parts.length < 4) continue;
        
        const studentId = parts[3];
        
        // Load all student strokes
        const studentStrokePattern = getStudentStrokesPattern(roomId, studentId);
        let studentStrokeKeys = [];
        
        try {
          const scanResult = await redis.keys(studentStrokePattern);
          studentStrokeKeys = Array.isArray(scanResult) ? scanResult : [];
        } catch (scanError) {
          console.warn(`Failed to scan student strokes for ${studentId}`);
          studentStrokeKeys = [];
        }

        const studentLines = [];
        for (const strokeKey of studentStrokeKeys) {
          try {
            const strokeData = await redis.get(strokeKey);
            if (strokeData) {
              const stroke = typeof strokeData === 'string' ? JSON.parse(strokeData) : strokeData;
              studentLines.push(stroke);
            }
          } catch (parseError) {
            console.error(`Error parsing student stroke:`, parseError.message);
          }
        }

        // Load all teacher annotation strokes
        const teacherStrokePattern = getTeacherStrokesPattern(roomId);
        let teacherStrokeKeys = [];
        
        try {
          const scanResult = await redis.keys(teacherStrokePattern);
          teacherStrokeKeys = Array.isArray(scanResult) ? scanResult : [];
        } catch (scanError) {
          console.warn('Failed to scan teacher strokes');
          teacherStrokeKeys = [];
        }

        const teacherAnnotations = [];
        for (const strokeKey of teacherStrokeKeys) {
          try {
            const strokeData = await redis.get(strokeKey);
            if (strokeData) {
              const stroke = typeof strokeData === 'string' ? JSON.parse(strokeData) : strokeData;
              teacherAnnotations.push(stroke);
            }
          } catch (parseError) {
            console.error(`Error parsing teacher stroke:`, parseError.message);
          }
        }

        // Get student metadata
        let studentMeta = {};
        try {
          const metaData = await redis.get(metaKey);
          if (metaData) {
            studentMeta = typeof metaData === 'string' ? JSON.parse(metaData) : metaData;
          }
        } catch (parseError) {
          console.error(`Error parsing meta for student ${studentId}:`, parseError.message);
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

      // Delete all Redis keys for this room (individual stroke structure)
      const patterns = [
        `room:${roomId}:student:*:stroke:*`,  // All student strokes
        `room:${roomId}:student:*:meta`,       // Student metadata
        `room:${roomId}:teacher:*:stroke:*`    // All teacher strokes (grouped by studentId)
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
