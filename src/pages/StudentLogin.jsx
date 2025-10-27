import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './StudentLogin.css';

function StudentLogin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [sessionCode, setSessionCode] = useState((searchParams.get('room') || '').toUpperCase());
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
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

    // Navigate to student canvas with params
    navigate(`/student?room=${sessionCode.trim().toUpperCase()}&name=${encodeURIComponent(name.trim())}`);
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

          <button type="submit" className="join-button">
            Join Session
          </button>
        </form>
      </div>
    </div>
  );
}

export default StudentLogin;
