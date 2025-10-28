import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Ably from 'ably/promises';
import './TeacherDashboard.css';

const TestTeacher = () => {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room') || 'load-test';

  // Ably connection
  const [ably, setAbly] = useState(null);
  const [channel, setChannel] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [clientId] = useState(`test-teacher-${Math.random().toString(36).substring(7)}`);

  // Student management
  const [students, setStudents] = useState({});

  // Initialize Ably and connect
  useEffect(() => {
    const initAbly = async () => {
      try {
        const ablyInstance = new Ably.Realtime({
          authUrl: '/api/token',
          authParams: { clientId },
        });

        ablyInstance.connection.on('connected', () => {
          console.log('✅ Teacher connected to Ably');
          setIsConnected(true);
        });

        ablyInstance.connection.on('disconnected', () => {
          console.log('❌ Teacher disconnected from Ably');
          setIsConnected(false);
        });

        ablyInstance.connection.on('failed', (error) => {
          console.error('Failed to connect to Ably:', error);
        });

        const whiteboardChannel = ablyInstance.channels.get(`room-${roomId}`);

        // Enter presence as teacher
        await whiteboardChannel.presence.enter({
          role: 'teacher',
          name: 'Test Teacher',
          testMode: true
        });

        // Subscribe to presence to track students
        whiteboardChannel.presence.subscribe('enter', (member) => {
          console.log('👤 Student entered:', member.clientId, member.data);
          if (member.data?.role === 'student') {
            setStudents(prev => ({
              ...prev,
              [member.clientId]: {
                clientId: member.clientId,
                name: member.data.name || member.clientId,
                lines: [],
                lastUpdate: Date.now(),
                isActive: true,
                testMode: member.data.testMode || false
              }
            }));
          }
        });

        whiteboardChannel.presence.subscribe('leave', (member) => {
          console.log('👋 Student left:', member.clientId);
          setStudents(prev => {
            const updated = { ...prev };
            if (updated[member.clientId]) {
              updated[member.clientId].isActive = false;
            }
            return updated;
          });
        });

        // Get current presence members
        const members = await whiteboardChannel.presence.get();
        const studentMembers = {};
        members.forEach(member => {
          if (member.data?.role === 'student') {
            studentMembers[member.clientId] = {
              clientId: member.clientId,
              name: member.data.name || member.clientId,
              lines: [],
              lastUpdate: Date.now(),
              isActive: true,
              testMode: member.data.testMode || false
            };
          }
        });
        setStudents(studentMembers);

        // Subscribe to student drawings
        whiteboardChannel.subscribe('student-layer', (message) => {
          const { clientId } = message;
          const data = message.data;

          setStudents(prev => {
            const updated = { ...prev };
            if (!updated[clientId]) {
              updated[clientId] = {
                clientId,
                name: clientId,
                lines: [],
                lastUpdate: Date.now(),
                isActive: true
              };
            }

            if (data.action === 'clear') {
              updated[clientId].lines = [];
            } else if (data.lines) {
              updated[clientId].lines = [...updated[clientId].lines, ...data.lines];
            }

            updated[clientId].lastUpdate = Date.now();
            return updated;
          });
        });

        setAbly(ablyInstance);
        setChannel(whiteboardChannel);
      } catch (error) {
        console.error('Failed to initialize Ably:', error);
      }
    };

    initAbly();

    return () => {
      if (channel) {
        channel.presence.leave();
      }
      if (ably) {
        ably.close();
      }
    };
  }, [clientId, roomId]);

  const handleSendBlankCanvas = () => {
    if (!channel) return;

    channel.publish('teacher-action', {
      action: 'send-blank-canvas',
      questionNumber: 1
    });

    console.log('📄 Sent blank canvas to all students');
  };

  const handleEndSession = () => {
    if (!channel) return;

    channel.publish('teacher-action', {
      action: 'end-session'
    });

    console.log('🛑 Session ended');
  };

  const studentList = Object.values(students);
  const activeStudents = studentList.filter(s => s.isActive);
  const testModeStudents = activeStudents.filter(s => s.testMode);

  return (
    <div className="teacher-dashboard">
      {/* Header */}
      <div className="dashboard-header" style={{ background: '#2563eb', padding: '16px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px' }}>🧪 Test Teacher Dashboard</h1>
            <p style={{ margin: '8px 0 0 0', opacity: 0.9 }}>Room: {roomId}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '14px', opacity: 0.9 }}>
              {isConnected ? '● Connected' : '○ Disconnected'}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px' }}>
              {activeStudents.length} {activeStudents.length === 1 ? 'Student' : 'Students'}
            </div>
            {testModeStudents.length > 0 && (
              <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                ({testModeStudents.length} in test mode)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ padding: '16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={handleSendBlankCanvas}
            style={{
              padding: '10px 20px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            📄 Send Blank Canvas to All
          </button>
          <button
            onClick={handleEndSession}
            style={{
              padding: '10px 20px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            🛑 End Session
          </button>
          <div style={{
            padding: '10px 20px',
            background: '#fef3c7',
            border: '1px solid #fde047',
            borderRadius: '6px',
            fontSize: '14px'
          }}>
            <strong>Test Mode:</strong> No staging required - students can start immediately!
          </div>
        </div>
      </div>

      {/* Student Grid */}
      <div style={{ padding: '20px' }}>
        {activeStudents.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: '#f8fafc',
            borderRadius: '12px',
            border: '2px dashed #cbd5e1'
          }}>
            <h2 style={{ color: '#64748b', margin: '0 0 12px 0' }}>
              👥 Waiting for students...
            </h2>
            <p style={{ color: '#94a3b8', margin: 0 }}>
              Students will appear here when they join room: {roomId}
            </p>
            <div style={{
              marginTop: '20px',
              padding: '12px',
              background: 'white',
              borderRadius: '8px',
              display: 'inline-block'
            }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
                Share this URL with students:
              </div>
              <code style={{
                padding: '8px 12px',
                background: '#f1f5f9',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#1e293b'
              }}>
                http://146.190.100.142/test/student?room={roomId}
              </code>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px'
          }}>
            {activeStudents.map(student => (
              <div
                key={student.clientId}
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '2px solid',
                  borderColor: student.testMode ? '#3b82f6' : '#e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '16px', color: '#1e293b' }}>
                      {student.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                      {student.clientId}
                    </div>
                  </div>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: student.isActive ? '#10b981' : '#94a3b8'
                  }} />
                </div>

                {student.testMode && (
                  <div style={{
                    padding: '4px 8px',
                    background: '#dbeafe',
                    color: '#1e40af',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '500',
                    display: 'inline-block',
                    marginBottom: '12px'
                  }}>
                    🧪 TEST MODE
                  </div>
                )}

                <div style={{
                  background: '#f8fafc',
                  borderRadius: '8px',
                  padding: '12px',
                  minHeight: '80px'
                }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                    Drawing Activity
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b' }}>
                    {student.lines.length} {student.lines.length === 1 ? 'stroke' : 'strokes'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    Last update: {new Date(student.lastUpdate).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TestTeacher;
