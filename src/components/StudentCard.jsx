import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Line, Image as KonvaImage } from 'react-konva';
import FlagIcon from './FlagIcon';
import './StudentCard.css';

/**
 * StudentCard - Shows a preview of a student's drawing
 *
 * Props:
 * - student: { clientId, name, lines, lastUpdate, isActive }
 * - onClick: Function called when card is clicked
 * - teacherAnnotations: Array of teacher annotation lines for this student
 * - sharedImage: Shared image from teacher
 * - hideNames: Whether to hide student names
 */
const StudentCard = ({ student, onClick, onToggleFlag, teacherAnnotations = [], sharedImage, hideNames = false }) => {
  const stageRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const [image, setImage] = useState(null);
  const [canvasWidth, setCanvasWidth] = useState(300);

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

  // Measure canvas container width for responsive sizing
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const updateSize = () => {
      if (canvasContainerRef.current) {
        setCanvasWidth(canvasContainerRef.current.clientWidth);
      }
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(canvasContainerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Format student name from clientId
  const getStudentName = () => {
    if (student?.name) return student.name;
    if (!student?.clientId) return 'Unknown Student';
    // Extract name from clientId (e.g., "student-123" or "load-test-student-1")
    const match = student.clientId.match(/student-(\d+)/);
    return match ? `Student ${match[1]}` : student.clientId;
  };

  // Get time since last update
  const getLastUpdateText = () => {
    if (!student.lastUpdate) return 'Just joined';
    const seconds = Math.floor((Date.now() - student.lastUpdate) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  const baseWidth = student.meta?.base?.width || 800;
  const baseHeight = student.meta?.base?.height || 600;

  // Calculate scale to fit container
  // Container has 4:3 aspect ratio (same as base 800x600)
  const scale = canvasWidth / baseWidth;

  const handleFlagToggle = (event) => {
    event.stopPropagation();
    if (onToggleFlag) {
      onToggleFlag(student.clientId);
    }
  };

  // Calculate image display position
  const getImageLayout = () => {
    if (!sharedImage || !image) return null;

    const imageAspect = sharedImage.width / sharedImage.height;
    const canvasAspect = baseWidth / baseHeight;

    let displayWidth, displayHeight, x, y;

    if (imageAspect > canvasAspect) {
      displayWidth = baseWidth;
      displayHeight = baseWidth / imageAspect;
      x = 0;
      y = (baseHeight - displayHeight) / 2;
    } else {
      displayHeight = baseHeight;
      displayWidth = baseHeight * imageAspect;
      x = (baseWidth - displayWidth) / 2;
      y = 0;
    }

    return { x, y, width: displayWidth, height: displayHeight };
  };

  const imageLayout = getImageLayout();

  return (
    <div
      className={`student-card ${student.isActive ? 'active' : 'inactive'}`}
      onClick={() => onClick(student)}
    >
      {/* Student Info Header */}
      <div className="student-card-header">
        <div className="student-name">
          <span className="student-icon">👤</span>
          {hideNames ? '•••' : getStudentName()}
        </div>
        <div className="student-header-actions">
          <button
            className={`flag-button ${student.isFlagged ? 'active' : ''}`}
            onClick={handleFlagToggle}
            aria-label={student.isFlagged ? 'Remove flag' : 'Flag student'}
            title={student.isFlagged ? 'Remove flag' : 'Flag student'}
          >
            <FlagIcon active={student.isFlagged} size={18} />
          </button>
          <div className="student-status">
            <span className={`status-dot ${student.isActive ? 'online' : 'offline'}`}></span>
            {student.isVisible === false && student.isActive && (
              <span
                className="visibility-indicator away"
                title="Student is distracted (switched away from tab)"
              >
                ⚠️
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Canvas Preview */}
      <div className="student-card-canvas" ref={canvasContainerRef}>
        <Stage
          ref={stageRef}
          width={baseWidth}
          height={baseHeight}
          scaleX={scale}
          scaleY={scale}
          style={{
            transformOrigin: 'top left',
            width: '100%',
            height: '100%'
          }}
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

            {/* Student layer (black) */}
            <Layer>
              {student.lines && student.lines.map((line, i) => (
                <Line
                  key={`preview-${student.clientId}-${i}`}
                  points={line.points}
                  stroke={line.color || 'black'}
                  strokeWidth={line.strokeWidth || 3}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                />
              ))}
            </Layer>

            {/* Teacher annotations layer (red) */}
            <Layer>
              {teacherAnnotations.map((line, i) => (
                <Line
                  key={`annotation-${student.clientId}-${i}`}
                  points={line.points}
                  stroke={line.color || '#FF0000'}
                  strokeWidth={line.strokeWidth || 3}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                />
              ))}
            </Layer>
          </Stage>

        {/* No Drawing Placeholder */}
        {(!student.lines || student.lines.length === 0) && (
          <div className="no-drawing">
            <span>✏️</span>
            <p>No drawing yet</p>
          </div>
        )}

        {/* Stroke Count */}
        {student.lines && student.lines.length > 0 && (
          <div className="stroke-count">
            {student.lines.length} stroke{student.lines.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className="student-card-footer">
        <span className="last-update">{getLastUpdateText()}</span>
        <span className="click-hint">Click to annotate →</span>
      </div>
    </div>
  );
};

export default StudentCard;
