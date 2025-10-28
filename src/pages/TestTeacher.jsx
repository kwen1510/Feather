import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

function TestTeacher() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const room = searchParams.get('room') || 'load-test';
    navigate(`/teacher?room=${room}`, { replace: true });
  }, [navigate, searchParams]);

  return <div style={{ padding: '20px', textAlign: 'center' }}>Redirecting to teacher dashboard...</div>;
}

export default TestTeacher;
