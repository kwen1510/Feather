// @ts-nocheck
import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Stage, Layer, Line } from 'react-konva';
import * as Ably from 'ably';
import './StudentNew.css';

const BASE_CANVAS = { width: 800, height: 600 };

interface Line {
  tool: string;
  points: number[];
  color: string;
  strokeWidth: number;
}

const TestStudent: React.FC = () => {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room') || 'load-test';
  const studentName = searchParams.get('name') || `TestStudent-${Date.now()}`;

  const [channel, setChannel] = useState<Ably.RealtimeChannel | null>(null);
  const [clientId] = useState(`test-student-${Math.random().toString(36).substr(2, 9)}`);
  const [isConnected, setIsConnected] = useState(false);

  // Student lines (editable)
  const [studentLines, setStudentLines] = useState<Line[]>([]);
  // Teacher lines (read-only)
  const [teacherLines, setTeacherLines] = useState<Line[]>([]);

  // Drawing state
  const [tool, setTool] = useState('pen');
  const [isDrawing, setIsDrawing] = useState(false);

  const isRemoteUpdate = useRef(false);

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

        // Wait for channel to attach
        await new Promise<void>((resolve, reject) => {
          whiteboardChannel.once('attached', () => resolve());
          whiteboardChannel.once('failed', reject);
          whiteboardChannel.attach();
        });

        console.log('✅ Test Student channel attached');

        // Enter presence
        const presenceData = {
          name: studentName,
          role: 'student',
          testMode: true
        };
        console.log('📍 Entering presence with data:', presenceData);
        await whiteboardChannel.presence.enter(presenceData);
        console.log('✅ Test Student entered presence as:', studentName);

        // Subscribe to student layer
        whiteboardChannel.subscribe('student-layer', (message) => {
          isRemoteUpdate.current = true;
          const data = message.data as { action?: string; lines?: Line[] };

          if (data.action === 'clear') {
            setStudentLines([]);
          } else if (data.lines) {
            setStudentLines(prev => [...prev, ...data.lines!]);
          }

          setTimeout(() => {
            isRemoteUpdate.current = false;
          }, 0);
        });

        // Subscribe to teacher layer
        whiteboardChannel.subscribe('teacher-layer', (message) => {
          const data = message.data as { action?: string; lines?: Line[] };

          if (data.action === 'clear') {
            setTeacherLines([]);
          } else if (data.lines) {
            setTeacherLines(prev => [...prev, ...data.lines!]);
          }
        });

        setChannel(whiteboardChannel);
      } catch (error) {
        console.error('Failed to initialize Ably:', error);
      }
    };

    initAbly();
  }, [clientId, roomId, studentName]);

  // Drawing handlers
  const handleMouseDown = (e: any) => {
    const pos = e.target.getStage().getPointerPosition();
    if (!pos) return;

    setIsDrawing(true);
    const newLine: Line = {
      tool,
      points: [pos.x, pos.y],
      color: 'black',
      strokeWidth: 3,
    };
    setStudentLines([...studentLines, newLine]);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing) return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    if (!point) return;

    const lastLine = studentLines[studentLines.length - 1];
    if (!lastLine) return;

    lastLine.points = lastLine.points.concat([point.x, point.y]);
    setStudentLines([...studentLines.slice(0, -1), lastLine]);
  };

  const handleMouseUp = () => {
    if (!isDrawing || !channel) {
      setIsDrawing(false);
      return;
    }

    setIsDrawing(false);

    const lastLine = studentLines[studentLines.length - 1];
    if (lastLine && lastLine.points.length >= 4) {
      channel.publish('student-layer', { lines: [lastLine] });
    }
  };

  const handleClear = () => {
    setStudentLines([]);
    if (channel) {
      channel.publish('student-layer', { action: 'clear' });
    }
  };

  return (
    <div className="student-container">
      {/* Header */}
      <div className="student-header">
        <div className="student-info">
          <span className="student-name">{studentName}</span>
          <span className="room-code">Room: {roomId}</span>
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </span>
        </div>
        <div className="test-badge">TEST MODE</div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <button
          className={`tool-btn ${tool === 'pen' ? 'active' : ''}`}
          onClick={() => setTool('pen')}
          title="Pen"
        >
          ✏️ Pen
        </button>
        <button
          className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
          onClick={() => setTool('eraser')}
          title="Eraser"
        >
          🧹 Eraser
        </button>
        <button
          className="tool-btn"
          onClick={handleClear}
          title="Clear Canvas"
        >
          🗑️ Clear
        </button>
      </div>

      {/* Canvas */}
      <div className="canvas-container">
        <Stage
          width={BASE_CANVAS.width}
          height={BASE_CANVAS.height}
          onMouseDown={handleMouseDown}
          onMousemove={handleMouseMove}
          onMouseup={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
          className="konva-stage"
        >
          {/* Student drawing layer */}
          <Layer>
            {studentLines.map((line, i) => (
              <Line
                key={`student-${i}`}
                points={line.points}
                stroke={line.tool === 'eraser' ? 'white' : line.color}
                strokeWidth={line.tool === 'eraser' ? 20 : line.strokeWidth}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={
                  line.tool === 'eraser' ? 'destination-out' : 'source-over'
                }
              />
            ))}
          </Layer>

          {/* Teacher annotation layer (read-only) */}
          <Layer listening={false}>
            {teacherLines.map((line, i) => (
              <Line
                key={`teacher-${i}`}
                points={line.points}
                stroke="red"
                strokeWidth={line.strokeWidth || 3}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                opacity={0.7}
              />
            ))}
          </Layer>
        </Stage>
      </div>

      {/* Instructions */}
      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: '#f0f0f0',
        padding: '10px',
        borderRadius: '8px',
        fontSize: '12px'
      }}>
        <div><strong>Test Mode Instructions:</strong></div>
        <div>• No login required</div>
        <div>• Draw on canvas to test</div>
        <div>• Red lines are from teacher</div>
      </div>
    </div>
  );
};

export default TestStudent;

