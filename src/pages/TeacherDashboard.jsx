import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Ably from 'ably/promises';
import QRCode from 'qrcode';
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
  const [prepTab, setPrepTab] = useState('blank'); // 'blank' | 'templates' | 'image'
  const [stagedTemplate, setStagedTemplate] = useState(null); // Selected template type and data
  const [stagedImage, setStagedImage] = useState(null); // Image preview before sending
  const [imageMessage, setImageMessage] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [sharedImage, setSharedImage] = useState(null); // Shared image sent to all students
  const imageInputRef = useRef(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

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

  // Template generation functions
  const generateTemplate = (type) => {
    const canvas = document.createElement('canvas');
    const BASE_WIDTH = 800;
    const BASE_HEIGHT = 600;
    canvas.width = BASE_WIDTH;
    canvas.height = BASE_HEIGHT;
    const ctx = canvas.getContext('2d');

    // Clear canvas with white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

    if (type === 'hanzi') {
      // Hanzi box template - box with cross guides
      const boxSize = 450;
      const boxX = (BASE_WIDTH - boxSize) / 2;
      const boxY = (BASE_HEIGHT - boxSize) / 2;

      // Outer box (green)
      ctx.strokeStyle = '#0F9D83';
      ctx.lineWidth = 4;
      ctx.strokeRect(boxX, boxY, boxSize, boxSize);

      // Cross guides (light dotted)
      ctx.strokeStyle = '#B0E8D8';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);

      // Vertical center line
      ctx.beginPath();
      ctx.moveTo(BASE_WIDTH / 2, boxY);
      ctx.lineTo(BASE_WIDTH / 2, boxY + boxSize);
      ctx.stroke();

      // Horizontal center line
      ctx.beginPath();
      ctx.moveTo(boxX, BASE_HEIGHT / 2);
      ctx.lineTo(boxX + boxSize, BASE_HEIGHT / 2);
      ctx.stroke();

    } else if (type === 'graph-corner') {
      // Graph with axes at corner
      const margin = 80;
      const gridSize = 40;

      // Grid lines (light)
      ctx.strokeStyle = '#E0E0E0';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);

      for (let x = margin; x <= BASE_WIDTH - margin; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, margin);
        ctx.lineTo(x, BASE_HEIGHT - margin);
        ctx.stroke();
      }

      for (let y = margin; y <= BASE_HEIGHT - margin; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(margin, y);
        ctx.lineTo(BASE_WIDTH - margin, y);
        ctx.stroke();
      }

      // Axes (blue, thicker)
      ctx.strokeStyle = '#5B9BD5';
      ctx.lineWidth = 3;

      // X-axis (bottom-left)
      ctx.beginPath();
      ctx.moveTo(margin, BASE_HEIGHT - margin);
      ctx.lineTo(BASE_WIDTH - margin, BASE_HEIGHT - margin);
      ctx.stroke();

      // Y-axis (bottom-left)
      ctx.beginPath();
      ctx.moveTo(margin, margin);
      ctx.lineTo(margin, BASE_HEIGHT - margin);
      ctx.stroke();

    } else if (type === 'graph-cross') {
      // Graph with axes through center
      const margin = 80;
      const gridSize = 40;

      // Grid lines (light)
      ctx.strokeStyle = '#E0E0E0';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);

      for (let x = margin; x <= BASE_WIDTH - margin; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, margin);
        ctx.lineTo(x, BASE_HEIGHT - margin);
        ctx.stroke();
      }

      for (let y = margin; y <= BASE_HEIGHT - margin; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(margin, y);
        ctx.lineTo(BASE_WIDTH - margin, y);
        ctx.stroke();
      }

      // Axes (blue, thicker, through center)
      ctx.strokeStyle = '#5B9BD5';
      ctx.lineWidth = 3;

      // X-axis (center horizontal)
      ctx.beginPath();
      ctx.moveTo(margin, BASE_HEIGHT / 2);
      ctx.lineTo(BASE_WIDTH - margin, BASE_HEIGHT / 2);
      ctx.stroke();

      // Y-axis (center vertical)
      ctx.beginPath();
      ctx.moveTo(BASE_WIDTH / 2, margin);
      ctx.lineTo(BASE_WIDTH / 2, BASE_HEIGHT - margin);
      ctx.stroke();
    }

    const dataUrl = canvas.toDataURL('image/png');
    return {
      type,
      dataUrl,
      width: BASE_WIDTH,
      height: BASE_HEIGHT,
      timestamp: Date.now(),
    };
  };

  const handleTemplateSelect = (type) => {
    const template = generateTemplate(type);
    setStagedTemplate(template);
    setImageMessage(`Template ready: ${type}`);
  };

  const handleSendToClass = async () => {
    if (!channel) return;

    try {
      if (prepTab === 'blank') {
        // Clear any existing template/image
        await channel.publish('teacher-clear', { timestamp: Date.now() });
        setSharedImage(null);
        setStagedTemplate(null);
        setImageMessage('Cleared canvas for all students.');
      } else if (prepTab === 'templates' && stagedTemplate) {
        // Send template
        await channel.publish('teacher-template', stagedTemplate);
        setSharedImage(stagedTemplate); // Store as shared content
        setImageMessage('Template sent to all students.');
      } else if (prepTab === 'image' && stagedImage) {
        // Send image
        await channel.publish('teacher-image', stagedImage);
        setSharedImage(stagedImage);
        setImageMessage('Image sent to all students.');
      }
    } catch (error) {
      console.error('Failed to send to class:', error);
      setImageMessage('Failed to send. Please try again.');
    }
  };

  // Handle going back
  const handleBack = () => {
    if (ably) {
      ably.close();
    }
    navigate('/');
  };

  // Handle QR code modal
  const handleShowQRModal = async () => {
    const studentUrl = `${window.location.origin}/student?room=${roomId}`;
    try {
      const qrDataUrl = await QRCode.toDataURL(studentUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#0F172A',
          light: '#FFFFFF',
        },
      });
      setQrCodeDataUrl(qrDataUrl);
      setShowQRModal(true);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    }
  };

  const handleCopyLink = async () => {
    const studentUrl = `${window.location.origin}/student?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(studentUrl);
      alert('Link copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy link:', error);
      alert('Failed to copy link. Please copy manually.');
    }
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
  const isPositiveImageMessage = imageMessage
    ? !/fail|no file/i.test(imageMessage)
    : false;

  return (
    <div className="teacher-dashboard">
      <div className="dashboard-shell">
        <button className="back-link" onClick={handleBack}>
          ← Exit class
        </button>

        <section className="hero-card glass-panel">
          <div className="hero-top">
            <div className="hero-copy">
              <p className="eyebrow">Teacher dashboard</p>
              <h1>Monitor every student's canvas and annotate live with the shared toolbar.</h1>
              <p className="hero-subtitle">
                Share the session code below to invite students. You'll see their canvases appear in real time as they connect.
              </p>
            </div>
            <div className="session-info">
              <div className="session-code-pill clickable" onClick={handleShowQRModal} style={{ cursor: 'pointer' }}>
                <span className="pill-label">Session code</span>
                <span className="pill-value">{roomId}</span>
              </div>
              <div className="status-group">
                <span className="status-pill session-pill">Session live</span>
                <span className={`status-pill connection-pill ${isConnected ? 'online' : 'offline'}`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
                <span className="status-pill count-pill">
                  <strong>{activeCount}</strong>
                  <span>online</span>
                </span>
              </div>
            </div>
          </div>

          <div className="hero-controls">
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

            <div className="control-set">
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
                className={`chip-button ${flagFilter === 'flagged' ? 'active' : ''}`}
                onClick={() => setFlagFilter(prev => (prev === 'flagged' ? 'all' : 'flagged'))}
              >
                Flagged only
              </button>

              <div className="cards-select">
                <span>Cards/row</span>
                <select
                  value={cardsPerRow}
                  onChange={(e) => setCardsPerRow(Number(e.target.value))}
                >
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="prep-card glass-panel">
          <div className="prep-header">
            <div>
              <p className="eyebrow">Prepare next question</p>
              {stagedTemplate && (
                <div style={{ display: 'inline-block', marginLeft: '12px', padding: '4px 12px', background: '#5B9BD5', color: 'white', borderRadius: '12px', fontSize: '13px', fontWeight: '600' }}>
                  Staged: {stagedTemplate.type === 'hanzi' ? 'Hanzi' : stagedTemplate.type === 'graph-corner' ? 'Graph (corner)' : 'Graph (cross)'}
                </div>
              )}
              <h3>Stage an image or prompt before sending it to every student.</h3>
            </div>
            <button
              className="send-to-class-btn"
              onClick={handleSendToClass}
              disabled={prepTab === 'image' && !stagedImage}
            >
              Send to class
            </button>
          </div>

          <div className="prep-controls">
            <div className="prep-tabs">
              <button
                type="button"
                className={`prep-tab ${prepTab === 'blank' ? 'active' : ''}`}
                onClick={() => {
                  setPrepTab('blank');
                  setStagedTemplate(null);
                  setStagedImage(null);
                }}
              >
                Blank canvas
              </button>
              <button
                type="button"
                className={`prep-tab ${prepTab === 'templates' ? 'active' : ''}`}
                onClick={() => {
                  setPrepTab('templates');
                  setStagedImage(null);
                }}
              >
                Templates
              </button>
              <button
                type="button"
                className={`prep-tab ${prepTab === 'image' ? 'active' : ''} ${stagedImage ? 'ready' : ''}`}
                onClick={() => {
                  setPrepTab('image');
                  setStagedTemplate(null);
                }}
                disabled={isUploadingImage}
              >
                {isUploadingImage ? 'Uploading…' : 'Send image'}
              </button>
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />

            {/* Templates tab content */}
            {prepTab === 'templates' && (
              <div className="template-selector">
                <div className="template-buttons">
                  <button
                    type="button"
                    className={`template-btn ${stagedTemplate?.type === 'hanzi' ? 'active' : ''}`}
                    onClick={() => handleTemplateSelect('hanzi')}
                  >
                    Hanzi box
                  </button>
                  <button
                    type="button"
                    className={`template-btn ${stagedTemplate?.type === 'graph-corner' ? 'active' : ''}`}
                    onClick={() => handleTemplateSelect('graph-corner')}
                  >
                    Graph (corner)
                  </button>
                  <button
                    type="button"
                    className={`template-btn ${stagedTemplate?.type === 'graph-cross' ? 'active' : ''}`}
                    onClick={() => handleTemplateSelect('graph-cross')}
                  >
                    Graph (cross)
                  </button>
                </div>

                {stagedTemplate && (
                  <div className="template-preview">
                    <img
                      src={stagedTemplate.dataUrl}
                      alt="Template preview"
                      style={{
                        maxWidth: '300px',
                        maxHeight: '250px',
                        border: '2px solid #0F9D83',
                        borderRadius: '8px',
                      }}
                    />
                    <p style={{ marginTop: '8px', color: '#999', fontSize: '14px' }}>
                      Tiny preview (local only)
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Image tab content */}
            {prepTab === 'image' && (
              <>
                {stagedImage ? (
                  <div className="image-preview-surface">
                    <img
                      src={stagedImage.dataUrl}
                      alt="Preview"
                      className="image-preview-thumbnail"
                    />
                    <div className="preview-meta">
                      <p className="preview-title">{stagedImage.filename || 'Prepared image'}</p>
                      <p className="preview-subtitle">
                        {stagedImage.width && stagedImage.height
                          ? `${Math.round(stagedImage.width)} × ${Math.round(stagedImage.height)} px`
                          : 'Ready to send'}
                      </p>
                      <div className="image-actions">
                        <button className="ghost-btn" onClick={handleImageInputClick}>
                          Choose another
                        </button>
                        <button className="ghost-btn" onClick={handleClearImage}>
                          Clear
                        </button>
                      </div>
                      {imageMessage && (
                        <span className={`image-message ${isPositiveImageMessage ? 'success' : 'error'}`}>
                          {imageMessage}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <button type="button" className="image-dropzone" onClick={handleImageInputClick}>
                    <div className="dropzone-icon" aria-hidden="true">🖼️</div>
                    <p>Bring an illustration or worksheet to share with the class.</p>
                    <span>Click to upload an image</span>
                    {imageMessage && (
                      <span className={`image-message ${isPositiveImageMessage ? 'success' : 'error'}`}>
                        {imageMessage}
                      </span>
                    )}
                  </button>
                )}
              </>
            )}

            {/* Blank canvas tab - show nothing, just message */}
            {prepTab === 'blank' && (
              <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                <p>Click "Send to class" to clear all students' canvases.</p>
              </div>
            )}
          </div>
        </section>

        <section className="students-panel">
          <div className="students-surface glass-panel">
            {studentsList.length === 0 ? (
              <div className="waiting-card">
                <div className="waiting-icon" aria-hidden="true">👥</div>
                <h2>Waiting for students to join…</h2>
                <p>
                  Share the <span className="inline-pill">session code</span> shown above. Students will appear here once they connect.
                </p>
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
        </section>
      </div>

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

      <div className="dashboard-footer">
        <p>💡 <strong>Tip:</strong> Click on any student card to view their work and add annotations</p>
      </div>

      {/* QR Code Modal */}
      {showQRModal && (
        <div className="qr-modal-overlay" onClick={() => setShowQRModal(false)}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="qr-modal-header">
              <h2>Join Session: {roomId}</h2>
              <button className="qr-close-btn" onClick={() => setShowQRModal(false)}>
                ✕
              </button>
            </div>
            <div className="qr-modal-content">
              <div className="qr-code-container">
                {qrCodeDataUrl && (
                  <img src={qrCodeDataUrl} alt="QR Code" className="qr-code-image" />
                )}
              </div>
              <div className="qr-instructions">
                <p className="qr-instruction-text">
                  <strong>Students can scan this QR code</strong> or use the link below to join the session
                </p>
                <div className="qr-link-box">
                  <input
                    type="text"
                    value={`${window.location.origin}/student?room=${roomId}`}
                    readOnly
                    className="qr-link-input"
                  />
                  <button className="qr-copy-btn" onClick={handleCopyLink}>
                    Copy Link
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
