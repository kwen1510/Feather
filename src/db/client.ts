import { neon } from '@neondatabase/serverless';
import { Pool } from '@neondatabase/serverless';

// Get connection string from environment variables
// Vercel automatically provides POSTGRES_URL when Neon is integrated
const connectionString = import.meta.env.VITE_POSTGRES_URL || import.meta.env.POSTGRES_URL;

if (!connectionString) {
  console.error('Missing POSTGRES_URL environment variable. Please check your .env file.');
}

// For frontend/client-side queries (HTTP-based, low latency)
// Use this for React Query hooks that run in the browser
export const sql = neon(connectionString || '');

// For server-side/serverless functions (connection pooling)
// Use this in API routes and serverless functions
export function createPool() {
  if (!connectionString) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  return new Pool({ connectionString });
}

// Type definitions for database tables
export interface Session {
  id: string;
  room_code: string;
  teacher_name: string | null;
  status: 'created' | 'active' | 'ended';
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface Participant {
  id: string;
  session_id: string;
  client_id: string;
  student_id: string | null;
  role: 'teacher' | 'student';
  name: string | null;
  is_flagged: boolean;
  joined_at: string;
  left_at: string | null;
}

export interface Question {
  id: string;
  session_id: string;
  question_number: number;
  content_type: 'blank' | 'template' | 'image';
  template_type: 'hanzi' | 'graph-corner' | 'graph-cross' | null;
  image_data: unknown | null;
  sent_at: string;
}

export interface Annotation {
  id: string;
  session_id: string;
  participant_id: string;
  question_id: string;
  student_lines: unknown[];
  teacher_annotations: unknown[];
  is_flagged: boolean;
  created_at: string;
  last_updated_at: string;
}

export interface AnnotationWithParticipant extends Annotation {
  participant: Participant;
}

