import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Ably from 'ably/promises';
import StudentCard from '../components/StudentCard';
import AnnotationModal from '../components/AnnotationModal';
import './TeacherDashboard.css';

const TeacherDashboard = () => {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room') || 'demo';
  const navigate = useNavigate();

  // Ably connection
  const [ably, setAbly] = useState(null);
  const [channel, setChannel] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [clientId] = useState(`teacher-${Math.random().toString(36).substring(7)}`);

  // Student management
  const [students, setStudents] = useState({}); // { clientId: { clientId, name, lines, lastUpdate, isActive } }
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [teacherAnnotations, setTeacherAnnotations] = useState({}); // { studentId: [annotations] }

  const isRemoteUpdate = useRef(false);

  // Connect to Ably
  useEffect(() => {
    const connectToAbly = async () => {
      try {
        const tokenUrl = `/api/token?clientId=${clientId}`;
        const response = await fetch(tokenUrl);
        const tokenRequest = await response.json();

        const ablyClient = new Ably.Realtime({
          authCallback: async (tokenParams, callback) => {
            callback(null, tokenRequest);
          },
          clientId: clientId,
        });

        ablyClient.connection.on('connected', () => {
          console.log('Connected to Ably');
          setIsConnected(true);
        });

        ablyClient.connection.on('disconnected', () => {
          console.log('Disconnected from Ably');
          setIsConnected(false);
        });

        setAbly(ablyClient);

        // Get channel
        const whiteboardChannel = ablyClient.channels.get(`room-${roomId}`);

        // Subscribe to student drawings
        whiteboardChannel.subscribe('student-layer', (message) => {
          console.log('📥 Teacher received student layer from', message.clientId);

          isRemoteUpdate.current = true;
          setStudents(prev => ({
            ...prev,
            [message.clientId]: {
              clientId: message.clientId,
              name: extractStudentName(message.clientId),
              lines: message.data.lines || [],
              lastUpdate: Date.now(),
              isActive: true,
            }
          }));

          setTimeout(() => {
            isRemoteUpdate.current = false;
          }, 100);
        });

        // Listen for presence events (student connect/disconnect)
        whiteboardChannel.presence.subscribe('enter', (member) => {
          if (member.clientId !== clientId && member.clientId.includes('student')) {
            console.log('👋 Student joined:', member.clientId);
            setStudents(prev => ({
              ...prev,
              [member.clientId]: {
                ...(prev[member.clientId] || {}),
                clientId: member.clientId,
                name: extractStudentName(member.clientId),
                isActive: true,
                lastUpdate: Date.now(),
              }
            }));
          }
        });

        whiteboardChannel.presence.subscribe('leave', (member) => {
          if (member.clientId !== clientId && member.clientId.includes('student')) {
            console.log('👋 Student left:', member.clientId);
            setStudents(prev => ({
              ...prev,
              [member.clientId]: {
                ...(prev[member.clientId] || {}),
                isActive: false,
              }
            }));
          }
        });

        // Enter presence
        whiteboardChannel.presence.enter();

        setChannel(whiteboardChannel);
      } catch (error) {
        console.error('Failed to connect to Ably:', error);
      }
    };

    connectToAbly();

    return () => {
      if (ably) {
        ably.close();
      }
    };
  }, [roomId, clientId]);

  // Extract friendly name from clientId
  const extractStudentName = (clientId) => {
    const match = clientId.match(/student-(\d+)/) || clientId.match(/student-([\w]+)/);
    return match ? `Student ${match[1]}` : clientId;
  };

  // Handle opening annotation modal
  const handleCardClick = (student) => {
    setSelectedStudent(student);
  };

  // Handle closing annotation modal
  const handleCloseModal = () => {
    setSelectedStudent(null);
  };

  // Handle teacher annotations
  const handleAnnotate = (annotations) => {
    if (!selectedStudent || !channel) return;

    // Store annotations locally
    setTeacherAnnotations(prev => ({
      ...prev,
      [selectedStudent.clientId]: annotations,
    }));

    // Publish annotations to Ably with targetStudentId
    channel.publish('teacher-annotation', {
      targetStudentId: selectedStudent.clientId,
      annotations: annotations,
      teacherId: clientId,
      timestamp: Date.now(),
    });

    console.log('📤 Published annotations for', selectedStudent.clientId);
  };

  // Handle going back
  const handleBack = () => {
    if (ably) {
      ably.close();
    }
    navigate('/');
  };

  // Get student array sorted by most recent activity
  const getStudentsList = () => {
    return Object.values(students).sort((a, b) => {
      // Active students first
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      // Then by most recent update
      return (b.lastUpdate || 0) - (a.lastUpdate || 0);
    });
  };

  const studentsList = getStudentsList();
  const activeCount = studentsList.filter(s => s.isActive).length;

  return (
    <div className="teacher-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <button className="back-btn" onClick={handleBack}>
            ← Back
          </button>
          <h1>Teacher Dashboard</h1>
          <div className="room-badge">Room: {roomId}</div>
        </div>

        <div className="header-right">
          <div className="connection-status">
            <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
          <div className="student-count">
            <span className="count-number">{activeCount}</span>
            <span className="count-label">Active Student{activeCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        {studentsList.length === 0 ? (
          <div className="no-students">
            <div className="no-students-icon">👥</div>
            <h2>Waiting for Students...</h2>
            <p>Students will appear here when they join room "{roomId}"</p>
            <p className="hint">💡 Students can join by entering this room code on the landing page</p>
          </div>
        ) : (
          <div className="students-grid">
            {studentsList.map(student => (
              <StudentCard
                key={student.clientId}
                student={student}
                onClick={handleCardClick}
                teacherAnnotations={teacherAnnotations[student.clientId] || []}
              />
            ))}
          </div>
        )}
      </div>

      {/* Annotation Modal */}
      <AnnotationModal
        student={selectedStudent}
        isOpen={!!selectedStudent}
        onClose={handleCloseModal}
        onAnnotate={handleAnnotate}
        existingAnnotations={selectedStudent ? (teacherAnnotations[selectedStudent.clientId] || []) : []}
      />

      {/* Instructions Footer */}
      <div className="dashboard-footer">
        <p>💡 <strong>Tip:</strong> Click on any student card to view their work and add annotations</p>
      </div>
    </div>
  );
};

export default TeacherDashboard;
