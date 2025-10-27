-- Migration to fix participants table column name
-- Run this in Supabase SQL Editor

-- Check if student_name column exists and rename it to name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants'
    AND column_name = 'student_name'
  ) THEN
    ALTER TABLE participants RENAME COLUMN student_name TO name;
    RAISE NOTICE '✅ Renamed student_name to name';
  END IF;
END $$;

-- If name column doesn't exist, add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants'
    AND column_name = 'name'
  ) THEN
    ALTER TABLE participants ADD COLUMN name TEXT;
    RAISE NOTICE '✅ Added name column';
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Migration completed successfully!';
  RAISE NOTICE 'The participants table now has a "name" column.';
END $$;
