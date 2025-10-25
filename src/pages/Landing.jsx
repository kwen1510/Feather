import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css';

function Landing() {
  const navigate = useNavigate();

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
                onClick={() => navigate('/student?room=demo')}
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
