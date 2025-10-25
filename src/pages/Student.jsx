import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Stage, Layer, Line } from 'react-konva';
import * as Ably from 'ably';
import './Whiteboard.css';

function Student() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room') || 'demo';

  const [channel, setChannel] = useState(null);
  const [clientId] = useState(`student-${Math.random().toString(36).substr(2, 9)}`);
  const [isConnected, setIsConnected] = useState(false);

  // Student lines (editable)
  const [studentLines, setStudentLines] = useState([]);
  // Teacher lines (read-only)
  const [teacherLines, setTeacherLines] = useState([]);

  // Drawing state
  const [tool, setTool] = useState('pen');
  const [isDrawing, setIsDrawing] = useState(false);
  const [inputMode, setInputMode] = useState('all'); // 'all' or 'stylus-only'

  // Undo/redo stacks
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  const isRemoteUpdate = useRef(false);
  const eraserStateSaved = useRef(false);

  // Initialize Ably connection
  useEffect(() => {
    const initAbly = async () => {
      try {
        // Use relative URL so it works on all devices (laptop, phone, tablet)
        const ably = new Ably.Realtime({
          authUrl: '/api/token',
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

        // Listen for student layer updates
        whiteboardChannel.subscribe('student-layer', (message) => {
          console.log('Received student layer update from', message.clientId);
          if (message.clientId !== clientId) {
            isRemoteUpdate.current = true;
            setStudentLines(message.data.lines || []);
            setTimeout(() => {
              isRemoteUpdate.current = false;
            }, 100);
          }
        });

        // Listen for teacher annotations and filter by targetStudentId
        whiteboardChannel.subscribe('teacher-annotation', (message) => {
          // Only update if this annotation is for me
          if (message.data.targetStudentId === clientId) {
            console.log('📥 Received teacher annotation from', message.data.teacherId, 'for me');
            isRemoteUpdate.current = true;
            setTeacherLines(message.data.annotations || []);
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

  // Sync student lines to Ably
  useEffect(() => {
    if (!isRemoteUpdate.current && channel) {
      const timer = setTimeout(() => {
        channel.publish('student-layer', { lines: studentLines, clientId });
        console.log('Published student layer:', studentLines.length, 'lines');
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [studentLines, channel, clientId]);

  const handlePointerDown = (e) => {
    const evt = e.evt;

    // Stylus-only mode: only accept pointerType === 'pen'
    if (inputMode === 'stylus-only' && evt.pointerType !== 'pen') {
      console.log('Blocked: Not a stylus (pointerType:', evt.pointerType, ')');
      return;
    }

    if (tool === 'pen') {
      setIsDrawing(true);
      const pos = e.target.getStage().getPointerPosition();
      const newLine = {
        tool,
        points: [pos.x, pos.y],
        color: 'black',
        strokeWidth: 3,
      };

      // Save current state to undo stack
      undoStack.current.push([...studentLines]);
      redoStack.current = []; // Clear redo stack on new action

      setStudentLines([...studentLines, newLine]);
    } else if (tool === 'eraser') {
      // Eraser mode - state will be saved only when a line is actually erased
      setIsDrawing(true);
      eraserStateSaved.current = false; // Reset flag for new erase session
    }

    // Prevent default to avoid scrolling on touch devices
    if (evt.preventDefault) {
      evt.preventDefault();
    }
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    if (tool === 'pen') {
      const lastLine = studentLines[studentLines.length - 1];
      if (lastLine) {
        lastLine.points = lastLine.points.concat([point.x, point.y]);
        setStudentLines([...studentLines.slice(0, -1), lastLine]);
      }
    } else if (tool === 'eraser') {
      const previousLength = studentLines.length;

      // Check if pointer is near any line and remove it
      const eraserRadius = 10;
      const linesToKeep = studentLines.filter((line) => {
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
        undoStack.current.push([...studentLines]);
        redoStack.current = [];
        eraserStateSaved.current = true;
      }

      setStudentLines(linesToKeep);
    }

    // Prevent default to avoid scrolling on touch devices
    const evt = e.evt;
    if (evt.preventDefault) {
      evt.preventDefault();
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const handleUndo = () => {
    if (undoStack.current.length > 0) {
      const previousState = undoStack.current.pop();
      redoStack.current.push([...studentLines]);
      setStudentLines(previousState);
    }
  };

  const handleRedo = () => {
    if (redoStack.current.length > 0) {
      const nextState = redoStack.current.pop();
      undoStack.current.push([...studentLines]);
      setStudentLines(nextState);
    }
  };

  const handleClear = async () => {
    undoStack.current.push([...studentLines]);
    redoStack.current = [];
    setStudentLines([]);

    if (channel) {
      await channel.publish('student-layer', { lines: [], clientId });
      console.log('Published student clear');
    }
  };

  return (
    <div className="whiteboard">
      <header className="header">
        <div className="header-left">
          <Link to="/" className="back-link">← Back</Link>
          <h1>Student View</h1>
          <span className="room-badge">Room: {roomId}</span>
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
          <span style={{ marginRight: '10px', color: '#666', fontSize: '14px' }}>Input Mode:</span>
          <button
            onClick={() => setInputMode('all')}
            className={`btn ${inputMode === 'all' ? 'btn-active' : ''}`}
          >
            All Inputs
          </button>
          <button
            onClick={() => setInputMode('stylus-only')}
            className={`btn ${inputMode === 'stylus-only' ? 'btn-active' : ''}`}
          >
            Stylus Only
          </button>
        </div>
      </div>

      <div className="canvas-container">
        <Stage
          width={800}
          height={600}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          style={{
            border: '2px solid #ddd',
            borderRadius: '8px',
            background: 'white',
            touchAction: 'none'
          }}
        >
          {/* Student layer (editable) */}
          <Layer>
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

          {/* Teacher layer (read-only overlay) */}
          <Layer listening={false}>
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

      <div className="info-bar">
        Draw with pen tool. Teacher annotations (red) will appear in real-time.
      </div>
    </div>
  );
}

export default Student;
