import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Stage, Layer, Line, Image as KonvaImage } from 'react-konva';
import * as Ably from 'ably';
import './StudentNew.css';

const BASE_CANVAS = { width: 800, height: 600 };
const MIN_SCALE = 0.65;
const MAX_SCALE = 2.2;
const STUDENT_PREFS_KEY = 'studentCanvasPrefs';
const PREFS_VERSION = 2; // Increment when adding new preferences

// Component to display shared image as background
const SharedImageLayer = ({ sharedImage, canvasWidth, canvasHeight }) => {
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (!sharedImage) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    img.src = sharedImage.dataUrl;
    img.onload = () => {
      setImage(img);
    };
  }, [sharedImage]);

  if (!sharedImage || !image) return null;

  // Calculate scaling to fit canvas while maintaining aspect ratio
  // Longer side touches the edge
  const imageAspect = sharedImage.width / sharedImage.height;
  const canvasAspect = canvasWidth / canvasHeight;

  let displayWidth, displayHeight, x, y;

  if (imageAspect > canvasAspect) {
    // Image is wider than canvas - fit to width
    displayWidth = canvasWidth;
    displayHeight = canvasWidth / imageAspect;
    x = 0;
    y = (canvasHeight - displayHeight) / 2;
  } else {
    // Image is taller than canvas - fit to height
    displayHeight = canvasHeight;
    displayWidth = canvasHeight * imageAspect;
    x = (canvasWidth - displayWidth) / 2;
    y = 0;
  }

  return (
    <KonvaImage
      image={image}
      x={x}
      y={y}
      width={displayWidth}
      height={displayHeight}
      listening={false}
    />
  );
};

