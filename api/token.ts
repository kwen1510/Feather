import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Ably = require('ably/promises');

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

  try {
    const clientId = typeof req.query.clientId === 'string' 
      ? req.query.clientId 
      : `client-${Date.now()}`;

    if (!process.env.ABLY_API_KEY) {
      throw new Error('ABLY_API_KEY environment variable is not set');
    }

    const client = new Ably.Rest({ key: process.env.ABLY_API_KEY });
    const tokenRequest = await client.auth.createTokenRequest({ clientId });

    res.status(200).json(tokenRequest);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Token error:', err);
    res.status(500).json({ error: 'Failed to create Ably token', details: errorMessage });
  }
}

