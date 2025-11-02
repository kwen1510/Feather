import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';

export const useQuestions = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['questions', sessionId],
    queryFn: async () => {
      if (!sessionId) {
        return [];
      }

      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('session_id', sessionId)
        .order('question_number', { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    },
    enabled: !!sessionId,
  });
};

