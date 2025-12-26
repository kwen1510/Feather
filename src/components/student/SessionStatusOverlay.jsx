import React from 'react';

const SessionStatusOverlay = ({ status, roomId, onBackToLogin }) => {
  if (!status || status === 'active') {
    return null;
  }

  if (status === 'loading') {
    return (
      <div className="session-overlay">
        <div className="session-message">
          <div className="session-spinner"></div>
          <h2>Connecting to session...</h2>
          <p>Please wait while we verify your session</p>
        </div>
      </div>
    );
  }

  if (status === 'waiting') {
    return (
      <div className="session-overlay">
        <div className="session-message">
          <div className="session-icon waiting">⏳</div>
          <h2>Waiting for teacher</h2>
          <p>Your teacher hasn&apos;t started the session yet. Please wait...</p>
        </div>
      </div>
    );
  }

  if (status === 'no-session') {
    return (
      <div className="session-overlay">
        <div className="session-message">
          <div className="session-icon waiting">🔍</div>
          <h2>No session found</h2>
          <p>There is no active session for room code &quot;{roomId}&quot;.</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Please make sure your teacher has started a session, or verify the room code is correct.
          </p>
          <button
            onClick={onBackToLogin}
            style={{
              marginTop: '1.5rem',
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'transform 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'scale(1)';
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div className="session-overlay">
        <div className="session-message">
          <div className="session-icon ended">✓</div>
          <h2>Session ended</h2>
          <p>Thank you for participating! The teacher has ended this session.</p>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', opacity: 0.8 }}>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return null;
};

export default SessionStatusOverlay;
