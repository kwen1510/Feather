// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Ably from 'ably/promises';
import StudentCard from '../components/StudentCard';
import './TestTeacher.css';

interface Student {
  studentId: string;
  clientId: string;
  name: string;
  lastUpdate: number;
  isActive: boolean;
  isFlagged: boolean;
  isVisible?: boolean;
  lines?: unknown[];
}

const TestTeacherSimple: React.FC = () => {
  const [searchParams] = useSearchParams();
  
  // Generate room code if not provided
  const generateRoomCode = (): string => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
  };

  const [roomId, setRoomId] = useState('');
  const roomInitialisedRef = useRef(false);

  useEffect(() => {
    if (roomInitialisedRef.current) return;

    const urlRoom = searchParams.get('room');
    if (urlRoom) {
      setRoomId(urlRoom.toUpperCase());
    } else {
      const newCode = generateRoomCode();
      setRoomId(newCode);
    }

    roomInitialisedRef.current = true;
  }, [searchParams]);

  // Ably connection
  const [ably, setAbly] = useState<Ably.Realtime | null>(null);
  const [channel, setChannel] = useState<Ably.RealtimeChannel | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [clientId] = useState(`test-teacher-${Math.random().toString(36).substring(7)}`);

  // Student management
  const [students, setStudents] = useState<Record<string, Student>>(() => {
    const botCount = parseInt(searchParams.get('bot') || '0');
    const botStudents: Record<string, Student> = {};

    if (botCount > 0) {
      for (let i = 1; i <= botCount; i++) {
        const studentId = `bot-student-${i}`;
        botStudents[studentId] = {
          studentId: studentId,
          clientId: `bot-${i}`,
          name: `Bot ${i}`,
          lastUpdate: Date.now() - (i * 1000),
          isActive: true,
          isFlagged: false,
        };
      }
    }

    return botStudents;
  });

  const [cardsPerRow, setCardsPerRow] = useState(4);
  const joinedStudentsRef = useRef(new Set<string>());
  const ablyInitializedRef = useRef(false);

  const extractStudentName = (clientId: string): string => {
    if (!clientId) return 'Student';
    const match = clientId.match(/student-(\d+)/) || clientId.match(/student-([\w]+)/);
    return match ? `Student ${match[1]}` : clientId;
  };

  // Connect to Ably
  useEffect(() => {
    if (ablyInitializedRef.current || !roomId || !clientId) return;

    ablyInitializedRef.current = true;
    let ablyClient: Ably.Realtime | null = null;
    let whiteboardChannel: Ably.RealtimeChannel | null = null;

    const connectToAbly = async () => {
      try {
        const tokenUrl = `/api/token?clientId=${clientId}`;
        const response = await fetch(tokenUrl);
        const tokenRequest = await response.json();

        ablyClient = new Ably.Realtime({
          authCallback: async (tokenParams, callback) => {
            callback(null, tokenRequest);
          },
          clientId: clientId,
        });

        ablyClient.connection.on('connected', () => {
          setIsConnected(true);
          console.log('✅ Test Teacher connected to Ably');
        });

        ablyClient.connection.on('disconnected', () => setIsConnected(false));
        ablyClient.connection.on('suspended', () => setIsConnected(false));
        ablyClient.connection.on('failed', () => setIsConnected(false));

        setAbly(ablyClient);

        whiteboardChannel = ablyClient.channels.get(`room-${roomId}`);

        // Listen for presence events
        whiteboardChannel.presence.subscribe('enter', (member) => {
          if (!member.clientId || member.clientId === clientId || !member.clientId.includes('student')) {
            return;
          }

          const studentName = (member.data as { name?: string })?.name || extractStudentName(member.clientId);
          const incomingClientId = member.clientId;
          const incomingStudentId = (member.data as { studentId?: string })?.studentId;

          console.log('👤 Student joined:', studentName, '| studentId:', incomingStudentId);

          if (!incomingStudentId) return;

          setStudents(prev => {
            const existingStudent = prev[incomingStudentId];
            const hasJoinedBefore = joinedStudentsRef.current.has(incomingStudentId);
            const isReconnection = (existingStudent && existingStudent.clientId) || (!existingStudent && hasJoinedBefore);

            if (!hasJoinedBefore) {
              joinedStudentsRef.current.add(incomingStudentId);
            }

            const newStudent: Student = {
              ...(existingStudent || {}),
              studentId: incomingStudentId,
              clientId: incomingClientId,
              name: studentName,
              isActive: true,
              isVisible: (member.data as { isVisible?: boolean })?.isVisible !== false,
              lastUpdate: Date.now(),
              isFlagged: existingStudent?.isFlagged || false,
            };

            console.log(isReconnection ? '🔄 Reconnected:' : '✅ New student:', studentName);

            return {
              ...prev,
              [incomingStudentId]: newStudent
            };
          });
        });

        whiteboardChannel.presence.subscribe('leave', (member) => {
          if (member.clientId !== clientId && member.clientId.includes('student')) {
            const leavingStudentId = (member.data as { studentId?: string })?.studentId;

            setStudents(prev => {
              const student = leavingStudentId ? prev[leavingStudentId] : null;
              if (!student) return prev;

              console.log('👋 Student left:', student.name);

              const { [leavingStudentId]: removed, ...remaining } = prev;
              return remaining;
            });
          }
        });

        // Listen for student drawing updates
        whiteboardChannel.subscribe('student-layer', (message) => {
          const { lines, studentId } = message.data as { lines?: unknown[]; studentId?: string };

          setStudents(prev => {
            if (!studentId || !prev[studentId]) return prev;

            return {
              ...prev,
              [studentId]: {
                ...prev[studentId],
                lines: lines || [],
              }
            };
          });
        });

        // Enter presence
        await whiteboardChannel.presence.enter({
          role: 'teacher',
          timestamp: Date.now()
        });

        // Load existing students
        const existingMembers = await whiteboardChannel.presence.get();
        
        setStudents(prevStudents => {
          const currentStudents = { ...prevStudents };

          existingMembers.forEach(member => {
            if (!member.clientId || member.clientId === clientId || !member.clientId.includes('student')) {
              return;
            }

            const studentName = (member.data as { name?: string })?.name || extractStudentName(member.clientId);
            const memberStudentId = (member.data as { studentId?: string })?.studentId;
            const memberClientId = member.clientId;

            if (!memberStudentId) return;

            const existingStudent = prevStudents[memberStudentId] || {};

            currentStudents[memberStudentId] = {
              ...existingStudent,
              studentId: memberStudentId,
              clientId: memberClientId,
              name: studentName,
              isActive: true,
              isVisible: (member.data as { isVisible?: boolean })?.isVisible !== false,
              lastUpdate: Date.now(),
              isFlagged: existingStudent.isFlagged || false,
            };

            joinedStudentsRef.current.add(memberStudentId);
            console.log('✅ Loaded from presence:', studentName);
          });

          return currentStudents;
        });

        setChannel(whiteboardChannel);
      } catch (error) {
        console.error('Failed to connect to Ably:', error);
      }
    };

    connectToAbly();

    return () => {
      if (whiteboardChannel) {
        whiteboardChannel.unsubscribe();
        whiteboardChannel.presence.unsubscribe();
      }

      if (ablyClient) {
        ablyClient.close();
      }
    };
  }, [roomId, clientId]);

  const handleCardClick = (student: Student) => {
    console.log('Card clicked:', student.name);
  };

  const toggleFlag = (studentId: string) => {
    setStudents(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        isFlagged: !prev[studentId]?.isFlagged,
      }
    }));
  };

  const studentsList = Object.values(students).sort((a, b) => {
    const nameA = (a.name || a.clientId || '').toLowerCase();
    const nameB = (b.name || b.clientId || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const activeCount = studentsList.filter(s => s.isActive).length;
  const loadTestCount = studentsList.filter(s => s.name?.includes('Load Test')).length;
  const botCount = studentsList.filter(s => s.name?.includes('Bot ')).length;

  return (
    <div className="test-teacher-dashboard">
      <div className="test-dashboard-shell">
        {/* Compact Header */}
        <div className="test-hero-card">
          <div className="test-hero-top">
            <div className="test-hero-copy">
              <h1>
                Load Test Dashboard
                <span className="test-mode-badge">TEST MODE</span>
              </h1>
            </div>
            <div className="test-session-info">
              <div className="test-session-code-pill">
                <span className="test-pill-label">Room Code</span>
                <span className="test-pill-value">{roomId}</span>
              </div>
              <div className="test-status-group">
                <span className={`test-status-pill ${isConnected ? 'online' : 'offline'}`}>
                  {isConnected ? '● Connected' : '○ Disconnected'}
                </span>
                <span className="test-status-pill test-count-pill">
                  <strong>{activeCount}</strong>
                  <span>online</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Overlay */}
        {studentsList.length > 0 && (
          <div className="test-stats-overlay">
            <div className="test-stats-title">Live Stats</div>
            <div className="test-stat-row">
              <span className="test-stat-label">Total:</span>
              <span className="test-stat-value">{studentsList.length}</span>
            </div>
            <div className="test-stat-row">
              <span className="test-stat-label">Active:</span>
              <span className="test-stat-value active">{activeCount}</span>
            </div>
            {loadTestCount > 0 && (
              <div className="test-stat-row">
                <span className="test-stat-label">Load Test:</span>
                <span className="test-stat-value" style={{ color: '#10b981' }}>{loadTestCount}</span>
              </div>
            )}
            {botCount > 0 && (
              <div className="test-stat-row">
                <span className="test-stat-label">Bots:</span>
                <span className="test-stat-value" style={{ color: '#8b5cf6' }}>{botCount}</span>
              </div>
            )}
          </div>
        )}

        {/* Students Panel */}
        <div className="test-students-panel">
          <div className="test-students-header">
            <h2 className="test-students-title">
              Student Canvases
              {studentsList.length > 0 && ` (${studentsList.length})`}
            </h2>
            <div className="test-grid-controls">
              <span>Cards/row:</span>
              <select value={cardsPerRow} onChange={(e) => setCardsPerRow(Number(e.target.value))}>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
                <option value={6}>6</option>
              </select>
            </div>
          </div>

          {studentsList.length === 0 ? (
            <div className="test-waiting-card">
              <div className="test-waiting-icon">👥</div>
              <h2>Waiting for students to join…</h2>
              <p>
                Share the <span className="inline-pill">room code</span> shown above.
                <br />
                Students will appear here once they connect via Ably.
              </p>
            </div>
          ) : (
            <div
              className="test-students-grid"
              style={{
                gridTemplateColumns: `repeat(${cardsPerRow}, 1fr)`
              }}
            >
              {studentsList
                .filter(student => student && student.studentId)
                .map(student => (
                  <div key={student.studentId} style={{ position: 'relative' }}>
                    <StudentCard
                      student={student}
                      onClick={handleCardClick}
                      onToggleFlag={toggleFlag}
                      teacherAnnotations={[]}
                      sharedImage={null}
                      hideNames={false}
                    />
                    {student.name?.includes('Load Test') && (
                      <div className="load-test-indicator">
                        LOAD TEST
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestTeacherSimple;

