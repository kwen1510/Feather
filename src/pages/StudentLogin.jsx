import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import './StudentLogin.css';

const FEATHER_USERNAME_KEY = 'Feather_username';

function StudentLogin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [sessionCode, setSessionCode] = useState((searchParams.get('room') || '').toUpperCase());
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  // Load saved username from localStorage on mount
  useEffect(() => {
    const savedUsername = localStorage.getItem(FEATHER_USERNAME_KEY);
    if (savedUsername) {
      setName(savedUsername);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!sessionCode.trim()) {
      setError('Please enter a session code');
      return;
    }

    // Check if session exists and is active
    setIsChecking(true);
    setError('');

    try {
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, status, room_code')
        .eq('room_code', sessionCode.trim().toUpperCase())
        .single();

      if (sessionError || !session) {
        setError('Session does not exist. Please check your session code.');
        setIsChecking(false);
        return;
      }

      if (session.status === 'ended') {
        setError('This session has ended. Please contact your teacher.');
        setIsChecking(false);
        return;
      }

      // Session is valid, save username and navigate
      localStorage.setItem(FEATHER_USERNAME_KEY, name.trim());
      navigate(`/student?room=${sessionCode.trim().toUpperCase()}&name=${encodeURIComponent(name.trim())}`);
    } catch (err) {
      console.error('Error checking session:', err);
      setError('Failed to verify session. Please try again.');
      setIsChecking(false);
    }
  };

  return (
    <div className="student-login-page">
      <div className="student-login-card">
        <h1>Student Login</h1>
        <p className="login-subtitle">Join your classroom session to start drawing.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              autoFocus
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label htmlFor="sessionCode">Session code</label>
            <input
              id="sessionCode"
              type="text"
              placeholder="SESSION CODE (E.G., ABC123)"
              value={sessionCode}
              onChange={(e) => {
                setSessionCode(e.target.value.toUpperCase());
                setError('');
              }}
              maxLength={10}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="join-button" disabled={isChecking}>
            {isChecking ? 'Checking session...' : 'Join Session'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default StudentLogin;
