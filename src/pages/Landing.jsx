import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css';

function Landing() {
  const navigate = useNavigate();
  const [showStudentLogin, setShowStudentLogin] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [roomCode, setRoomCode] = useState('demo');

  const handleStudentLogin = (e) => {
    e.preventDefault();
    if (studentName.trim() && roomCode.trim()) {
      navigate(`/student?room=${roomCode}&name=${encodeURIComponent(studentName.trim())}`);
    }
  };

  if (showStudentLogin) {
    return (
      <div className="landing-page">
        <div className="background-decorations">
          <div className="bg-blob bg-blob-1"></div>
          <div className="bg-blob bg-blob-2"></div>
          <div className="bg-gradient-overlay"></div>
        </div>

        <main className="landing-main">
          <div className="glass-surface landing-container" style={{ maxWidth: '500px' }}>
            <div className="landing-content">
              <span className="glass-pill landing-badge">
                <span>FEATHER</span>
              </span>

              <div className="landing-header">
                <h1 className="landing-title" style={{ fontSize: '2rem' }}>
                  Join as Student
                </h1>
                <p className="landing-description">
                  Enter your name and room code to start drawing
                </p>
              </div>

              <form onSubmit={handleStudentLogin} style={{ width: '100%', marginTop: '2rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label htmlFor="studentName" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#333' }}>
                    Your Name
                  </label>
                  <input
                    id="studentName"
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Enter your name"
                    autoFocus
                    required
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      fontSize: '1rem',
                      border: '2px solid #ddd',
                      borderRadius: '8px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#667eea'}
                    onBlur={(e) => e.target.style.borderColor = '#ddd'}
                  />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label htmlFor="roomCode" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#333' }}>
                    Room Code
                  </label>
                  <input
                    id="roomCode"
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="Enter room code"
                    required
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      fontSize: '1rem',
                      border: '2px solid #ddd',
                      borderRadius: '8px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      fontFamily: 'monospace',
                      letterSpacing: '2px',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#667eea'}
                    onBlur={(e) => e.target.style.borderColor = '#ddd'}
                  />
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowStudentLogin(false)}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1.5rem',
                      fontSize: '1rem',
                      fontWeight: '600',
                      border: '2px solid #ddd',
                      borderRadius: '8px',
                      background: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    style={{
                      flex: 2,
                      padding: '0.75rem 1.5rem',
                      fontSize: '1rem',
                      fontWeight: '600',
                      border: 'none',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      cursor: 'pointer',
                      transition: 'transform 0.2s',
                    }}
                    onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
                    onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
                  >
                    Join Room →
                  </button>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="landing-page">
      <div className="background-decorations">
        <div className="bg-blob bg-blob-1"></div>
        <div className="bg-blob bg-blob-2"></div>
        <div className="bg-gradient-overlay"></div>
      </div>

      <main className="landing-main">
        <div className="glass-surface landing-container">
          <div className="landing-content">
            <span className="glass-pill landing-badge">
              <span>FEATHER</span>
            </span>

            <div className="landing-header">
              <h1 className="landing-title">
                Teach visually. Collaborate instantly.
              </h1>
              <p className="landing-description">
                Feather streams pencil-perfect strokes between teachers and students in real time. Instant sync, buttery smooth annotation tools, and delightful classroom-ready controls built for iPad and stylus workflows.
              </p>
            </div>

            <dl className="features">
              <div className="feature-card">
                <dt className="feature-title">Palm rejection</dt>
                <dd className="feature-subtitle">Silky palm drawing</dd>
              </div>
              <div className="feature-card">
                <dt className="feature-title">Frameless logos</dt>
                <dd className="feature-subtitle">Delightful annotations</dd>
              </div>
              <div className="feature-card">
                <dt className="feature-title">Realtime sync</dt>
                <dd className="feature-subtitle">Sub-second latency</dd>
              </div>
            </dl>
          </div>

          <div className="workspace-section">
            <p className="workspace-label">PICK YOUR WORKSPACE</p>
            <div className="workspace-cards">
              <a
                onClick={() => navigate('/teacher?room=demo')}
                className="glass-button teacher-card"
              >
                <div>
                  <p className="workspace-title">Teacher dashboard</p>
                  <p className="workspace-description">
                    Monitor your students, sync views, and annotate the board. Assign templates/images, and manage the class.
                  </p>
                </div>
                <span className="workspace-emoji">👩‍🏫</span>
              </a>
              <a
                onClick={() => setShowStudentLogin(true)}
                className="glass-button student-card"
              >
                <div>
                  <p className="workspace-title">Student workspace</p>
                  <p className="workspace-description">
                    Sketch on a public or draw alongside the class, with undo/redo, templates, and stylus-first controls.
                  </p>
                </div>
                <span className="workspace-emoji">👩‍🎓</span>
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Landing;
