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

    setIsChecking(true);
    setError('');

    // Ping teacher channel to check if session is active
    // This is more reliable than checking Supabase
    try {
      console.log('🔍 [STUDENT LOGIN] Pinging teacher channel:', sessionCode.trim().toUpperCase());

      const Ably = (await import('ably/promises')).default;
      const ably = new Ably.Realtime({
        authUrl: '/api/token',
        authParams: { clientId: `ping-${Date.now()}` },
      });

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        ably.connection.once('connected', () => {
          clearTimeout(timeout);
          resolve();
        });

        ably.connection.once('failed', () => {
          clearTimeout(timeout);
          reject(new Error('Connection failed'));
        });
      });

      const channel = ably.channels.get(`room-${sessionCode.trim().toUpperCase()}`);

      // Check if teacher is present
      const members = await channel.presence.get();
      console.log('👥 [STUDENT LOGIN] Found', members.length, 'members in channel');

      const teacherPresent = members.some(member => member.clientId.startsWith('teacher-'));

      ably.close();

      if (!teacherPresent) {
        setError('No active teacher found. Please check your session code or ask your teacher to start the session.');
        setIsChecking(false);
        return;
      }

      console.log('✅ [STUDENT LOGIN] Teacher is present, allowing login');

      // Teacher is present, save username and navigate
      localStorage.setItem(FEATHER_USERNAME_KEY, name.trim());
      navigate(`/student?room=${sessionCode.trim().toUpperCase()}&name=${encodeURIComponent(name.trim())}`);
    } catch (err) {
      console.error('❌ [STUDENT LOGIN] Error checking teacher presence:', err);
      setError('Failed to connect to session. Please check your internet connection and try again.');
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
