import { useQuery } from '@tanstack/react-query';
import type { Question } from '../db/client';

export const useQuestions = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['questions', sessionId],
    queryFn: async () => {
      if (!sessionId) {
        return [];
      }

      const response = await fetch(`/api/questions/${sessionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch questions');
      }
      const results = await response.json();
      return results as Question[];
    },
    enabled: !!sessionId,
  });
};
