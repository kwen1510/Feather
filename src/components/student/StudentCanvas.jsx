import React from 'react';
import { Stage, Layer, Line } from 'react-konva';
import SharedImageLayer from './SharedImageLayer';

const StudentCanvas = ({
  canvasWrapperRef,
  canvasSize,
  stageRef,
  isLoadingData,
  sharedImage,
  studentLines,
  teacherLines,
  projectPointsForDisplay,
  projectStrokeWidth,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
}) => {
  return (
    <div className="student-canvas-panel" ref={canvasWrapperRef}>
      <div className="student-canvas-frame">
        {isLoadingData && (
          <div className="canvas-loading-overlay">
            <div className="loading-spinner"></div>
            <p>Loading your work...</p>
          </div>
        )}
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
            onTouchStart={(e) => {
              e.evt?.preventDefault?.();
            }}
            onTouchMove={(e) => {
              e.evt?.preventDefault?.();
            }}
            onTouchEnd={(e) => {
              e.evt?.preventDefault?.();
            }}
            className="canvas-stage"
            style={{ touchAction: 'none' }}
            perfectDrawEnabled={false}
          >
            <Layer listening={false}>
              <SharedImageLayer
                sharedImage={sharedImage}
                canvasWidth={canvasSize.width}
                canvasHeight={canvasSize.height}
              />
            </Layer>

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
  );
};

export default StudentCanvas;
