import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Stage, Layer, Line } from 'react-konva';
import * as Ably from 'ably';
import './Whiteboard.css';

function Teacher() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room') || 'demo';

  const [channel, setChannel] = useState(null);
  const [clientId] = useState(`teacher-${Math.random().toString(36).substr(2, 9)}`);
  const [isConnected, setIsConnected] = useState(false);

  // Teacher lines (editable)
  const [teacherLines, setTeacherLines] = useState([]);
  // Student lines (read-only)
  const [studentLines, setStudentLines] = useState([]);

  // Drawing state
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#FF0000');
  const [brushSize, setBrushSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);

  // Undo/redo stacks
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  const isRemoteUpdate = useRef(false);
  const eraserStateSaved = useRef(false);

  // Initialize Ably connection
  useEffect(() => {
    const initAbly = async () => {
      try {
        const ably = new Ably.Realtime({
          authUrl: 'http://localhost:8080/api/token',
          authParams: { clientId },
        });

        ably.connection.on('connected', () => {
          console.log('Connected to Ably');
          setIsConnected(true);
        });

        ably.connection.on('disconnected', () => {
          console.log('Disconnected from Ably');
          setIsConnected(false);
        });

        const whiteboardChannel = ably.channels.get(`room-${roomId}`);

        // Listen for student layer updates (read-only)
        whiteboardChannel.subscribe('student-layer', (message) => {
          console.log('📥 Teacher received student layer update from', message.clientId);
          console.log('📦 Received', message.data.lines?.length || 0, 'student lines');
          isRemoteUpdate.current = true;
          setStudentLines(message.data.lines || []);
          setTimeout(() => {
            isRemoteUpdate.current = false;
          }, 100);
        });

        // Listen for teacher layer updates
        whiteboardChannel.subscribe('teacher-layer', (message) => {
          console.log('Received teacher layer update from', message.clientId);
          if (message.clientId !== clientId) {
            isRemoteUpdate.current = true;
            setTeacherLines(message.data.lines || []);
            setTimeout(() => {
              isRemoteUpdate.current = false;
            }, 100);
          }
        });

        setChannel(whiteboardChannel);

        return () => {
          ably.close();
        };
      } catch (error) {
        console.error('Failed to initialize Ably:', error);
      }
    };

    initAbly();
  }, [clientId, roomId]);

  // Sync teacher lines to Ably
  useEffect(() => {
    if (!isRemoteUpdate.current && channel) {
      const timer = setTimeout(() => {
        channel.publish('teacher-layer', { lines: teacherLines, clientId });
        console.log('Published teacher layer:', teacherLines.length, 'lines');
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [teacherLines, channel, clientId]);

  const handleMouseDown = (e) => {
    if (tool === 'pen') {
      setIsDrawing(true);
      const pos = e.target.getStage().getPointerPosition();
      const newLine = {
        tool,
        points: [pos.x, pos.y],
        color: color,
        strokeWidth: brushSize,
      };

      // Save current state to undo stack
      undoStack.current.push([...teacherLines]);
      redoStack.current = []; // Clear redo stack on new action

      setTeacherLines([...teacherLines, newLine]);
    } else if (tool === 'eraser') {
      // Eraser mode - state will be saved only when a line is actually erased
      setIsDrawing(true);
      eraserStateSaved.current = false; // Reset flag for new erase session
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    if (tool === 'pen') {
      const lastLine = teacherLines[teacherLines.length - 1];
      if (lastLine) {
        lastLine.points = lastLine.points.concat([point.x, point.y]);
        setTeacherLines([...teacherLines.slice(0, -1), lastLine]);
      }
    } else if (tool === 'eraser') {
      const previousLength = teacherLines.length;

      // Check if pointer is near any line and remove it
      const eraserRadius = 20; // Increased for smoother erasing
      const linesToKeep = teacherLines.filter((line) => {
        // Check if any point in the line is within eraser radius
        for (let i = 0; i < line.points.length; i += 2) {
          const x = line.points[i];
          const y = line.points[i + 1];
          const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
          if (distance < eraserRadius) {
            return false; // Remove this line
          }
        }
        return true; // Keep this line
      });

      // Only save state to undo stack if we're actually erasing something and haven't saved yet
      if (linesToKeep.length < previousLength && !eraserStateSaved.current) {
        undoStack.current.push([...teacherLines]);
        redoStack.current = [];
        eraserStateSaved.current = true;
      }

      setTeacherLines(linesToKeep);
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleUndo = () => {
    if (undoStack.current.length > 0) {
      const previousState = undoStack.current.pop();
      redoStack.current.push([...teacherLines]);
      setTeacherLines(previousState);
    }
  };

  const handleRedo = () => {
    if (redoStack.current.length > 0) {
      const nextState = redoStack.current.pop();
      undoStack.current.push([...teacherLines]);
      setTeacherLines(nextState);
    }
  };

  const handleClear = async () => {
    undoStack.current.push([...teacherLines]);
    redoStack.current = [];
    setTeacherLines([]);

    if (channel) {
      await channel.publish('teacher-layer', { lines: [], clientId });
      console.log('Published teacher clear');
    }
  };

  return (
    <div className="whiteboard teacher">
      <header className="header">
        <div className="header-left">
          <Link to="/" className="back-link">← Back</Link>
          <h1>Teacher View</h1>
          <span className="room-badge teacher-badge">Room: {roomId}</span>
        </div>
        <div className="status">
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          <span className="client-id">{clientId}</span>
        </div>
      </header>

      <div className="toolbar">
        <div className="tool-group">
          <button
            onClick={() => setTool('pen')}
            className={`btn ${tool === 'pen' ? 'btn-active' : ''}`}
          >
            Pen
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`btn ${tool === 'eraser' ? 'btn-active' : ''}`}
          >
            Eraser
          </button>
          <button onClick={handleUndo} className="btn">Undo</button>
          <button onClick={handleRedo} className="btn">Redo</button>
          <button onClick={handleClear} className="btn btn-danger">Clear</button>
        </div>

        <div className="tool-group">
          <span style={{ marginRight: '10px', color: '#666', fontSize: '14px' }}>Color:</span>
          <button
            onClick={() => setColor('#FF0000')}
            className="color-btn"
            style={{
              background: '#FF0000',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: color === '#FF0000' ? '3px solid #333' : '2px solid #ddd',
              cursor: 'pointer',
              padding: 0
            }}
            title="Red"
          />
          <button
            onClick={() => setColor('#0066FF')}
            className="color-btn"
            style={{
              background: '#0066FF',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: color === '#0066FF' ? '3px solid #333' : '2px solid #ddd',
              cursor: 'pointer',
              padding: 0
            }}
            title="Blue"
          />
          <button
            onClick={() => setColor('black')}
            className="color-btn"
            style={{
              background: 'black',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: color === 'black' ? '3px solid #333' : '2px solid #ddd',
              cursor: 'pointer',
              padding: 0
            }}
            title="Black"
          />
          <button
            onClick={() => setColor('#00AA00')}
            className="color-btn"
            style={{
              background: '#00AA00',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: color === '#00AA00' ? '3px solid #333' : '2px solid #ddd',
              cursor: 'pointer',
              padding: 0
            }}
            title="Green"
          />
          <button
            onClick={() => setColor('#FFD700')}
            className="color-btn"
            style={{
              background: '#FFD700',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: color === '#FFD700' ? '3px solid #333' : '2px solid #ddd',
              cursor: 'pointer',
              padding: 0
            }}
            title="Yellow"
          />
        </div>

        <div className="tool-group">
          <span style={{ marginRight: '10px', color: '#666', fontSize: '14px' }}>Brush Size:</span>
          <input
            type="range"
            min="1"
            max="10"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            style={{
              width: '150px',
              cursor: 'pointer'
            }}
          />
          <span style={{ marginLeft: '10px', color: '#666', fontSize: '14px', minWidth: '30px' }}>
            {brushSize}px
          </span>
        </div>
      </div>

      <div className="canvas-container">
        <Stage
          width={1200}
          height={700}
          onMouseDown={handleMouseDown}
          onMousemove={handleMouseMove}
          onMouseup={handleMouseUp}
          style={{ border: '2px solid #ddd', borderRadius: '8px', background: 'white' }}
        >
          {/* Student layer (read-only background) */}
          <Layer listening={false}>
            {studentLines.map((line, i) => (
              <Line
                key={`student-${i}`}
                points={line.points}
                stroke={line.color}
                strokeWidth={line.strokeWidth}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
              />
            ))}
          </Layer>

          {/* Teacher layer (editable) */}
          <Layer>
            {teacherLines.map((line, i) => (
              <Line
                key={`teacher-${i}`}
                points={line.points}
                stroke={line.color}
                strokeWidth={line.strokeWidth}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
              />
            ))}
          </Layer>
        </Stage>
      </div>

      <div className="info-bar teacher-info">
        Draw annotations (red) with pen tool. Student drawings (black) appear as read-only.
      </div>
    </div>
  );
}

export default Teacher;
