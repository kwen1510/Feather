import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Stage, Layer, Line } from 'react-konva';
import * as Ably from 'ably';
import './StudentNew.css';

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
  const [color, setColor] = useState('black');
  const [brushSize, setBrushSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [inputMode, setInputMode] = useState('stylus-only'); // 'all' or 'stylus-only'
  const [toolbarPosition, setToolbarPosition] = useState('left'); // 'left' or 'right'

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

  const isAllowedPointerEvent = (evt) => {
    if (inputMode !== 'stylus-only') return true;
    return evt?.pointerType === 'pen';
  };

  const handlePointerDown = (e) => {
    const evt = e.evt;

    // Stylus-only mode: only accept pointerType === 'pen'
    if (!isAllowedPointerEvent(evt)) {
      console.log('Blocked: Not a stylus (pointerType:', evt?.pointerType, ')');
      if (evt?.preventDefault) {
        evt.preventDefault();
      }
      return;
    }

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

    const evt = e.evt;
    if (!isAllowedPointerEvent(evt)) {
      if (evt?.preventDefault) {
        evt.preventDefault();
      }
      return;
    }

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
      const eraserRadius = 20; // Increased for smoother erasing
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
    if (evt?.preventDefault) {
      evt.preventDefault();
    }
  };

  const handlePointerUp = (e) => {
    const evt = e?.evt;
    if (!isAllowedPointerEvent(evt)) {
      if (evt?.preventDefault) {
        evt.preventDefault();
      }
      return;
    }
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

  const getShortClientId = () => {
    return clientId.split('-')[1]?.substring(0, 3) || 'kw';
  };

  const toggleInputMode = () => {
    setInputMode(prev => prev === 'stylus-only' ? 'all' : 'stylus-only');
  };

  const toggleToolbarPosition = () => {
    setToolbarPosition(prev => prev === 'left' ? 'right' : 'left');
  };

  return (
    <div className="student-canvas-page">
      {/* Status Bar */}
      <div className="student-status-bar">
        <button
          className="status-badge"
          onClick={toggleInputMode}
        >
          <span className="status-dot"></span>
          <span>{inputMode === 'stylus-only' ? 'Stylus mode (pen only)' : 'All inputs'}</span>
        </button>
        <button
          className="move-toolbar-btn"
          onClick={toggleToolbarPosition}
        >
          Move toolbar to {toolbarPosition === 'left' ? 'right' : 'left'}
        </button>
      </div>

      <div className={`student-canvas-container ${toolbarPosition === 'right' ? 'toolbar-right' : ''}`}>
        {/* Sidebar */}
        <div className="student-sidebar">
          {/* Header inside sidebar */}
          <div className="sidebar-header">
            <h1 className="student-title">Student Canvas</h1>
            <p className="student-subtitle">Connected as {getShortClientId()}</p>
          </div>

          {/* Colors */}
          <div className="sidebar-section">
            <h3 className="sidebar-label">COLORS</h3>
            <div className="color-buttons">
              <button
                onClick={() => setColor('black')}
                className={`color-button ${color === 'black' ? 'active' : ''}`}
                style={{ background: 'black' }}
                aria-label="Black"
              />
              <button
                onClick={() => setColor('#0066FF')}
                className={`color-button ${color === '#0066FF' ? 'active' : ''}`}
                style={{ background: '#0066FF' }}
                aria-label="Blue"
              />
              <button
                onClick={() => setColor('#00AA00')}
                className={`color-button ${color === '#00AA00' ? 'active' : ''}`}
                style={{ background: '#00AA00' }}
                aria-label="Green"
              />
            </div>
          </div>

          {/* Tools */}
          <div className="sidebar-section">
            <h3 className="sidebar-label">TOOLS</h3>
            <div className="tool-buttons">
              <button
                onClick={() => setTool('pen')}
                className={`tool-button ${tool === 'pen' ? 'active' : ''}`}
              >
                Pen
              </button>
              <button
                onClick={() => setTool('eraser')}
                className={`tool-button ${tool === 'eraser' ? 'active' : ''}`}
              >
                Eraser
              </button>
            </div>
          </div>

          {/* Brush Size */}
          <div className="sidebar-section">
            <h3 className="sidebar-label">BRUSH SIZE</h3>
            <div className="brush-size-control">
              <div className="brush-slider-container">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={brushSize}
                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  className="brush-slider"
                />
                <span className="brush-value">{brushSize}</span>
              </div>
            </div>
          </div>

          {/* History */}
          <div className="sidebar-section">
            <h3 className="sidebar-label">HISTORY</h3>
            <div className="history-buttons">
              <button
                onClick={handleUndo}
                className="history-button"
                disabled={undoStack.current.length === 0}
              >
                Undo
              </button>
              <button
                onClick={handleRedo}
                className="history-button"
                disabled={redoStack.current.length === 0}
              >
                Redo
              </button>
              <button
                onClick={handleClear}
                className="history-button danger"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="student-canvas-wrapper">
          <Stage
            width={1000}
            height={700}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="canvas-stage"
            style={{ touchAction: 'none' }}
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
      </div>
    </div>
  );
}

export default Student;
