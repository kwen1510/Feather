import { useQuery } from '@tanstack/react-query';
import { sql } from '../db/client';
import type { Session } from '../db/client';

export const useSessions = () => {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const results = await sql`
        SELECT * FROM sessions
        ORDER BY created_at DESC
      `;

      return results as Session[];
    },
  });
};
