import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

function TestStudent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const room = searchParams.get('room') || 'load-test';
    navigate(`/student?room=${room}`, { replace: true });
  }, [navigate, searchParams]);

  return <div style={{ padding: '20px', textAlign: 'center' }}>Redirecting to student view...</div>;
}

export default TestStudent;
