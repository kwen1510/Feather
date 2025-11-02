import { useQuery } from '@tanstack/react-query';
import type { AnnotationWithParticipant } from '../db/client';

export const useResponses = (questionId: string | null) => {
  return useQuery({
    queryKey: ['responses', questionId],
    queryFn: async () => {
      if (!questionId) {
        return [];
      }

      const response = await fetch(`/api/responses/${questionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch responses');
      }
      const results = await response.json();
      return results as AnnotationWithParticipant[];
    },
    enabled: !!questionId,
  });
};
