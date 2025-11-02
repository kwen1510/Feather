import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';

export const useResponses = (questionId: string | null) => {
  return useQuery({
    queryKey: ['responses', questionId],
    queryFn: async () => {
      if (!questionId) {
        return [];
      }

      const { data, error } = await supabase
        .from('annotations')
        .select(
          `
            id,
            student_lines,
            teacher_annotations,
            created_at,
            last_updated_at,
            participant:participants!inner (
              id,
              name,
              student_id,
              client_id,
              role
            )
          `
        )
        .eq('question_id', questionId)
        .eq('participant.role', 'student')
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    },
    enabled: !!questionId,
  });
};

