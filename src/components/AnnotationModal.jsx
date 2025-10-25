import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import './AnnotationModal.css';

/**
 * AnnotationModal - Full-screen view for annotating on a student's work
 * Implements same controls as original Teacher view: Pen, Eraser, Undo, Redo, Clear
 *
 * Props:
 * - student: { clientId, name, lines }
 * - isOpen: boolean
 * - onClose: Function to close modal
 * - onAnnotate: Function(annotations) - Called when teacher draws annotations
 * - existingAnnotations: Array of teacher's previous annotations for this student
 */
const AnnotationModal = ({ student, isOpen, onClose, onAnnotate, existingAnnotations = [] }) => {
  // Drawing state
  const [tool, setTool] = useState('pen');
  const [isDrawing, setIsDrawing] = useState(false);
  const [teacherAnnotations, setTeacherAnnotations] = useState([]);
  const [inputMode, setInputMode] = useState('all'); // 'all' or 'stylus-only'

  // Undo/redo stacks
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  const stageRef = useRef(null);
  const eraserStateSaved = useRef(false);
  const prevStudentIdRef = useRef(null);

  // Initialize annotations when student changes or modal opens
  useEffect(() => {
    if (isOpen && student && student.clientId !== prevStudentIdRef.current) {
      prevStudentIdRef.current = student.clientId;
      setTeacherAnnotations(existingAnnotations);
      undoStack.current = [];
      redoStack.current = [];
    }
  }, [isOpen, student, existingAnnotations]);

  if (!isOpen || !student) return null;

  const getStudentName = () => {
    if (student.name) return student.name;
    const match = student.clientId.match(/student-(\d+)/) || student.clientId.match(/load-test-student-(\d+)/);
    return match ? `Student ${match[1]}` : student.clientId;
  };

  const handlePointerDown = (e) => {
    // Check input mode - if stylus-only, only allow pen input
    const evt = e.evt;
    if (inputMode === 'stylus-only') {
      // In stylus-only mode, only allow pointerType === 'pen' (stylus)
      // Block mouse (MouseEvent) and touch (TouchEvent without pen type)
      if (!evt.pointerType || evt.pointerType !== 'pen') {
        return; // Ignore non-stylus input in stylus-only mode
      }
    }

    if (tool === 'pen') {
      setIsDrawing(true);
      const pos = e.target.getStage().getPointerPosition();
      const newLine = {
        tool: 'pen',
        points: [pos.x, pos.y],
        color: '#FF0000', // Red for teacher annotations
        strokeWidth: 3,
      };

      // Save current state to undo stack
      undoStack.current.push([...teacherAnnotations]);
      redoStack.current = []; // Clear redo stack on new action

      setTeacherAnnotations([...teacherAnnotations, newLine]);
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
      const lastLine = teacherAnnotations[teacherAnnotations.length - 1];
      if (lastLine) {
        lastLine.points = lastLine.points.concat([point.x, point.y]);
        setTeacherAnnotations([...teacherAnnotations.slice(0, -1), lastLine]);
      }
    } else if (tool === 'eraser') {
      const previousLength = teacherAnnotations.length;

      // Check if pointer is near any line and remove it
      const eraserRadius = 10;
      const linesToKeep = teacherAnnotations.filter((line) => {
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
        undoStack.current.push([...teacherAnnotations]);
        redoStack.current = [];
        eraserStateSaved.current = true;
      }

      setTeacherAnnotations(linesToKeep);
    }

    // Prevent default to avoid scrolling on touch devices
    const evt = e.evt;
    if (evt.preventDefault) {
      evt.preventDefault();
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    // Publish after drawing/erasing is complete
    onAnnotate(teacherAnnotations);
  };

  const handleUndo = () => {
    if (undoStack.current.length > 0) {
      const previousState = undoStack.current.pop();
      redoStack.current.push([...teacherAnnotations]);
      setTeacherAnnotations(previousState);
      // Publish after undo
      onAnnotate(previousState);
    }
  };

  const handleRedo = () => {
    if (redoStack.current.length > 0) {
      const nextState = redoStack.current.pop();
      undoStack.current.push([...teacherAnnotations]);
      setTeacherAnnotations(nextState);
      // Publish after redo
      onAnnotate(nextState);
    }
  };

  const handleClear = () => {
    undoStack.current.push([...teacherAnnotations]);
    redoStack.current = [];
    const emptyAnnotations = [];
    setTeacherAnnotations(emptyAnnotations);
    // Publish after clear
    onAnnotate(emptyAnnotations);
  };

  const handleClose = () => {
    setIsDrawing(false);
    onClose();
  };

  return (
    <div className="annotation-modal-overlay">
      <div className="annotation-modal">
        {/* Header */}
        <div className="annotation-modal-header">
          <div className="student-info">
            <span className="student-icon">👤</span>
            <h2>{getStudentName()}</h2>
            <span className="annotation-mode">Annotation Mode</span>
          </div>

          <div className="header-actions">
            <button className="close-btn" onClick={handleClose}>
              ✕ Close
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="annotation-toolbar">
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

        {/* Canvas */}
        <div className="annotation-canvas-container">
          <Stage
            ref={stageRef}
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
              touchAction: 'none' // Prevent default touch behaviors like scrolling
            }}
          >
            {/* Student's drawing (read-only, black) */}
            <Layer listening={false}>
              {student.lines && student.lines.map((line, i) => (
                <Line
                  key={`student-${i}`}
                  points={line.points}
                  stroke={line.color || 'black'}
                  strokeWidth={line.strokeWidth || 3}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                />
              ))}
            </Layer>

            {/* Teacher's annotations (red, editable) */}
            <Layer>
              {teacherAnnotations.map((line, i) => (
                <Line
                  key={`annotation-${i}`}
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

          {/* Instructions */}
          <div className="annotation-instructions">
            <p>🖊️ Draw in <span className="red-text">RED</span> to annotate on the student's work</p>
            <p>👁️ Student's drawing shown in black (read-only)</p>
            <p>📡 Your annotations sync to the student in real-time</p>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="annotation-modal-footer">
          <div className="stat">
            <span className="stat-label">Student Strokes:</span>
            <span className="stat-value">{student.lines?.length || 0}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Your Annotations:</span>
            <span className="stat-value red-text">{teacherAnnotations.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnotationModal;
