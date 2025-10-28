import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line, Image as KonvaImage } from 'react-konva';
import { Pen, Eraser, Undo, Redo, Trash2 } from 'lucide-react';
import FlagIcon from './FlagIcon';
import './AnnotationModal.css';

const BASE_CANVAS = { width: 800, height: 600 };
const TEACHER_PREFS_KEY = 'teacherAnnotationPrefs';
const PREFS_VERSION = 2; // Increment when adding new preferences
const colorOptions = [
  { label: 'Red', value: '#FF3B30' },
  { label: 'Purple', value: '#7C3AED' },
  { label: 'Teal', value: '#0EA5E9' },
];

const AnnotationModal = ({
  student,
  isOpen,
  onClose,
  onAnnotate,
  existingAnnotations = [],
  isFlagged = false,
  onToggleFlag,
  sharedImage,
}) => {
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(colorOptions[0].value);
  const [brushSize, setBrushSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [teacherAnnotations, setTeacherAnnotations] = useState([]);
  const [inputMode, setInputMode] = useState('stylus-only');
  const [toolbarPosition, setToolbarPosition] = useState('left');
  const [image, setImage] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const eraserStateSaved = useRef(false);
  const prevStudentIdRef = useRef(null);
  const isFirstRender = useRef(true);
  const scrollPositionRef = useRef(0);

  // Performance optimization: keep current line in ref to avoid re-renders
  const currentLineRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Load shared image
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

  const canvasFrameRef = useRef(null);
  const stageRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 720 });

  const scales = useMemo(
    () => ({
      x: canvasSize.width / BASE_CANVAS.width,
      y: canvasSize.height / BASE_CANVAS.height,
    }),
    [canvasSize]
  );

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load saved preferences ONCE on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(TEACHER_PREFS_KEY);
      if (stored) {
        const prefs = JSON.parse(stored);
        if (prefs.version !== PREFS_VERSION) {
          localStorage.removeItem(TEACHER_PREFS_KEY);
          return;
        }
        if (prefs.tool) setTool(prefs.tool);
        if (prefs.color) setColor(prefs.color);
        if (typeof prefs.brushSize === 'number') setBrushSize(prefs.brushSize);
        if (prefs.inputMode) setInputMode(prefs.inputMode);
        if (prefs.toolbarPosition) setToolbarPosition(prefs.toolbarPosition);
      }
    } catch (error) {
      localStorage.removeItem(TEACHER_PREFS_KEY);
    }
  }, []);

  // Save preferences when they change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const prefs = { version: PREFS_VERSION, tool, color, brushSize, inputMode, toolbarPosition };
    localStorage.setItem(TEACHER_PREFS_KEY, JSON.stringify(prefs));
  }, [tool, color, brushSize, inputMode, toolbarPosition]);

  // Sync annotations when switching between students
  useEffect(() => {
    if (isOpen && student && student.clientId !== prevStudentIdRef.current) {
      prevStudentIdRef.current = student.clientId;
      setTeacherAnnotations(existingAnnotations);
      undoStack.current = [];
      redoStack.current = [];
    }
  }, [isOpen, student, existingAnnotations]);

  // Update annotations when existingAnnotations changes (e.g., when clearing all)
  useEffect(() => {
    if (isOpen && student) {
      setTeacherAnnotations(existingAnnotations);
    }
  }, [existingAnnotations, isOpen, student]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Prevent body scrolling and touch events when modal is open
  useEffect(() => {
    if (!isOpen) return;

    // Save original body styles
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTouchAction = document.body.style.touchAction;
    const originalWidth = document.body.style.width;
    const originalTop = document.body.style.top;

    // Lock scroll and remember current position
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    scrollPositionRef.current = scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.touchAction = 'none';

    const canvasFrame = canvasFrameRef.current;

    // Prevent touch events and gestures ONLY on canvas area, not buttons
    const preventTouch = (e) => {
      // Only prevent if the touch is on the canvas area, not on buttons/sidebar
      const target = e.target;
      const isButton = target.closest('button') || target.closest('.annotation-sidebar') || target.closest('.annotation-status-actions');

      if (!isButton) {
        e.preventDefault();
      }
    };

    const preventGesture = (e) => {
      e.preventDefault();
    };

    const preventSelection = (e) => {
      if (isDrawing) {
        e.preventDefault();
        return false;
      }
    };

    if (canvasFrame) {
      // Add listeners to canvas frame only, not entire document
      canvasFrame.addEventListener('touchstart', preventTouch, { passive: false });
      canvasFrame.addEventListener('touchmove', preventTouch, { passive: false });
      canvasFrame.addEventListener('gesturestart', preventGesture, { passive: false });
      canvasFrame.addEventListener('gesturechange', preventGesture, { passive: false });
    }
    document.addEventListener('selectstart', preventSelection);

    return () => {
      // Restore original styles
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.width = originalWidth;
      document.body.style.top = originalTop;
      document.body.style.touchAction = originalTouchAction;

      if (canvasFrame) {
        canvasFrame.removeEventListener('touchstart', preventTouch);
        canvasFrame.removeEventListener('touchmove', preventTouch);
        canvasFrame.removeEventListener('gesturestart', preventGesture);
        canvasFrame.removeEventListener('gesturechange', preventGesture);
      }
      document.removeEventListener('selectstart', preventSelection);

      // Restore saved scroll position (with delay to ensure body styles are restored first)
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollPositionRef.current);
      });
    };
  }, [isOpen, isDrawing]);

  useEffect(() => {
    if (!isOpen) return;
    const resize = () => {
      if (!canvasFrameRef.current) return;
      const rect = canvasFrameRef.current.getBoundingClientRect();

      // Account for padding (12px × 2 = 24px) + border (2px × 2 = 4px) = 28px total
      const padding = 24;
      const borderSize = 4;
      const totalSpace = padding + borderSize;
      const availableWidth = Math.max(320, rect.width - totalSpace);
      const availableHeight = Math.max(240, rect.height - totalSpace);

      // Use same scaling logic as Student.jsx to maintain exact 4:3 aspect ratio
      const widthScale = availableWidth / BASE_CANVAS.width;
      const heightScale = availableHeight / BASE_CANVAS.height;
      const scale = Math.min(widthScale, heightScale);

      setCanvasSize({
        width: Math.round(BASE_CANVAS.width * scale),
        height: Math.round(BASE_CANVAS.height * scale)
      });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [toolbarPosition, isOpen]);

  // Calculate image display position
  const getImageLayout = () => {
    if (!sharedImage || !image) return null;

    const imageAspect = sharedImage.width / sharedImage.height;
    const canvasAspect = canvasSize.width / canvasSize.height;

    let displayWidth, displayHeight, x, y;

    if (imageAspect > canvasAspect) {
      displayWidth = canvasSize.width;
      displayHeight = canvasSize.width / imageAspect;
      x = 0;
      y = (canvasSize.height - displayHeight) / 2;
    } else {
      displayHeight = canvasSize.height;
      displayWidth = canvasSize.height * imageAspect;
      x = (canvasSize.width - displayWidth) / 2;
      y = 0;
    }

    return { x, y, width: displayWidth, height: displayHeight };
  };

  if (!isOpen || !student) return null;

  const imageLayout = getImageLayout();

  const getStudentName = () => {
    if (student.name) return student.name;
    const match = student.clientId.match(/student-(\d+)/) || student.clientId.match(/load-test-student-(\d+)/);
    return match ? `Student ${match[1]}` : student.clientId;
  };

  const isAllowedPointerEvent = (evt) => {
    if (inputMode !== 'stylus-only') return true;
    return evt?.pointerType === 'pen';
  };

  const projectPoints = (points = []) =>
    points.map((value, index) => (index % 2 === 0 ? value * scales.x : value * scales.y));

  const normalizePoint = (point) => ({ x: point.x / scales.x, y: point.y / scales.y });

  const projectedStroke = (line) => (line.strokeWidth || 3) * scales.x;

  const handlePointerDown = (e) => {
    const evt = e.evt;

    // Prevent default and stop propagation to avoid scrolling
    if (evt?.preventDefault) evt.preventDefault();
    if (evt?.stopPropagation) evt.stopPropagation();

    if (!isAllowedPointerEvent(evt)) {
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
      const { x, y } = normalizePoint(pos);
      const newLine = { tool: 'pen', points: [x, y], color, strokeWidth: brushSize };
      undoStack.current.push([...teacherAnnotations]);
      redoStack.current = [];

      // Store reference to current line for performance
      currentLineRef.current = newLine;
      setTeacherAnnotations([...teacherAnnotations, newLine]);
    } else if (tool === 'eraser') {
      setIsDrawing(true);
      eraserStateSaved.current = false;
    }
  };

  const handlePointerMove = (e) => {
    // Prevent default and stop propagation first
    const evt = e.evt;
    if (evt?.preventDefault) evt.preventDefault();
    if (evt?.stopPropagation) evt.stopPropagation();

    if (!isDrawing) return;

    if (!isAllowedPointerEvent(evt)) {
      return;
    }

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    if (tool === 'pen') {
      // Performance optimization: directly mutate points array in ref
      if (currentLineRef.current) {
        const { x, y } = normalizePoint(point);
        currentLineRef.current.points = currentLineRef.current.points.concat([x, y]);

        // Capture the current line in a local variable to avoid null reference
        const lineToUpdate = currentLineRef.current;

        // Use requestAnimationFrame to batch updates and avoid excessive re-renders
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        animationFrameRef.current = requestAnimationFrame(() => {
          // Force a single re-render with updated line (use captured value for safety)
          if (lineToUpdate) {
            setTeacherAnnotations(prev => {
              if (prev.length === 0) return prev;
              return [...prev.slice(0, -1), lineToUpdate];
            });
          }
        });
      }
    } else if (tool === 'eraser') {
      const previousLength = teacherAnnotations.length;
      const eraserRadius = 20;
      const linesToKeep = teacherAnnotations.filter((line) => {
        for (let i = 0; i < line.points.length; i += 2) {
          const x = line.points[i] * scales.x;
          const y = line.points[i + 1] * scales.y;
          const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
          if (distance < eraserRadius) return false;
        }
        return true;
      });

      if (linesToKeep.length < previousLength && !eraserStateSaved.current) {
        undoStack.current.push([...teacherAnnotations]);
        redoStack.current = [];
        eraserStateSaved.current = true;
      }

      setTeacherAnnotations(linesToKeep);
    }
  };

  const handlePointerUp = (e) => {
    const evt = e?.evt;
    if (!isAllowedPointerEvent(evt)) {
      if (evt?.preventDefault) evt.preventDefault();
      return;
    }

    setIsDrawing(false);

    // Flush any pending animation frame to ensure final points are saved
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Ensure the final line is properly saved with all points
    if (currentLineRef.current && tool === 'pen') {
      const finalLine = currentLineRef.current;
      setTeacherAnnotations(prev => {
        if (prev.length === 0) return prev;
        // Replace the last line (which we added in handlePointerDown) with the final version
        const updated = [...prev.slice(0, -1), finalLine];
        // Sync to server after state update
        setTimeout(() => onAnnotate(updated), 0);
        return updated;
      });
      // Clear current line ref
      currentLineRef.current = null;
    } else {
      // No current line ref (eraser mode or something else), just sync current state
      setTimeout(() => onAnnotate(teacherAnnotations), 0);
    }
  };

  const handleUndo = () => {
    if (undoStack.current.length > 0) {
      const previousState = undoStack.current.pop();
      redoStack.current.push([...teacherAnnotations]);
      setTeacherAnnotations(previousState);
      onAnnotate(previousState);
    }
  };

  const handleRedo = () => {
    if (redoStack.current.length > 0) {
      const nextState = redoStack.current.pop();
      undoStack.current.push([...teacherAnnotations]);
      setTeacherAnnotations(nextState);
      onAnnotate(nextState);
    }
  };

  const handleClear = () => {
    undoStack.current.push([...teacherAnnotations]);
    redoStack.current = [];
    const emptyAnnotations = [];
    setTeacherAnnotations(emptyAnnotations);
    onAnnotate(emptyAnnotations);
  };

  const handleFlagToggle = () => {
    if (onToggleFlag) onToggleFlag(student.clientId);
  };

  const handleClose = () => {
    setIsDrawing(false);
    onClose();
  };

  // Removed click-outside-to-close functionality - only Close button can close modal

  const toggleInputMode = () => {
    setInputMode((prev) => (prev === 'stylus-only' ? 'all' : 'stylus-only'));
  };

  const toggleToolbarPosition = () => {
    setToolbarPosition((prev) => (prev === 'left' ? 'right' : 'left'));
  };

  // Prevent all touch/pointer events from reaching the overlay/body
  const handleOverlayTouchMove = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="annotation-modal-overlay"
      onTouchMove={handleOverlayTouchMove}
      onTouchStart={handleOverlayTouchMove}
    >
      <div className="annotation-modal student-console">
        <div className="annotation-console">
          <div className="annotation-status-bar">
            <div className="annotation-status-text">
              <h1>Annotate Student</h1>
              <p>{getStudentName()}</p>
            </div>
            <div className="annotation-status-actions">
              <div className="tool-status-indicator">
                <span className="tool-status-text">
                  <i className={tool === 'pen' ? 'pi pi-pencil' : 'pi pi-eraser'}></i> {inputMode === 'all' ? 'All inputs' : 'Stylus only'}
                </span>
              </div>
              <button className={`flag-pill ${isFlagged ? 'active' : ''}`} onClick={handleFlagToggle}>
                <FlagIcon active={isFlagged} size={16} />
                {isFlagged ? 'Flagged' : 'Flag'}
              </button>
              <button className="status-badge" onClick={toggleToolbarPosition}>
                Move toolbar to {toolbarPosition === 'left' ? 'right' : 'left'}
              </button>
              <button className="status-badge danger" onClick={handleClose}>
                ✕ Close
              </button>
            </div>
          </div>

          <div className={`annotation-workspace ${toolbarPosition === 'right' ? 'toolbar-right' : ''} ${isMobile ? 'mobile-view' : ''}`}>
            {isMobile ? (
              /* Mobile Toolbar - Compact horizontal layout */
              <div className="mobile-annotation-toolbar">
                {/* Horizontal color buttons */}
                <div className="mobile-colors">
                  {colorOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setColor(option.value)}
                      className={`mobile-color-button ${color === option.value ? 'active' : ''}`}
                      style={{ background: option.value }}
                      aria-label={option.label}
                    />
                  ))}
                </div>

                {/* Tool and action buttons */}
                <div className="mobile-tools">
                  <button
                    onClick={() => setTool('pen')}
                    className={`mobile-tool-button ${tool === 'pen' ? 'active' : ''}`}
                    aria-label="Pen"
                  >
                    <Pen size={20} />
                  </button>
                  <button
                    onClick={() => setTool('eraser')}
                    className={`mobile-tool-button ${tool === 'eraser' ? 'active' : ''}`}
                    aria-label="Eraser"
                  >
                    <Eraser size={20} />
                  </button>
                  <button
                    onClick={handleUndo}
                    className="mobile-tool-button"
                    disabled={undoStack.current.length === 0}
                    aria-label="Undo"
                  >
                    <Undo size={20} />
                  </button>
                  <button
                    onClick={handleRedo}
                    className="mobile-tool-button"
                    disabled={redoStack.current.length === 0}
                    aria-label="Redo"
                  >
                    <Redo size={20} />
                  </button>
                  <button
                    onClick={handleClear}
                    className="mobile-tool-button danger"
                    aria-label="Clear"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ) : (
              /* Desktop Sidebar - Full vertical layout */
              <div className="annotation-sidebar">
              <div className="sidebar-header">
                <h2>Annotation Console</h2>
                <p>Mirror of student workspace</p>
              </div>

              <div className="sidebar-section">
                <h3 className="sidebar-label">COLORS</h3>
                <div className="color-row">
                  {colorOptions.map((option) => (
                    <button
                      key={option.value}
                      className={`color-button ${color === option.value ? 'active' : ''}`}
                      style={{ background: option.value }}
                      onClick={() => setColor(option.value)}
                      aria-label={option.label}
                    />
                  ))}
                </div>
              </div>

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

              <div className="sidebar-section">
                <h3 className="sidebar-label">BRUSH SIZE</h3>
                <div className="brush-size-control">
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

              <div className="sidebar-section">
                <h3 className="sidebar-label">INPUT MODE</h3>
                <button
                  className={`input-mode-toggle ${inputMode === 'all' ? 'all' : ''}`}
                  onClick={toggleInputMode}
                >
                  {inputMode === 'stylus-only' ? 'Stylus only' : 'All inputs'}
                </button>
              </div>

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
            )}

            <div className="annotation-canvas-panel">
              <div
                className="annotation-canvas-frame"
                ref={canvasFrameRef}
                onTouchMove={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
              >
                <Stage
                  ref={stageRef}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onTouchStart={(e) => e.preventDefault()}
                  onTouchMove={(e) => e.preventDefault()}
                  onTouchEnd={(e) => e.preventDefault()}
                  className="annotation-stage"
                  perfectDrawEnabled={false}
                >
                  {/* Shared image background layer */}
                  {imageLayout && (
                    <Layer listening={false}>
                      <KonvaImage
                        image={image}
                        x={imageLayout.x}
                        y={imageLayout.y}
                        width={imageLayout.width}
                        height={imageLayout.height}
                      />
                    </Layer>
                  )}

                  {/* Student drawing layer */}
                  <Layer listening={false}>
                    {student.lines && student.lines.map((line, i) => (
                      <Line
                        key={`student-${i}`}
                        points={projectPoints(line.points)}
                        stroke={line.color || 'black'}
                        strokeWidth={(line.strokeWidth || 3) * scales.x}
                        tension={0.5}
                        lineCap="round"
                        lineJoin="round"
                      />
                    ))}
                  </Layer>

                  <Layer>
                    {teacherAnnotations.map((line, i) => (
                      <Line
                        key={`annotation-${i}`}
                        points={projectPoints(line.points)}
                        stroke={line.color}
                        strokeWidth={projectedStroke(line)}
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
};

export default AnnotationModal;
