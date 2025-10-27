-- Feather Classroom Database Schema
-- Run this in your Supabase SQL Editor: https://app.supabase.com/project/_/sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessions Table
-- Tracks each classroom session created by a teacher
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_code TEXT UNIQUE NOT NULL,
  teacher_name TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'active', 'ended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Create index on room_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_sessions_room_code ON sessions(room_code);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Participants Table
-- Tracks all teachers and students who join a session
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  student_name TEXT,
  is_flagged BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_participants_session_id ON participants(session_id);
CREATE INDEX IF NOT EXISTS idx_participants_client_id ON participants(client_id);

-- Questions Table
-- Tracks each piece of content (blank/template/image) sent by teacher
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('blank', 'template', 'image')),
  template_type TEXT CHECK (template_type IN ('hanzi', 'graph-corner', 'graph-cross')),
  image_data JSONB,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_questions_session_id ON questions(session_id);

-- Annotations Table
-- Stores student drawings and teacher feedback for each question
CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  student_lines JSONB DEFAULT '[]'::jsonb,
  teacher_annotations JSONB DEFAULT '[]'::jsonb,
  is_flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_annotations_session_id ON annotations(session_id);
CREATE INDEX IF NOT EXISTS idx_annotations_participant_id ON annotations(participant_id);
CREATE INDEX IF NOT EXISTS idx_annotations_question_id ON annotations(question_id);

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

-- Row Level Security (RLS) Policies
-- Enable RLS on all tables
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

-- Allow public read access (since we're using anon key)
CREATE POLICY "Allow public read access on sessions"
  ON sessions FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on sessions"
  ON sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on sessions"
  ON sessions FOR UPDATE
  USING (true);

CREATE POLICY "Allow public read access on participants"
  ON participants FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on participants"
  ON participants FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on participants"
  ON participants FOR UPDATE
  USING (true);

CREATE POLICY "Allow public read access on questions"
  ON questions FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on questions"
  ON questions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public read access on annotations"
  ON annotations FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on annotations"
  ON annotations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on annotations"
  ON annotations FOR UPDATE
  USING (true);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Database schema created successfully!';
  RAISE NOTICE 'Tables created: sessions, participants, questions, annotations';
  RAISE NOTICE 'You can now use the Feather Classroom app with Supabase!';
END $$;
