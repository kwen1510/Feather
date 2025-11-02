import { useQuery } from '@tanstack/react-query';
import { sql } from '../db/client';
import type { AnnotationWithParticipant } from '../db/client';

export const useResponses = (questionId: string | null) => {
  return useQuery({
    queryKey: ['responses', questionId],
    queryFn: async () => {
      if (!questionId) {
        return [];
      }

      const results = await sql`
        SELECT 
          a.id,
          a.student_lines,
          a.teacher_annotations,
          a.created_at,
          a.last_updated_at,
          json_build_object(
            'id', p.id,
            'name', p.name,
            'student_id', p.student_id,
            'client_id', p.client_id,
            'role', p.role
          ) as participant
        FROM annotations a
        INNER JOIN participants p ON a.participant_id = p.id
        WHERE a.question_id = ${questionId}
          AND p.role = 'student'
        ORDER BY a.created_at ASC
      `;

      return results as AnnotationWithParticipant[];
    },
    enabled: !!questionId,
  });
};
