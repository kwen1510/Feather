import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from '@neondatabase/serverless';

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

  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    res.status(500).json({ error: 'POSTGRES_URL environment variable is not set' });
    return;
  }

  const pool = new Pool({ connectionString });

  try {
    // Use inline schema (matches neon-schema.sql in project root)
    // File reading may not work reliably in Vercel serverless environment
    const schemaSQL = `
-- Feather Classroom Database Schema for Neon Postgres
-- Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT UNIQUE NOT NULL,
  teacher_name TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'active', 'ended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Optimized indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_room_code ON sessions(room_code);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);

-- Participants Table
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  student_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  name TEXT,
  is_flagged BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE
);

-- Optimized indexes for participants
CREATE INDEX IF NOT EXISTS idx_participants_session_id ON participants(session_id);
CREATE INDEX IF NOT EXISTS idx_participants_client_id ON participants(client_id);
CREATE INDEX IF NOT EXISTS idx_participants_student_id ON participants(student_id);
CREATE INDEX IF NOT EXISTS idx_participants_session_student ON participants(session_id, student_id);
CREATE INDEX IF NOT EXISTS idx_participants_role ON participants(role);

-- Questions Table
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('blank', 'template', 'image')),
  template_type TEXT CHECK (template_type IN ('hanzi', 'graph-corner', 'graph-cross')),
  image_data JSONB,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Optimized indexes for questions
CREATE INDEX IF NOT EXISTS idx_questions_session_id ON questions(session_id);
CREATE INDEX IF NOT EXISTS idx_questions_session_number ON questions(session_id, question_number);

-- Annotations Table
CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  student_lines JSONB DEFAULT '[]'::jsonb NOT NULL,
  teacher_annotations JSONB DEFAULT '[]'::jsonb NOT NULL,
  is_flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Optimized indexes for annotations
CREATE INDEX IF NOT EXISTS idx_annotations_session_id ON annotations(session_id);
CREATE INDEX IF NOT EXISTS idx_annotations_participant_id ON annotations(participant_id);
CREATE INDEX IF NOT EXISTS idx_annotations_question_id ON annotations(question_id);
CREATE INDEX IF NOT EXISTS idx_annotations_question_created ON annotations(question_id, created_at);

-- Create a unique constraint to ensure one annotation per participant per question
CREATE UNIQUE INDEX IF NOT EXISTS idx_annotations_participant_question
  ON annotations(participant_id, question_id);

-- Function to update last_updated_at timestamp
CREATE OR REPLACE FUNCTION update_last_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update last_updated_at
DROP TRIGGER IF EXISTS update_annotations_last_updated_at ON annotations;
CREATE TRIGGER update_annotations_last_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_last_updated_at();
`;

    // Split SQL into individual statements
    // Handle dollar-quoted strings properly (they can contain semicolons)
    const statements: string[] = [];
    let currentStatement = '';
    let inDollarQuote = false;
    let dollarTag = '';
    
    const lines = schemaSQL.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('--')) {
        continue;
      }
      
      // Check for dollar-quoted strings ($$ or $tag$)
      if (!inDollarQuote) {
        const dollarMatch = trimmed.match(/\$([^$]*)\$/);
        if (dollarMatch) {
          inDollarQuote = true;
          dollarTag = dollarMatch[1];
        }
      } else {
        // Check if we're closing the dollar quote
        if (trimmed.includes(`$${dollarTag}$`)) {
          inDollarQuote = false;
          dollarTag = '';
        }
      }
      
      currentStatement += line + '\n';
      
      // Only split on semicolon if we're not in a dollar-quoted string
      if (!inDollarQuote && trimmed.endsWith(';')) {
        const stmt = currentStatement.trim();
        if (stmt.length > 0) {
          statements.push(stmt);
        }
        currentStatement = '';
      }
    }
    
    // Add any remaining statement
    if (currentStatement.trim().length > 0) {
      statements.push(currentStatement.trim());
    }

    const results: Array<{ statement: string; status: string }> = [];
    for (const statement of statements) {
      if (statement) {
        try {
          await pool.query(statement);
          results.push({ statement: statement.substring(0, 50) + '...', status: 'success' });
        } catch (stmtError: any) {
          // Ignore "already exists" errors for IF NOT EXISTS statements
          if (stmtError?.code === '42P07' || stmtError?.message?.includes('already exists')) {
            results.push({ statement: statement.substring(0, 50) + '...', status: 'skipped (already exists)' });
          } else {
            throw stmtError;
          }
        }
      }
    }

    // Verify tables were created
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('sessions', 'participants', 'questions', 'annotations')
      ORDER BY table_name
    `);

    const createdTables = tablesCheck.rows.map(row => row.table_name);

    res.status(200).json({
      success: true,
      message: 'Database schema initialized successfully',
      tablesCreated: createdTables,
      statementsExecuted: results.length,
      details: results
    });
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Database initialization error:', err);
    res.status(500).json({ 
      error: 'Failed to initialize database schema', 
      details: errorMessage,
      code: err?.code
    });
  } finally {
    await pool.end();
  }
}

