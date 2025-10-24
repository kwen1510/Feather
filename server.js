import { createServer } from 'http';
import { createRequire } from 'module';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const require = createRequire(import.meta.url);
const Ably = require('ably/promises');

const PORT = 8080;

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

  res.writeHead(404);
  res.end('404 Not Found');
});

server.listen(PORT, () => {
  console.log(`\n🚀 Ably Token Server running on http://localhost:${PORT}\n`);
  console.log('📝 Providing authentication tokens for Ably\n');
  console.log('✨ Press Ctrl+C to stop the server\n');
});
