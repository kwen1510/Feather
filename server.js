import { createServer } from 'http';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import { Redis } from '@upstash/redis';

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

const server = createServer(async (req, res) => {
  // Enable CORS for Vite dev server
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

  // Handle /api/strokes/save endpoint (POST)
  if (req.url === '/api/strokes/save' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { sessionId, questionId, userId, role, strokes } = body;

      if (!sessionId || !questionId || !userId || !role || !Array.isArray(strokes)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields' }));
        return;
      }

      // Save strokes to Redis with 24-hour TTL
      const key = `strokes:${sessionId}:${questionId}:${userId}:${role}`;
      await redis.set(key, JSON.stringify(strokes), { ex: 86400 }); // 24 hours

      console.log(`💾 Saved ${strokes.length} ${role} strokes for user ${userId}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: strokes.length }));
    } catch (err) {
      console.error('Save strokes error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save strokes' }));
    }
    return;
  }

  // Handle /api/strokes/load endpoint (GET)
  if (req.url.startsWith('/api/strokes/load') && req.method === 'GET') {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const sessionId = url.searchParams.get('sessionId');
      const questionId = url.searchParams.get('questionId');
      const userId = url.searchParams.get('userId');

      if (!sessionId || !questionId || !userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required parameters' }));
        return;
      }

      // Load both student strokes and teacher annotations
      const studentKey = `strokes:${sessionId}:${questionId}:${userId}:student`;
      const teacherKey = `strokes:${sessionId}:${questionId}:${userId}:teacher`;

      const [studentStrokes, teacherStrokes] = await Promise.all([
        redis.get(studentKey),
        redis.get(teacherKey)
      ]);

      // Upstash Redis client automatically deserializes JSON, no need to parse
      const finalStudentStrokes = studentStrokes || [];
      const finalTeacherStrokes = teacherStrokes || [];

      console.log(`📂 Loaded ${finalStudentStrokes.length} student strokes + ${finalTeacherStrokes.length} teacher strokes for user ${userId}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ studentStrokes: finalStudentStrokes, teacherStrokes: finalTeacherStrokes }));
    } catch (err) {
      console.error('Load strokes error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load strokes' }));
    }
    return;
  }

  // Handle /api/strokes/clear endpoint (DELETE)
  if (req.url === '/api/strokes/clear' && req.method === 'DELETE') {
    try {
      const body = await parseBody(req);
      const { sessionId, questionId, userId, role } = body;

      if (!sessionId || !questionId || !userId || !role) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields' }));
        return;
      }

      // Clear strokes from Redis
      const key = `strokes:${sessionId}:${questionId}:${userId}:${role}`;
      await redis.del(key);

      console.log(`🗑️ Cleared ${role} strokes for user ${userId}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
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