function Student() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room') || 'demo';
  const studentName = searchParams.get('name') || 'Anonymous';

  const [channel, setChannel] = useState(null);
  const [clientId] = useState(`student-${Math.random().toString(36).substr(2, 9)}`);
  const [isConnected, setIsConnected] = useState(false);

  // Student lines (editable, stored in base 800x600 coordinates)
  const [studentLines, setStudentLines] = useState([]);
  // Teacher lines (read-only overlay, assumed base coordinates)
  const [teacherLines, setTeacherLines] = useState([]);
  const [sharedImage, setSharedImage] = useState(null);

  // Drawing state
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('black');
  const [brushSize, setBrushSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [inputMode, setInputMode] = useState('stylus-only'); // 'all' or 'stylus-only'
  const [toolbarPosition, setToolbarPosition] = useState('left'); // 'left' or 'right'

  // Load saved preferences
  useEffect(() => {
    if (typeof window === 'undefined') return;
    console.log('🔵 [STUDENT] Loading preferences from localStorage...');
    try {
      const stored = localStorage.getItem(STUDENT_PREFS_KEY);
      if (stored) {
        const prefs = JSON.parse(stored);
        console.log('🔵 [STUDENT] Found stored preferences:', prefs);
        // Check version - if old version, clear and use defaults
        if (prefs.version !== PREFS_VERSION) {
          console.log('🔵 [STUDENT] Version mismatch! Expected:', PREFS_VERSION, 'Got:', prefs.version);
          console.log('🔵 [STUDENT] Clearing old preferences...');
          localStorage.removeItem(STUDENT_PREFS_KEY);
          return;
        }
        console.log('🔵 [STUDENT] Applying preferences...');
        if (prefs.tool) setTool(prefs.tool);
        if (prefs.color) setColor(prefs.color);
        if (typeof prefs.brushSize === 'number') setBrushSize(prefs.brushSize);
        if (prefs.inputMode) setInputMode(prefs.inputMode);
        if (prefs.toolbarPosition) setToolbarPosition(prefs.toolbarPosition);
        console.log('🔵 [STUDENT] Preferences loaded successfully!');
      } else {
        console.log('🔵 [STUDENT] No stored preferences found, using defaults');
      }
    } catch (error) {
      console.warn('🔵 [STUDENT] Failed to load student prefs', error);
      localStorage.removeItem(STUDENT_PREFS_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Skip saving on first render to avoid overwriting loaded preferences
    if (isFirstRender.current) {
      isFirstRender.current = false;
      console.log('💾 [STUDENT] Skipping save on first render');
      return;
    }
    const prefs = { version: PREFS_VERSION, tool, color, brushSize, inputMode, toolbarPosition };
    console.log('💾 [STUDENT] Saving preferences to localStorage:', prefs);
    localStorage.setItem(STUDENT_PREFS_KEY, JSON.stringify(prefs));
  }, [tool, color, brushSize, inputMode, toolbarPosition]);

  // Undo/redo stacks
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const isFirstRender = useRef(true);

  const isRemoteUpdate = useRef(false);
  const eraserStateSaved = useRef(false);

  // Performance optimization: keep current line in ref to avoid re-renders
  const currentLineRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Prevent touch events and text selection ONLY on canvas area
  useEffect(() => {
    const canvasWrapper = canvasWrapperRef.current;
    if (!canvasWrapper) return;

    const preventTouch = (e) => {
      // Only prevent if the touch is on the canvas area, not on buttons
      const target = e.target;
      const isButton = target.closest('button') || target.closest('.student-toolbar') || target.closest('.student-topbar');

      if (!isButton) {
        e.preventDefault();
      }
    };

    const preventGesture = (e) => {
      e.preventDefault();
    };

    // Prevent text selection during drawing
    const preventSelection = (e) => {
      if (isDrawing) {
        e.preventDefault();
        return false;
      }
    };

    // Add listeners to canvas wrapper only, not entire document
    canvasWrapper.addEventListener('touchstart', preventTouch, { passive: false });
    canvasWrapper.addEventListener('touchmove', preventTouch, { passive: false });
    canvasWrapper.addEventListener('gesturestart', preventGesture, { passive: false });
    canvasWrapper.addEventListener('gesturechange', preventGesture, { passive: false });
    document.addEventListener('selectstart', preventSelection);

    return () => {
      if (canvasWrapper) {
        canvasWrapper.removeEventListener('touchstart', preventTouch);
        canvasWrapper.removeEventListener('touchmove', preventTouch);
        canvasWrapper.removeEventListener('gesturestart', preventGesture);
        canvasWrapper.removeEventListener('gesturechange', preventGesture);
      }
      document.removeEventListener('selectstart', preventSelection);
    };
  }, [isDrawing]);

  const canvasWrapperRef = useRef(null);
  const stageRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState(BASE_CANVAS);
  const canvasScale = useMemo(
    () => (BASE_CANVAS.width ? canvasSize.width / BASE_CANVAS.width : 1),
    [canvasSize.width]
  );

  // Initialize Ably connection
  useEffect(() => {
    const initAbly = async () => {
      try {
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

        // Listen for student layer updates (only react to own messages)
        whiteboardChannel.subscribe('student-layer', (message) => {
          if (message.clientId !== clientId) {
            return; // Ignore strokes from other students
          }
          isRemoteUpdate.current = true;
          setStudentLines(message.data.lines || []);
          setTimeout(() => {
            isRemoteUpdate.current = false;
          }, 100);
        });

        // Listen for teacher annotations and filter by targetStudentId
        whiteboardChannel.subscribe('teacher-annotation', (message) => {
          if (message.data.targetStudentId === clientId) {
            isRemoteUpdate.current = true;
            setTeacherLines(message.data.annotations || []);
            setTimeout(() => {
              isRemoteUpdate.current = false;
            }, 100);
          }
        });

        // Listen for teacher shared images
        whiteboardChannel.subscribe('teacher-image', (message) => {
          setSharedImage({
            dataUrl: message.data?.dataUrl,
            width: message.data?.width,
            height: message.data?.height,
            timestamp: message.data?.timestamp,
          });
        });

        // Listen for teacher templates
        whiteboardChannel.subscribe('teacher-template', (message) => {
          setSharedImage({
            dataUrl: message.data?.dataUrl,
            width: message.data?.width,
            height: message.data?.height,
            type: message.data?.type, // hanzi, graph-corner, graph-cross
            timestamp: message.data?.timestamp,
          });
        });

        // Listen for teacher clear command
        whiteboardChannel.subscribe('teacher-clear', (message) => {
          setSharedImage(null);
        });

        // Listen for clear all drawings command (when teacher sends new content)
        whiteboardChannel.subscribe('clear-all-drawings', (message) => {
          console.log('📝 Clearing all drawings (teacher sent new content)');
          isRemoteUpdate.current = true;
          setStudentLines([]); // Clear student's own drawings
          setTeacherLines([]); // Clear teacher annotations
          setTimeout(() => {
            isRemoteUpdate.current = false;
          }, 100);
        });

        // Enter presence with student name
        whiteboardChannel.presence.enter({ name: studentName });
        console.log(`Joined room ${roomId} as ${studentName}`);

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

  // Responsive canvas sizing (preserve 4:3 aspect)
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;

    const updateCanvasSize = () => {
      if (!canvasWrapperRef.current) return;
      const rect = canvasWrapperRef.current.getBoundingClientRect();
      const padding = 48;
      const availableWidth = Math.max(320, rect.width - padding);
      const availableHeight = Math.max(240, rect.height - padding);
      const widthScale = availableWidth / BASE_CANVAS.width;
      const heightScale = availableHeight / BASE_CANVAS.height;
      const rawScale = Math.min(widthScale, heightScale);
      const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, rawScale));
      const snappedScale = Math.round(clampedScale * 20) / 20; // increments of 0.05 for nice integers

      setCanvasSize({
        width: Math.round(BASE_CANVAS.width * snappedScale),
        height: Math.round(BASE_CANVAS.height * snappedScale),
      });
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    let resizeObserver;
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => updateCanvasSize());
      resizeObserver.observe(wrapper);
    }

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [toolbarPosition]);

  // Sync student lines to Ably
  useEffect(() => {
    if (!isRemoteUpdate.current && channel) {
      const timer = setTimeout(() => {
        channel.publish('student-layer', {
          lines: studentLines,
          clientId,
          meta: {
            base: BASE_CANVAS,
            display: canvasSize,
            scale: canvasScale,
          },
        });
        console.log('Published student layer:', studentLines.length, 'lines');
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [studentLines, channel, clientId, canvasSize, canvasScale]);

  const isAllowedPointerEvent = (evt) => {
    if (inputMode !== 'stylus-only') return true;
    return evt?.pointerType === 'pen';
  };

  const handlePointerDown = (e) => {
    const evt = e.evt;

    if (!isAllowedPointerEvent(evt)) {
      if (evt?.preventDefault) {
        evt.preventDefault();
      }
      return;
    }

    // Capture pointer for smooth tracking
    const stage = e.target.getStage();
    if (stage && evt.pointerId !== undefined) {
      const canvas = stage.content;
      if (canvas && canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(evt.pointerId);
        } catch (err) {
          // Ignore if pointer capture fails
        }
      }
    }

    if (tool === 'pen') {
      setIsDrawing(true);
      const pos = stage.getPointerPosition();
      const baseX = pos.x / canvasScale;
      const baseY = pos.y / canvasScale;
      const newLine = {
        tool,
        points: [baseX, baseY],
        color,
        strokeWidth: brushSize / canvasScale,
      };

      // Store in ref for smooth drawing
      currentLineRef.current = newLine;

      undoStack.current.push([...studentLines]);
      redoStack.current = [];

      // Immediately add the line to state
      setStudentLines([...studentLines, newLine]);
    } else if (tool === 'eraser') {
      setIsDrawing(true);
      eraserStateSaved.current = false;
    }

    if (evt.preventDefault) {
      evt.preventDefault();
    }
    if (evt.stopPropagation) {
      evt.stopPropagation();
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
      // Update the ref immediately for smooth drawing
      if (currentLineRef.current) {
        const baseX = point.x / canvasScale;
        const baseY = point.y / canvasScale;
        currentLineRef.current.points = currentLineRef.current.points.concat([baseX, baseY]);

        // Capture line in local variable before async operation
        const lineToUpdate = currentLineRef.current;

        // Cancel any pending animation frame
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        // Batch update using requestAnimationFrame for smooth rendering
        animationFrameRef.current = requestAnimationFrame(() => {
          if (lineToUpdate) {
            setStudentLines(prev => {
              // Make sure we're updating the last line
              if (prev.length > 0) {
                return [...prev.slice(0, -1), lineToUpdate];
              }
              return prev;
            });
          }
        });
      }
    } else if (tool === 'eraser') {
      const previousLength = studentLines.length;
      const pointerX = point.x;
      const pointerY = point.y;
      const eraserRadius = 20;

      const linesToKeep = studentLines.filter((line) => {
        for (let i = 0; i < line.points.length; i += 2) {
          const x = line.points[i] * canvasScale;
          const y = line.points[i + 1] * canvasScale;
          const distance = Math.sqrt(Math.pow(x - pointerX, 2) + Math.pow(y - pointerY, 2));
          if (distance < eraserRadius) {
            return false;
          }
        }
        return true;
      });

      if (linesToKeep.length < previousLength && !eraserStateSaved.current) {
        undoStack.current.push([...studentLines]);
        redoStack.current = [];
        eraserStateSaved.current = true;
      }

      setStudentLines(linesToKeep);
    }

    if (evt?.preventDefault) {
      evt.preventDefault();
    }
    if (evt?.stopPropagation) {
      evt.stopPropagation();
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
    currentLineRef.current = null; // Clear the current line ref
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
      await channel.publish('student-layer', {
        lines: [],
        clientId,
        meta: {
          base: BASE_CANVAS,
          display: canvasSize,
          scale: canvasScale,
        },
      });
      console.log('Published student clear');
    }
  };

  const getShortClientId = () => {
    return clientId.split('-')[1]?.substring(0, 3) || clientId;
  };

  const toggleInputMode = () => {
    setInputMode((prev) => (prev === 'stylus-only' ? 'all' : 'stylus-only'));
  };

  const toggleToolbarPosition = () => {
    setToolbarPosition((prev) => (prev === 'left' ? 'right' : 'left'));
  };

  const formatClientLabel = () => {
    const displayName = studentName && studentName !== 'Anonymous' ? studentName : getShortClientId();
    return `Connected as ${displayName}`;
  };
  const connectionLabel = isConnected ? 'Connected' : 'Reconnecting…';
  const connectionStateClass = isConnected ? 'online' : 'offline';

  const projectPointsForDisplay = (points) =>
    points.map((value, idx) => value * canvasScale);

  const projectStrokeWidth = (line) => (line.strokeWidth || 3) * canvasScale;

  return (
    <div className="student-canvas-page">
      <div className="student-canvas-container">
        <div className="student-status-bar">
          <div className="student-status-text">
            <h1>Student Canvas</h1>
            <p>{formatClientLabel()}</p>
          </div>
          <div className="student-status-actions">
            <div className="tool-status-indicator">
              <span className="tool-status-text">
                <i className={tool === 'pen' ? 'pi pi-pencil' : 'pi pi-eraser'}></i> {inputMode === 'all' ? 'All inputs' : 'Stylus only'}
              </span>
            </div>
            <div className={`connection-pill ${connectionStateClass}`} aria-live="polite">
              <span className="connection-indicator-dot" />
              <span>{connectionLabel}</span>
            </div>
            <button className="move-toolbar-btn" onClick={toggleToolbarPosition}>
              Move toolbar to {toolbarPosition === 'left' ? 'right' : 'left'}
            </button>
          </div>
        </div>

        <div className={`student-workspace ${toolbarPosition === 'right' ? 'toolbar-right' : ''}`}>
          {/* Sidebar */}
          <div className="student-sidebar">
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
              <div className="tool-buttons tool-icon-buttons">
                <button
                  onClick={() => setTool('pen')}
                  className={`tool-icon-button ${tool === 'pen' ? 'active' : ''}`}
                  title="Pen"
                >
                  <i className="pi pi-pencil tool-icon"></i>
                  <span className="tool-label">Pen</span>
                </button>
                <button
                  onClick={() => setTool('eraser')}
                  className={`tool-icon-button ${tool === 'eraser' ? 'active' : ''}`}
                  title="Eraser"
                >
                  <i className="pi pi-eraser tool-icon"></i>
                  <span className="tool-label">Eraser</span>
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
          {/* Input Mode */}
          <div className="sidebar-section">
            <h3 className="sidebar-label">INPUT MODE</h3>
            <button
              className={`input-mode-toggle ${inputMode === 'all' ? 'all-inputs' : ''}`}
              onClick={toggleInputMode}
            >
              {inputMode === 'stylus-only' ? 'Stylus mode (pen only)' : 'All inputs'}
            </button>
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
              <button onClick={handleClear} className="history-button danger">
                Clear
              </button>
            </div>
          </div>
          </div>

          {/* Canvas */}
          <div className="student-canvas-panel" ref={canvasWrapperRef}>
            <div className="student-canvas-frame">
              <div
                className="student-canvas-surface"
                style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}
              >
                <Stage
                  ref={stageRef}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onTouchStart={(e) => { e.evt?.preventDefault?.(); }}
                  onTouchMove={(e) => { e.evt?.preventDefault?.(); }}
                  onTouchEnd={(e) => { e.evt?.preventDefault?.(); }}
                  className="canvas-stage"
                  style={{ touchAction: 'none' }}
                  perfectDrawEnabled={false}
                  >
                    {/* Shared image layer (background) */}
                    <Layer listening={false}>
                      <SharedImageLayer
                        sharedImage={sharedImage}
                        canvasWidth={canvasSize.width}
                        canvasHeight={canvasSize.height}
                      />
                    </Layer>

                    {/* Student layer (editable) */}
                    <Layer>
                      {studentLines.map((line, i) => (
                        <Line
                        key={`student-${i}`}
                        points={projectPointsForDisplay(line.points)}
                        stroke={line.color}
                        strokeWidth={projectStrokeWidth(line)}
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
                        points={projectPointsForDisplay(line.points)}
                        stroke={line.color}
                        strokeWidth={projectStrokeWidth(line)}
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
        </div>
      </div>
    </div>
  );
}

export default Student;
