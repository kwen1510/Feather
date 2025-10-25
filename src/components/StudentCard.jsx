import React, { useRef, useEffect } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import './StudentCard.css';

/**
 * StudentCard - Shows a preview of a student's drawing
 *
 * Props:
 * - student: { clientId, name, lines, lastUpdate, isActive }
 * - onClick: Function called when card is clicked
 * - teacherAnnotations: Array of teacher annotation lines for this student
 */
const StudentCard = ({ student, onClick, teacherAnnotations = [] }) => {
  const stageRef = useRef(null);

  // Format student name from clientId
  const getStudentName = () => {
    if (student.name) return student.name;
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

  return (
    <div
      className={`student-card ${student.isActive ? 'active' : 'inactive'}`}
      onClick={() => onClick(student)}
    >
      {/* Student Info Header */}
      <div className="student-card-header">
        <div className="student-name">
          <span className="student-icon">👤</span>
          {getStudentName()}
        </div>
        <div className="student-status">
          <span className={`status-dot ${student.isActive ? 'online' : 'offline'}`}></span>
        </div>
      </div>

      {/* Canvas Preview */}
      <div className="student-card-canvas">
        <div style={{
          width: '200px',
          height: '150px',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <Stage
            ref={stageRef}
            width={800}
            height={600}
            scaleX={0.25}
            scaleY={0.25}
            style={{
              transformOrigin: 'top left'
            }}
          >
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
        </div>

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
