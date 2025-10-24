import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css';

function Landing() {
  const [roomId, setRoomId] = useState('demo');
  const navigate = useNavigate();

  const handleSubmit = (e, role) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/${role}?room=${roomId}`);
    }
  };

  return (
    <div className="landing">
      <div className="landing-card">
        <h1>Real-time Collaborative Whiteboard</h1>
        <p className="subtitle">Two-layer drawing system for classroom collaboration</p>

        <div className="features">
          <div className="feature">
            <h3>Student View</h3>
            <p>Draw on your own layer with undo/redo functionality</p>
          </div>
          <div className="feature">
            <h3>Teacher View</h3>
            <p>See student drawings in real-time and add annotations on a separate layer</p>
          </div>
        </div>

        <form className="room-form">
          <label htmlFor="room-id">Enter Room ID</label>
          <input
            id="room-id"
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Enter room name..."
            autoFocus
          />

          <div className="button-group">
            <button
              type="submit"
              className="btn btn-student"
              onClick={(e) => handleSubmit(e, 'student')}
            >
              Join as Student
            </button>
            <button
              type="submit"
              className="btn btn-teacher"
              onClick={(e) => handleSubmit(e, 'teacher')}
            >
              Join as Teacher
            </button>
          </div>
        </form>

        <div className="info">
          <p>Open multiple windows to test real-time collaboration</p>
        </div>
      </div>
    </div>
  );
}

export default Landing;
