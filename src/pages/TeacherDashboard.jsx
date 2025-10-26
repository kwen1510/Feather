import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Ably from 'ably/promises';
import StudentCard from '../components/StudentCard';
import AnnotationModal from '../components/AnnotationModal';
import { resizeAndCompressImage } from '../utils/imageUtils';
import './TeacherDashboard.css';

const TeacherDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Generate 6-digit room code if not provided
  const generateRoomCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
  };

  // Get or generate room ID
  const getRoomId = () => {
    const urlRoom = searchParams.get('room');
    if (urlRoom) {
      return urlRoom;
    }
    // Generate new room code
    const newCode = generateRoomCode();
    // Update URL with generated code
    setSearchParams({ room: newCode });
    return newCode;
  };

  const [roomId] = React.useState(getRoomId);

  // Ably connection
  const [ably, setAbly] = useState(null);
  const [channel, setChannel] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [clientId] = useState(`teacher-${Math.random().toString(36).substring(7)}`);

  // Student management
  const [students, setStudents] = useState(() => {
    // Check if bot parameter is in URL
    const botCount = parseInt(searchParams.get('bot')) || 0;
    const botStudents = {};

    if (botCount > 0) {
      for (let i = 1; i <= botCount; i++) {
        const clientId = `bot-${i}`;
        botStudents[clientId] = {
          clientId: clientId,
          name: `Bot ${i}`,
          lines: [],
          lastUpdate: Date.now() - (i * 1000),
          isActive: true,
          isFlagged: false,
        };
      }
    }

    return botStudents;
  });
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [teacherAnnotations, setTeacherAnnotations] = useState({}); // { studentId: [annotations] }
  const [searchQuery, setSearchQuery] = useState('');
  const [flagFilter, setFlagFilter] = useState('all'); // all | flagged
  const [hideNames, setHideNames] = useState(() => {
    const saved = localStorage.getItem('teacherDashboardHideNames');
    return saved ? JSON.parse(saved) : false;
  });
  const [cardsPerRow, setCardsPerRow] = useState(() => {
    const saved = localStorage.getItem('teacherDashboardCardsPerRow');
    return saved ? parseInt(saved) : 3;
  });
  const [stagedImage, setStagedImage] = useState(null); // Image preview before sending
  const [imageMessage, setImageMessage] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [sharedImage, setSharedImage] = useState(null); // Shared image sent to all students
  const imageInputRef = useRef(null);

  const isRemoteUpdate = useRef(false);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('teacherDashboardHideNames', JSON.stringify(hideNames));
  }, [hideNames]);

  useEffect(() => {
    localStorage.setItem('teacherDashboardCardsPerRow', cardsPerRow.toString());
  }, [cardsPerRow]);

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
              ...(prev[message.clientId] || {}),
              clientId: message.clientId,
              name: prev[message.clientId]?.name || extractStudentName(message.clientId),
              lines: message.data.lines || [],
              meta: message.data.meta || prev[message.clientId]?.meta || null,
              lastUpdate: Date.now(),
              isActive: true,
              isFlagged: prev[message.clientId]?.isFlagged || false,
            }
          }));

          setTimeout(() => {
            isRemoteUpdate.current = false;
          }, 100);
        });

        // Listen for presence events (student connect/disconnect)
        whiteboardChannel.presence.subscribe('enter', (member) => {
          if (member.clientId !== clientId && member.clientId.includes('student')) {
            console.log('👋 Student joined:', member.clientId, 'Name:', member.data?.name);
            setStudents(prev => ({
              ...prev,
              [member.clientId]: {
                ...(prev[member.clientId] || {}),
                clientId: member.clientId,
                name: member.data?.name || extractStudentName(member.clientId),
                isActive: true,
                lastUpdate: Date.now(),
                isFlagged: prev[member.clientId]?.isFlagged || false,
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
                isFlagged: prev[member.clientId]?.isFlagged || false,
              }
            }));
          }
        });

        // Listen for teacher shared images
        whiteboardChannel.subscribe('teacher-image', (message) => {
          console.log('📸 Teacher dashboard received shared image');
          setSharedImage(message.data);
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
    setSelectedStudent(students[student.clientId] || student);
  };

  // Handle closing annotation modal
  const handleCloseModal = () => {
    setSelectedStudent(null);
  };

  // Handle teacher annotations
  const handleAnnotate = (annotations) => {
    if (!selectedStudent || !channel) return;
    const targetStudentId = selectedStudent.clientId;

    // Store annotations locally
    setTeacherAnnotations(prev => ({
      ...prev,
      [targetStudentId]: annotations,
    }));

    // Publish annotations to Ably with targetStudentId
    channel.publish('teacher-annotation', {
      targetStudentId,
      annotations: annotations,
      teacherId: clientId,
      timestamp: Date.now(),
    });

    console.log('📤 Published annotations for', targetStudentId);
  };

  const toggleFlag = (studentId) => {
    setStudents(prev => {
      const target = prev[studentId];
      if (!target) return prev;
      const updated = {
        ...prev,
        [studentId]: {
          ...target,
          isFlagged: !target.isFlagged,
        }
      };
      return updated;
    });

    setSelectedStudent(prev =>
      prev && prev.clientId === studentId ? { ...prev, isFlagged: !prev.isFlagged } : prev
    );
  };

  const handleImageInputClick = () => {
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
      imageInputRef.current.click();
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setImageMessage('No file selected.');
      return;
    }

    setIsUploadingImage(true);
    setImageMessage('');

    try {
      const { dataUrl, width, height } = await resizeAndCompressImage(file);
      const payload = {
        dataUrl,
        width,
        height,
        filename: file.name,
        timestamp: Date.now(),
      };
      setStagedImage(payload);
      setImageMessage('Image ready to send.');
    } catch (error) {
      console.error('Failed to upload image from dashboard:', error);
      setImageMessage('Upload failed. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSendImage = async () => {
    if (!stagedImage || !channel) return;

    try {
      await channel.publish('teacher-image', stagedImage);
      setSharedImage(stagedImage);
      setImageMessage('Image sent to all students.');
    } catch (error) {
      console.error('Failed to send image:', error);
      setImageMessage('Failed to send image.');
    }
  };

  const handleClearImage = () => {
    setStagedImage(null);
    setImageMessage('');
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
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

  // Filter students by search query
  const getFilteredStudents = () => {
    const allStudents = getStudentsList();
    const query = searchQuery.trim().toLowerCase();

    return allStudents.filter(student => {
      const matchesSearch = !query
        ? true
        : (student.name || student.clientId).toLowerCase().includes(query);

      const matchesFlag =
        flagFilter === 'all' ||
        (flagFilter === 'flagged' && student.isFlagged);

      return matchesSearch && matchesFlag;
    });
  };

  const studentsList = getStudentsList();
  const filteredStudents = getFilteredStudents();
  const activeCount = studentsList.filter(s => s.isActive).length;
  const selectedStudentData = selectedStudent
    ? students[selectedStudent.clientId] || selectedStudent
    : null;

  return (
    <div className="teacher-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <button className="back-btn" onClick={handleBack}>
            ← Back
          </button>
          <h1>Teacher Dashboard</h1>
        </div>

        <div className="header-center">
          <div className="room-code-display">
            <div className="room-code-label">Room Code</div>
            <div className="room-code-value">{roomId}</div>
            <div className="room-code-hint">Share this code with students</div>
          </div>
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
        {/* Image Sharing Panel */}
        <div className="image-sharing-panel">
          <div className="image-panel-header">
            <span className="panel-icon">📸</span>
            <h3>Share Image with Students</h3>
          </div>

          <div className="image-panel-content">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />

            {!stagedImage ? (
              <div className="image-upload-area">
                <button
                  className="upload-image-btn"
                  onClick={handleImageInputClick}
                  disabled={isUploadingImage}
                >
                  {isUploadingImage ? 'Uploading…' : 'Choose Image'}
                </button>
                {imageMessage && (
                  <span className="image-message">{imageMessage}</span>
                )}
              </div>
            ) : (
              <div className="image-preview-area">
                <div className="preview-label">Preview:</div>
                <img
                  src={stagedImage.dataUrl}
                  alt="Preview"
                  className="image-preview-thumbnail"
                />
                <div className="image-actions">
                  <button
                    className="send-image-btn"
                    onClick={handleSendImage}
                  >
                    Send to All Students
                  </button>
                  <button
                    className="clear-image-btn"
                    onClick={handleClearImage}
                  >
                    Clear
                  </button>
                </div>
                {imageMessage && (
                  <span className="image-message success">{imageMessage}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Search/Filter Bar - Always visible */}
        <div className="filter-section">
          <div className="filter-bar">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Filter students"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              {searchQuery && (
                <button
                  className="clear-search-btn"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <label className="hide-names-checkbox">
              <input
                type="checkbox"
                checked={hideNames}
                onChange={(e) => setHideNames(e.target.checked)}
              />
              <span>Hide names</span>
            </label>

            <button
              type="button"
              className={`flag-toggle-pill ${flagFilter === 'flagged' ? 'active' : ''}`}
              onClick={() => setFlagFilter(prev => (prev === 'flagged' ? 'all' : 'flagged'))}
            >
              Flagged only
            </button>

            <select
              className="cards-per-row-select"
              value={cardsPerRow}
              onChange={(e) => setCardsPerRow(Number(e.target.value))}
            >
              <option value={2}>Cards/row: 2</option>
              <option value={3}>Cards/row: 3</option>
              <option value={4}>Cards/row: 4</option>
            </select>
          </div>
        </div>

        {/* Students Grid or Empty State */}
        {studentsList.length === 0 ? (
          <div className="no-students">
            <div className="no-students-icon">👥</div>
            <h2>Waiting for Students...</h2>
            <p>Students will appear here when they join room "{roomId}"</p>
            <p className="hint">💡 Students can join by entering this room code on the landing page</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="no-results">
            <div className="no-results-icon">🔍</div>
            <h3>No students found</h3>
            <p>No students match "{searchQuery}"</p>
            <button className="clear-filter-btn" onClick={() => setSearchQuery('')}>
              Clear filter
            </button>
          </div>
        ) : (
          <div
            className="students-grid"
            style={{
              gridTemplateColumns: `repeat(${cardsPerRow}, 1fr)`
            }}
          >
            {filteredStudents
              .filter(student => student && student.clientId)
              .map(student => (
                <StudentCard
                  key={student.clientId}
                  student={student}
                  onClick={handleCardClick}
                  onToggleFlag={toggleFlag}
                  teacherAnnotations={teacherAnnotations[student.clientId] || []}
                  sharedImage={sharedImage}
                  hideNames={hideNames}
                />
              ))}
          </div>
        )}
      </div>

      {/* Annotation Modal */}
      <AnnotationModal
        student={selectedStudentData}
        isOpen={!!selectedStudentData}
        isFlagged={selectedStudentData?.isFlagged}
        onToggleFlag={toggleFlag}
        onClose={handleCloseModal}
        onAnnotate={handleAnnotate}
        existingAnnotations={
          selectedStudentData ? (teacherAnnotations[selectedStudentData.clientId] || []) : []
        }
        sharedImage={sharedImage}
      />

      {/* Instructions Footer */}
      <div className="dashboard-footer">
        <p>💡 <strong>Tip:</strong> Click on any student card to view their work and add annotations</p>
      </div>
    </div>
  );
};

export default TeacherDashboard;
