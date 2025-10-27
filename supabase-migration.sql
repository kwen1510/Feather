-- Migration to fix table column names
-- Run this in Supabase SQL Editor

-- Fix participants table: rename student_name to name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants'
    AND column_name = 'student_name'
  ) THEN
    ALTER TABLE participants RENAME COLUMN student_name TO name;
    RAISE NOTICE '✅ Renamed participants.student_name to name';
  END IF;
END $$;

-- If name column doesn't exist in participants, add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants'
    AND column_name = 'name'
  ) THEN
    ALTER TABLE participants ADD COLUMN name TEXT;
    RAISE NOTICE '✅ Added name column to participants';
  END IF;
END $$;

-- Fix annotations table: ensure we have student_lines (not student_work)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'annotations'
    AND column_name = 'student_work'
  ) THEN
    ALTER TABLE annotations RENAME COLUMN student_work TO student_lines;
    RAISE NOTICE '✅ Renamed annotations.student_work to student_lines';
  END IF;
END $$;

-- If student_lines doesn't exist in annotations, add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'annotations'
    AND column_name = 'student_lines'
  ) THEN
    ALTER TABLE annotations ADD COLUMN student_lines JSONB DEFAULT '[]'::jsonb;
    RAISE NOTICE '✅ Added student_lines column to annotations';
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Migration completed successfully!';
  RAISE NOTICE 'Fixed column names in participants and annotations tables.';
END $$;
