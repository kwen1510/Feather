import React, { useState, useRef } from 'react';
import Ably from 'ably/promises';
import './TestControl.css';

const TestControl = () => {
  const [roomCode, setRoomCode] = useState('load-test');
  const [numStudents, setNumStudents] = useState(5);
  const [startDelay, setStartDelay] = useState(3);
  const [strokeInterval, setStrokeInterval] = useState(1);
  const [strokesPerBurst, setStrokesPerBurst] = useState(1);
  const [totalStrokes, setTotalStrokes] = useState(10);
  const [students, setStudents] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const studentsRef = useRef([]);

  const generateRandomStroke = () => {
    const points = [];
    for (let i = 0; i < 3; i++) {
      points.push(Math.random() * 800);
      points.push(Math.random() * 600);
    }
    return {
      tool: 'pen',
      points,
      color: 'black',
      strokeWidth: 3,
    };
  };

  const updateStudentStatus = (index, updates) => {
    setStudents(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  const createStudent = async (index) => {
    const studentName = `TestStudent-${index + 1}`;
    const clientId = `test-control-student-${index + 1}-${Date.now()}`;

    const student = {
      id: index,
      name: studentName,
      clientId,
      status: 'connecting',
      strokesSent: 0,
      errors: 0,
      channel: null,
      ably: null,
      intervalId: null,
    };

    updateStudentStatus(index, student);

    try {
      // Get token
      const tokenResponse = await fetch(`/api/token?clientId=${clientId}`);
      if (!tokenResponse.ok) {
        throw new Error('Token request failed');
      }
      const tokenRequest = await tokenResponse.json();

      // Connect to Ably
      const ably = new Ably.Realtime({
        authCallback: (tokenParams, callback) => {
          callback(null, tokenRequest);
        },
        clientId,
      });

      await new Promise((resolve, reject) => {
        const onConnected = () => {
          ably.connection.off('connected', onConnected);
          ably.connection.off('failed', onFailed);
          resolve();
        };

        const onFailed = (err) => {
          ably.connection.off('connected', onConnected);
          ably.connection.off('failed', onFailed);
          reject(err || new Error('Connection failed'));
        };

        ably.connection.on('connected', onConnected);
        ably.connection.on('failed', onFailed);
      });

      updateStudentStatus(index, { status: 'connected' });

      // Join room
      const channel = ably.channels.get(`room-${roomCode.toUpperCase()}`);
      await channel.presence.enter({
        name: studentName,
        role: 'student',
        testMode: true,
      });

      updateStudentStatus(index, { status: 'joined', channel, ably });

      // Wait for start delay
      updateStudentStatus(index, { status: `waiting (${startDelay}s)` });
      await new Promise(resolve => setTimeout(resolve, startDelay * 1000));

      // Start drawing
      updateStudentStatus(index, { status: 'drawing' });

      let strokeCount = 0;
      const intervalId = setInterval(async () => {
        if (strokeCount >= totalStrokes) {
          clearInterval(intervalId);
          updateStudentStatus(index, { status: 'completed', intervalId: null });
          return;
        }

        try {
          const strokes = [];
          for (let i = 0; i < strokesPerBurst; i++) {
            strokes.push(generateRandomStroke());
          }

          await channel.publish('student-layer', { lines: strokes });
          strokeCount += strokesPerBurst;
          updateStudentStatus(index, { strokesSent: strokeCount });
        } catch (error) {
          console.error(`Student ${index + 1} draw error:`, error);
          updateStudentStatus(index, { errors: (student.errors || 0) + 1 });
        }
      }, strokeInterval * 1000);

      updateStudentStatus(index, { intervalId });
      studentsRef.current[index] = { ...student, channel, ably, intervalId };

    } catch (error) {
      console.error(`Student ${index + 1} failed:`, error);
      updateStudentStatus(index, { status: 'failed', error: error.message });
    }
  };

  const handleStart = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setStudents(Array(numStudents).fill(null).map((_, i) => ({
      id: i,
      name: `TestStudent-${i + 1}`,
      status: 'pending',
      strokesSent: 0,
      errors: 0,
    })));

    studentsRef.current = [];

    // Launch all students
    for (let i = 0; i < numStudents; i++) {
      createStudent(i);
      // Small delay between launches to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  const handleStop = async () => {
    // Stop all students
    for (let i = 0; i < studentsRef.current.length; i++) {
      const student = studentsRef.current[i];
      if (student) {
        if (student.intervalId) {
          clearInterval(student.intervalId);
        }
        if (student.channel) {
          try {
            await student.channel.presence.leave();
          } catch (e) {
            console.error('Error leaving:', e);
          }
        }
        if (student.ably) {
          student.ably.close();
        }
      }
    }

    studentsRef.current = [];
    setIsRunning(false);
    setStudents(prev => prev.map(s => ({ ...s, status: 'stopped' })));
  };

  const handleReset = () => {
    setStudents([]);
    studentsRef.current = [];
    setIsRunning(false);
  };

  const activeCount = students.filter(s => s.status === 'drawing').length;
  const completedCount = students.filter(s => s.status === 'completed').length;
  const totalStrokesSent = students.reduce((sum, s) => sum + (s.strokesSent || 0), 0);

  return (
    <div className="test-control">
      <div className="control-header">
        <h1>🎛️ Student Injection Control Panel</h1>
        <p>Configure and inject test students into any room</p>
      </div>

      <div className="control-layout">
        {/* Configuration Panel */}
        <div className="control-panel">
          <div className="panel-section">
            <h2>Room Configuration</h2>
            <div className="form-group">
              <label>Room Code</label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                disabled={isRunning}
                placeholder="load-test"
              />
              <small>Students will join this room</small>
            </div>
          </div>

          <div className="panel-section">
            <h2>Student Configuration</h2>
            <div className="form-group">
              <label>Number of Students</label>
              <input
                type="number"
                min="1"
                max="50"
                value={numStudents}
                onChange={(e) => setNumStudents(parseInt(e.target.value) || 1)}
                disabled={isRunning}
              />
            </div>

            <div className="form-group">
              <label>Start Delay (seconds)</label>
              <input
                type="number"
                min="0"
                max="60"
                value={startDelay}
                onChange={(e) => setStartDelay(parseInt(e.target.value) || 0)}
                disabled={isRunning}
              />
              <small>Wait time before students start drawing</small>
            </div>
          </div>

          <div className="panel-section">
            <h2>Drawing Configuration</h2>
            <div className="form-group">
              <label>Stroke Interval (seconds)</label>
              <input
                type="number"
                min="0.1"
                max="60"
                step="0.1"
                value={strokeInterval}
                onChange={(e) => setStrokeInterval(parseFloat(e.target.value) || 1)}
                disabled={isRunning}
              />
              <small>Time between each drawing action</small>
            </div>

            <div className="form-group">
              <label>Strokes per Burst</label>
              <input
                type="number"
                min="1"
                max="10"
                value={strokesPerBurst}
                onChange={(e) => setStrokesPerBurst(parseInt(e.target.value) || 1)}
                disabled={isRunning}
              />
              <small>Number of strokes sent at once</small>
            </div>

            <div className="form-group">
              <label>Total Strokes per Student</label>
              <input
                type="number"
                min="1"
                max="1000"
                value={totalStrokes}
                onChange={(e) => setTotalStrokes(parseInt(e.target.value) || 10)}
                disabled={isRunning}
              />
              <small>Stop after this many strokes</small>
            </div>
          </div>

          <div className="control-actions">
            {!isRunning ? (
              <button className="btn btn-primary btn-large" onClick={handleStart}>
                🚀 Start Injection
              </button>
            ) : (
              <button className="btn btn-danger btn-large" onClick={handleStop}>
                🛑 Stop All
              </button>
            )}
            {students.length > 0 && !isRunning && (
              <button className="btn btn-secondary" onClick={handleReset}>
                🔄 Reset
              </button>
            )}
          </div>

          {/* Summary Stats */}
          {students.length > 0 && (
            <div className="stats-summary">
              <h3>Summary</h3>
              <div className="stat-row">
                <span>Active Students:</span>
                <strong>{activeCount} / {students.length}</strong>
              </div>
              <div className="stat-row">
                <span>Completed:</span>
                <strong>{completedCount}</strong>
              </div>
              <div className="stat-row">
                <span>Total Strokes Sent:</span>
                <strong>{totalStrokesSent}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Student Status Panel */}
        <div className="status-panel">
          <div className="status-header">
            <h2>Student Status</h2>
            <div className="status-badge">
              {students.length === 0 ? 'Ready' : isRunning ? 'Running' : 'Stopped'}
            </div>
          </div>

          {students.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">👥</div>
              <p>No students injected yet</p>
              <small>Configure settings and click "Start Injection"</small>
            </div>
          ) : (
            <div className="student-list">
              {students.map((student) => (
                <div key={student.id} className={`student-item status-${student.status}`}>
                  <div className="student-header">
                    <div className="student-name">
                      <span className="student-icon">👤</span>
                      <strong>{student.name}</strong>
                    </div>
                    <div className="student-status">
                      {student.status === 'connecting' && '🔄'}
                      {student.status === 'connected' && '✅'}
                      {student.status === 'joined' && '🏠'}
                      {student.status?.includes('waiting') && '⏳'}
                      {student.status === 'drawing' && '✏️'}
                      {student.status === 'completed' && '✅'}
                      {student.status === 'failed' && '❌'}
                      {student.status === 'stopped' && '⏹️'}
                      <span className="status-text">{student.status}</span>
                    </div>
                  </div>
                  <div className="student-stats">
                    <span className="stat">
                      Strokes: <strong>{student.strokesSent}/{totalStrokes}</strong>
                    </span>
                    {student.errors > 0 && (
                      <span className="stat error">
                        Errors: <strong>{student.errors}</strong>
                      </span>
                    )}
                  </div>
                  {student.status === 'drawing' && (
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${(student.strokesSent / totalStrokes) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Access Links */}
      <div className="quick-links">
        <h3>Quick Access</h3>
        <div className="link-group">
          <a href={`/test/teacher?room=${roomCode}`} target="_blank" rel="noopener noreferrer">
            👨‍🏫 Open Teacher Dashboard →
          </a>
          <a href={`/test/student?room=${roomCode}`} target="_blank" rel="noopener noreferrer">
            👨‍🎓 Open Student View →
          </a>
        </div>
      </div>
    </div>
  );
};

export default TestControl;
