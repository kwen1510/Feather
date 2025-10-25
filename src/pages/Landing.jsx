import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css';

function Landing() {
  const [sessionCode, setSessionCode] = useState('');
  const navigate = useNavigate();

  const handleJoinRoom = () => {
    if (sessionCode.trim()) {
      navigate(`/student?room=${sessionCode.trim()}`);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleJoinRoom();
    }
  };

  return (
    <div className="landing-page">
      <div className="landing-container">
        <div className="landing-badge">LIVE DRAWING SUITE</div>

        <h1 className="landing-title">
          Teach visually.<br />
          Collaborate instantly.
        </h1>

        <p className="landing-description">
          Live Drawing streams pencil-perfect strokes between<br />
          teacher and students, across devices. Instant sync, buttery<br />
          smooth annotation tools, and delightful classroom-ready<br />
          session login for iPad and stylus worldwide
        </p>

        <div className="workspace-cards">
          <div className="workspace-card teacher-card" onClick={() => navigate('/teacher?room=demo')}>
            <h3>Teacher dashboard</h3>
            <p>
              Deploy your lesson. Interactive<br />
              whiteboards for students across<br />
              iPad and Apple Pencil. 📚
            </p>
            <span className="card-link">Try class →</span>
          </div>

          <div className="workspace-card student-card" onClick={() => navigate('/student?room=demo')}>
            <h3>Student workspace</h3>
            <p>
              Tap with a code to draw alongside<br />
              the class, with pencil tools,<br />
              blackboard, and layers. Try! 🎨
            </p>
            <span className="card-link">Try student →</span>
          </div>
        </div>

        <div className="features">
          <div className="feature">
            <h4>Palm rejection</h4>
            <p>Stylus-only<br />drawing</p>
          </div>
          <div className="feature">
            <h4>Feedback loops</h4>
            <p>Sub-second<br />annotations</p>
          </div>
          <div className="feature">
            <h4>Realtime sync</h4>
            <p>Sub-second<br />latency</p>
          </div>
        </div>

        <div className="session-code-section">
          <h3>SESSION CODE</h3>
          <p className="session-subtitle">Tap to join instantly.</p>

          <div className="code-input-container">
            <input
              type="text"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter room code"
              className="code-input"
            />
            <button onClick={handleJoinRoom} className="join-btn">
              Join →
            </button>
          </div>

          <p className="helper-text">
            Session codes are generated automatically in the teacher view or<br />
            can be toggled in URL (room=CODE)
          </p>
        </div>

        <div className="how-it-works">
          <h3>How it works</h3>
          <ol>
            <li>Teacher starts a session (or uses "room=CODE") and shares the QRcode</li>
            <li>Students join - scan with iPencil, iPhones, or paste the link on browser</li>
            <li>Undoable/clear are reliable and realtime—perfect synchronized across student areas classroom-to-home</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default Landing;
