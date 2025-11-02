import { useQuery } from '@tanstack/react-query';
import { sql } from '../db/client';
import type { Question } from '../db/client';

export const useQuestions = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['questions', sessionId],
    queryFn: async () => {
      if (!sessionId) {
        return [];
      }

      const results = await sql`
        SELECT * FROM questions
        WHERE session_id = ${sessionId}
        ORDER BY question_number ASC
      `;

      return results as Question[];
    },
    enabled: !!sessionId,
  });
};
