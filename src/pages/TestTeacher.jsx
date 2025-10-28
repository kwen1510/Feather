import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Ably from 'ably/promises';
import QRCode from 'qrcode';
import StudentCard from '../components/StudentCard';
import AnnotationModal from '../components/AnnotationModal';
import { resizeAndCompressImage } from '../utils/imageUtils';
import './TeacherDashboard.css';

const TestTeacher = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const generateRoomCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
  };

  const getRoomId = () => {
    const urlRoom = searchParams.get('room');
    if (urlRoom) {
      return urlRoom.toUpperCase();
    }
    return 'load-test'.toUpperCase();
  };

  const [roomId] = React.useState(getRoomId);

  // Ably connection
  const [ably, setAbly] = useState(null);
  const [channel, setChannel] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [clientId] = useState(`test-teacher-${Math.random().toString(36).substring(7)}`);

  // Student management
  const [students, setStudents] = useState({});
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [teacherAnnotations, setTeacherAnnotations] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [flagFilter, setFlagFilter] = useState('all');
  const [distractedFilter, setDistractedFilter] = useState('all');
  const [hideNames, setHideNames] = useState(() => {
    const saved = localStorage.getItem('teacherDashboardHideNames');
    return saved ? JSON.parse(saved) : false;
  });
  const [cardsPerRow, setCardsPerRow] = useState(() => {
    const saved = localStorage.getItem('teacherDashboardCardsPerRow');
    return saved ? parseInt(saved) : 3;
  });
  const [prepTab, setPrepTab] = useState('blank');
  const [stagedTemplate, setStagedTemplate] = useState(null);
  const [stagedImage, setStagedImage] = useState(null);
  const [imageMessage, setImageMessage] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [sharedImage, setSharedImage] = useState(null);
  const sharedImageRef = useRef(null);
  const imageInputRef = useRef(null);
  const linkInputRef = useRef(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [toasts, setToasts] = useState([]);

  const isRemoteUpdate = useRef(false);

  useEffect(() => {
    sharedImageRef.current = sharedImage;
  }, [sharedImage]);

  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    localStorage.setItem('teacherDashboardHideNames', JSON.stringify(hideNames));
  }, [hideNames]);

  useEffect(() => {
    localStorage.setItem('teacherDashboardCardsPerRow', cardsPerRow.toString());
  }, [cardsPerRow]);

  // Initialize Ably - no session required
  useEffect(() => {
    const connectToAbly = async () => {
      try {
        const ablyInstance = new Ably.Realtime({
          authUrl: '/api/token',
          authParams: { clientId },
        });

        ablyInstance.connection.on('connected', () => {
          console.log('✅ Test Teacher connected to Ably');
          setIsConnected(true);
        });

        ablyInstance.connection.on('disconnected', () => {
          console.log('❌ Test Teacher disconnected');
          setIsConnected(false);
        });

        const whiteboardChannel = ablyInstance.channels.get(`room-${roomId}`);

        // Subscribe to presence
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
                isFlagged: false,
                isVisible: true,
                testMode: member.data.testMode || false,
                meta: { base: { width: 800, height: 600 } }
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

        whiteboardChannel.presence.subscribe('update', (member) => {
          if (member.data?.isVisible !== undefined) {
            setStudents(prev => {
              const updated = { ...prev };
              if (updated[member.clientId]) {
                updated[member.clientId].isVisible = member.data.isVisible;
              }
              return updated;
            });
          }
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
              isFlagged: false,
              isVisible: member.data?.isVisible !== false,
              testMode: member.data?.testMode || false,
              meta: { base: { width: 800, height: 600 } }
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
                isActive: true,
                isFlagged: false,
                isVisible: true,
                meta: { base: { width: 800, height: 600 } }
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

        // Enter presence as teacher
        await whiteboardChannel.presence.enter({
          role: 'teacher',
          name: 'Test Teacher',
          testMode: true
        });

        setAbly(ablyInstance);
        setChannel(whiteboardChannel);
      } catch (error) {
        console.error('Failed to connect to Ably:', error);
      }
    };

    connectToAbly();

    return () => {
      if (channel) {
        channel.presence.leave();
      }
      if (ably) {
        ably.close();
      }
    };
  }, [roomId, clientId]);

  // Generate QR code when modal opens
  useEffect(() => {
    if (showQRModal) {
      const studentUrl = `${window.location.origin}/test/student?room=${roomId}`;
      QRCode.toDataURL(studentUrl, { width: 300, margin: 2 })
        .then(url => setQrCodeDataUrl(url))
        .catch(err => console.error('Failed to generate QR code:', err));
    }
  }, [showQRModal, roomId]);

  const handleBack = () => {
    navigate('/');
  };

  const handleShowQRModal = () => {
    setShowQRModal(true);
  };

  const handleEndSession = () => {
    if (!channel) return;
    channel.publish('session-ended', {
      timestamp: Date.now(),
      reason: 'teacher_ended'
    });
    showToast('Session ended', 'success');
  };

  const handleCardClick = (student) => {
    setSelectedStudent(students[student.clientId] || student);
  };

  const handleCloseModal = () => {
    setSelectedStudent(null);
  };

  const handleAnnotate = (annotations) => {
    if (!selectedStudent || !channel) return;
    const targetStudentId = selectedStudent.clientId;

    setTeacherAnnotations(prev => ({
      ...prev,
      [targetStudentId]: annotations,
    }));

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

  const handleTemplateSelect = (templateType) => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 800, 600);
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;

    if (templateType === 'hanzi') {
      ctx.strokeRect(250, 150, 300, 300);
      ctx.beginPath();
      ctx.moveTo(400, 150);
      ctx.lineTo(400, 450);
      ctx.moveTo(250, 300);
      ctx.lineTo(550, 300);
      ctx.stroke();
    } else if (templateType === 'graph-corner') {
      ctx.beginPath();
      ctx.moveTo(100, 500);
      ctx.lineTo(100, 100);
      ctx.lineTo(700, 100);
      ctx.stroke();
      for (let i = 1; i < 10; i++) {
        const x = 100 + i * 60;
        ctx.beginPath();
        ctx.moveTo(x, 100);
        ctx.lineTo(x, 500);
        ctx.stroke();
      }
      for (let i = 1; i < 8; i++) {
        const y = 100 + i * 50;
        ctx.beginPath();
        ctx.moveTo(100, y);
        ctx.lineTo(700, y);
        ctx.stroke();
      }
    } else if (templateType === 'graph-cross') {
      ctx.beginPath();
      ctx.moveTo(50, 300);
      ctx.lineTo(750, 300);
      ctx.moveTo(400, 50);
      ctx.lineTo(400, 550);
      ctx.stroke();
      for (let i = -6; i <= 6; i++) {
        if (i === 0) continue;
        const x = 400 + i * 50;
        ctx.beginPath();
        ctx.moveTo(x, 50);
        ctx.lineTo(x, 550);
        ctx.stroke();
      }
      for (let i = -5; i <= 5; i++) {
        if (i === 0) continue;
        const y = 300 + i * 50;
        ctx.beginPath();
        ctx.moveTo(50, y);
        ctx.lineTo(750, y);
        ctx.stroke();
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    setStagedTemplate({ type: templateType, dataUrl, width: 800, height: 600 });
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
      console.error('Failed to upload image:', error);
      setImageMessage('Upload failed. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleClearImage = () => {
    setStagedImage(null);
    setImageMessage('');
  };

  const handleSendToClass = () => {
    if (!channel) return;

    let imageToSend = null;
    if (prepTab === 'templates' && stagedTemplate) {
      imageToSend = stagedTemplate;
    } else if (prepTab === 'image' && stagedImage) {
      imageToSend = stagedImage;
    }

    channel.publish('teacher-action', {
      action: 'send-blank-canvas',
      questionNumber: 1,
      sharedImage: imageToSend,
      timestamp: Date.now(),
    });

    if (imageToSend) {
      setSharedImage(imageToSend);
    } else {
      setSharedImage(null);
    }

    showToast('Sent to all students', 'success');
    console.log('📄 Sent to class:', prepTab);
  };

  const handleCopyLink = async () => {
    const studentUrl = `${window.location.origin}/test/student?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(studentUrl);
      showToast('Link copied to clipboard', 'success');
    } catch (error) {
      console.error('Clipboard API failed:', error);
      try {
        if (linkInputRef.current) {
          linkInputRef.current.select();
          document.execCommand('copy');
          showToast('Link copied to clipboard', 'success');
        }
      } catch (fallbackError) {
        console.error('Fallback copy failed:', fallbackError);
        if (linkInputRef.current) {
          linkInputRef.current.select();
        }
        alert('Please copy the selected link manually');
      }
    }
  };

  const getStudentsList = () => {
    return Object.values(students).sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return (b.lastUpdate || 0) - (a.lastUpdate || 0);
    });
  };

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

      const matchesDistracted =
        distractedFilter === 'all' ||
        (distractedFilter === 'distracted' && student.isVisible === false && student.isActive);

      return matchesSearch && matchesFlag && matchesDistracted;
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
      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === 'success' && <span className="toast-icon">✓</span>}
            {toast.type === 'info' && <span className="toast-icon">ℹ</span>}
            {toast.type === 'error' && <span className="toast-icon">✕</span>}
            <span className="toast-message">{toast.message}</span>
          </div>
        ))}
      </div>

      <div className="dashboard-shell">
        <button className="back-link" onClick={handleBack}>
          ← Exit class
        </button>

        <section className="hero-card glass-panel">
          <div className="hero-top">
            <div className="hero-copy">
              <p className="eyebrow">🧪 Test Teacher dashboard</p>
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
              <button
                className="end-session-btn"
                onClick={handleEndSession}
                title="End session and logout all students"
              >
                End Session
              </button>
              <div className="status-group">
                <span className="status-pill session-pill">Test mode</span>
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

              <button
                type="button"
                className={`chip-button ${distractedFilter === 'distracted' ? 'active' : ''}`}
                onClick={() => setDistractedFilter(prev => (prev === 'distracted' ? 'all' : 'distracted'))}
                title="Show only distracted students (switched away from tab)"
              >
                ⚠️ Distracted only
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

            {/* Blank canvas tab */}
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
                    ref={linkInputRef}
                    type="text"
                    value={`${window.location.origin}/test/student?room=${roomId}`}
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

export default TestTeacher;
