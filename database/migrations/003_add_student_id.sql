-- Migration: Add student_id column to participants table
-- Purpose: Support persistent student identity across browser refreshes
-- Date: 2025-10-28

-- Add student_id column to participants table
ALTER TABLE participants
ADD COLUMN IF NOT EXISTS student_id TEXT;

-- Create index for fast lookups by student_id
CREATE INDEX IF NOT EXISTS idx_participants_student_id
ON participants(student_id);

-- Add comment explaining the column
COMMENT ON COLUMN participants.student_id IS
  'Persistent student identifier (localStorage UUID), independent of client_id. Allows tracking students across browser refreshes and reconnections.';

-- Update existing participants to have a student_id (optional, for existing data)
-- This generates a student_id based on their client_id for backwards compatibility
UPDATE participants
SET student_id = 'student-migrated-' || client_id
WHERE student_id IS NULL AND role = 'student';

-- Note: Teachers don't need student_id, it will remain NULL for teacher participants
