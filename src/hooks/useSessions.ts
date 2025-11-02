import { useQuery } from '@tanstack/react-query';
import type { Session } from '../db/client';

export const useSessions = () => {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const response = await fetch('/api/sessions');
      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }
      const results = await response.json();
      return results as Session[];
    },
  });
};
