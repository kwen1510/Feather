import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Ably from 'ably/promises';
import QRCode from 'qrcode';
import StudentCard from '../components/StudentCard';
import AnnotationModal from '../components/AnnotationModal';
import { resizeAndCompressImage } from '../utils/imageUtils';
import { supabase } from '../supabaseClient';
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
      // Always convert to uppercase for consistency
      return urlRoom.toUpperCase();
    }
    // Generate new room code
    const newCode = generateRoomCode();
    // Update URL with generated code
    setSearchParams({ room: newCode });
    return newCode;
  };

  const [roomId] = React.useState(getRoomId);

  // Supabase session tracking
  const [sessionId, setSessionId] = useState(null);
  const [participantId, setParticipantId] = useState(null);
  const [currentQuestionId, setCurrentQuestionId] = useState(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [sessionStatus, setSessionStatus] = useState('created'); // 'created' | 'active' | 'ended'

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
  const sharedImageRef = useRef(null); // Ref to access latest sharedImage in callbacks
  const imageInputRef = useRef(null);
  const linkInputRef = useRef(null); // Ref for the student link input field
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [toasts, setToasts] = useState([]);

  const isRemoteUpdate = useRef(false);

  // Keep ref updated with latest sharedImage
  useEffect(() => {
    sharedImageRef.current = sharedImage;
  }, [sharedImage]);

  // Toast notification helper
  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('teacherDashboardHideNames', JSON.stringify(hideNames));
  }, [hideNames]);

  useEffect(() => {
    localStorage.setItem('teacherDashboardCardsPerRow', cardsPerRow.toString());
  }, [cardsPerRow]);

  // Create or get existing session in Supabase when dashboard loads
  useEffect(() => {
    const initializeSession = async () => {
      try {
        console.log('📝 Initializing session in Supabase with room code:', roomId);

        // First, check if a session already exists for this room (case-insensitive)
        const { data: existingSessions, error: queryError } = await supabase
          .from('sessions')
          .select('*')
          .ilike('room_code', roomId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (queryError) {
          console.error('Failed to query sessions:', queryError);
          return;
        }

        let session = null;

        if (existingSessions && existingSessions.length > 0) {
          const existingSession = existingSessions[0];

          // If the existing session is ended, reset it to 'created' status
          if (existingSession.status === 'ended') {
            console.log('⏸️ Found ended session, resetting to created status');

            const { data: updatedSession, error: updateError } = await supabase
              .from('sessions')
              .update({
                status: 'created',
                started_at: null,
                ended_at: null,
              })
              .eq('id', existingSession.id)
              .select()
              .single();

            if (updateError) {
              console.error('Failed to update session:', updateError);
              return;
            }

            session = updatedSession;
            console.log('✅ Session reset to created:', session);
          } else {
            // Reuse the existing session if it's not ended
            console.log('♻️ Reusing existing session:', existingSession);
            session = existingSession;
          }
        } else {
          // No existing session, create a new one
          console.log('🆕 No existing session found, creating new one');

          const { data: newSession, error: insertError } = await supabase
            .from('sessions')
            .insert([
              {
                room_code: roomId,
                status: 'created',
              }
            ])
            .select()
            .single();

          if (insertError) {
            console.error('Failed to create session:', insertError);
            return;
          }

          session = newSession;
          console.log('✅ Session created:', session);
        }

        if (session) {
          setSessionId(session.id);
          setSessionStatus(session.status);

          // Create teacher participant record
          const { data: participant, error: participantError } = await supabase
            .from('participants')
            .insert([
              {
                session_id: session.id,
                client_id: clientId,
                name: 'Teacher',
                role: 'teacher',
              }
            ])
            .select()
            .single();

          if (participantError) {
            console.error('Failed to create teacher participant:', participantError);
          } else {
            console.log('👤 Teacher participant created:', participant);
            setParticipantId(participant.id);
          }
        }
      } catch (error) {
        console.error('Error initializing session:', error);
      }
    };

    initializeSession();
  }, [roomId]);

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
            const studentName = member.data?.name || extractStudentName(member.clientId);
            console.log('👋 Student joined:', member.clientId, 'Name:', studentName);

            // Show toast notification
            showToast(`${studentName} joined`, 'success');

            setStudents(prev => ({
              ...prev,
              [member.clientId]: {
                ...(prev[member.clientId] || {}),
                clientId: member.clientId,
                name: studentName,
                isActive: true,
                isVisible: member.data?.isVisible !== false, // Default to true
                lastUpdate: Date.now(),
                isFlagged: prev[member.clientId]?.isFlagged || false,
              }
            }));

            // Send current question state to the newly joined student
            setTimeout(() => {
              if (sharedImageRef.current) {
                whiteboardChannel.publish('sync-question-state', {
                  targetClientId: member.clientId,
                  content: sharedImageRef.current,
                  timestamp: Date.now(),
                });
                console.log('📤 Sent current question state to', member.clientId);
              }
            }, 500); // Small delay to ensure student is ready to receive
          }
        });

        whiteboardChannel.presence.subscribe('leave', (member) => {
          if (member.clientId !== clientId && member.clientId.includes('student')) {
            console.log('👋 Student left:', member.clientId);

            setStudents(prev => {
              const student = prev[member.clientId];
              const studentName = student?.name || extractStudentName(member.clientId);

              // Show toast notification
              showToast(`${studentName} left`, 'info');

              // Remove the student card entirely
              const { [member.clientId]: removed, ...remaining } = prev;
              return remaining;
            });
          }
        });

        // Listen for presence updates (visibility changes)
        whiteboardChannel.presence.subscribe('update', (member) => {
          if (member.clientId !== clientId && member.clientId.includes('student')) {
            const isVisible = member.data?.isVisible !== false;
            console.log(`👁️ Student visibility update: ${member.clientId} - ${isVisible ? 'visible' : 'hidden'}`);

            setStudents(prev => ({
              ...prev,
              [member.clientId]: {
                ...(prev[member.clientId] || {}),
                isVisible: isVisible,
                lastVisibilityChange: Date.now(),
              }
            }));
          }
        });

        // Listen for student visibility events (immediate notifications)
        whiteboardChannel.subscribe('student-visibility', (message) => {
          const { clientId: studentClientId, studentName, isVisible } = message.data;
          console.log(`👁️ Student visibility event: ${studentName} - ${isVisible ? 'visible' : 'hidden'}`);

          // Update student state
          setStudents(prev => ({
            ...prev,
            [studentClientId]: {
              ...(prev[studentClientId] || {}),
              isVisible: isVisible,
              lastVisibilityChange: Date.now(),
            }
          }));

          // Show notification when student switches away
          if (!isVisible) {
            showToast(`⚠️ ${studentName} switched away from the tab`, 'warning');
          }
        });

        // Listen for teacher shared images
        whiteboardChannel.subscribe('teacher-image', (message) => {
          console.log('📸 Teacher dashboard received shared image');
          setSharedImage(message.data);
        });

        // Listen for students requesting current question state
        whiteboardChannel.subscribe('request-current-state', (message) => {
          console.log('📞 Student requesting current state:', message.clientId);

          // Send current question state to the requesting student
          setTimeout(() => {
            if (sharedImageRef.current) {
              whiteboardChannel.publish('sync-question-state', {
                targetClientId: message.clientId,
                content: sharedImageRef.current,
                timestamp: Date.now(),
              });
              console.log('📤 Sent current question state to', message.clientId);
            } else {
              console.log('📭 No question state to send (blank canvas)');
            }
          }, 100);
        });

        // Enter presence
        await whiteboardChannel.presence.enter();

        setChannel(whiteboardChannel);

        // Create teacher participant record in Supabase
        if (sessionId) {
          try {
            const { data: participant, error: participantError } = await supabase
              .from('participants')
              .insert([
                {
                  session_id: sessionId,
                  client_id: clientId,
                  role: 'teacher',
                }
              ])
              .select()
              .single();

            if (participantError) {
              console.error('Failed to create teacher participant:', participantError);
            } else {
              console.log('✅ Teacher participant created:', participant);
              setParticipantId(participant.id);
            }
          } catch (error) {
            console.error('Error creating teacher participant:', error);
          }
        }
      } catch (error) {
        console.error('Failed to connect to Ably:', error);
      }
    };

    // Only connect when we have a sessionId
    if (sessionId) {
      connectToAbly();
    }

    return () => {
      if (ably) {
        ably.close();
      }
    };
  }, [roomId, clientId, sessionId]);

  // Refresh protection and session end handling
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (sessionStatus === 'active' || sessionStatus === 'created') {
        // Show browser confirmation dialog
        e.preventDefault();
        e.returnValue = 'This will end the session for all students. Are you sure?';

        // End session immediately (use synchronous method)
        if (sessionId && channel) {
          try {
            // Publish session-ended event synchronously
            channel.publish('session-ended', {
              timestamp: Date.now(),
              reason: 'teacher_refresh',
            });

            // Use sendBeacon for reliable database update on page unload
            const endpointUrl = `${window.location.origin}/api/end-session`;
            const data = JSON.stringify({ sessionId });
            navigator.sendBeacon(endpointUrl, data);
          } catch (error) {
            console.error('Error ending session on unload:', error);
          }
        }
      }
    };

    // Use pagehide for better mobile support
    const handlePageHide = () => {
      console.log('📱 Teacher page hide - ending session');
      if (sessionStatus === 'active' || sessionStatus === 'created') {
        if (sessionId && channel) {
          try {
            channel.publish('session-ended', {
              timestamp: Date.now(),
              reason: 'teacher_refresh',
            });
          } catch (error) {
            console.error('Error ending session on pagehide:', error);
          }
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [sessionStatus, sessionId, channel]);

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
    if (!channel || !sessionId) return;

    try {
      // If this is the first content being sent, start the session
      const isFirstQuestion = sessionStatus === 'created';

      if (isFirstQuestion) {
        console.log('🎬 Starting session...');

        // Update session to 'active'
        const { error: sessionError } = await supabase
          .from('sessions')
          .update({
            status: 'active',
            started_at: new Date().toISOString(),
          })
          .eq('id', sessionId);

        if (sessionError) {
          console.error('Failed to start session:', sessionError);
          setImageMessage('Failed to start session. Please try again.');
          return;
        }

        setSessionStatus('active');

        // Publish session-started event
        await channel.publish('session-started', {
          timestamp: Date.now(),
          sessionId: sessionId,
        });

        console.log('✅ Session started!');
      }

      // Increment question number
      const newQuestionNumber = questionNumber + 1;
      setQuestionNumber(newQuestionNumber);

      // Determine content type and data
      let contentType = 'blank';
      let templateType = null;
      let imageData = null;

      if (prepTab === 'templates' && stagedTemplate) {
        contentType = 'template';
        templateType = stagedTemplate.type;
        imageData = {
          dataUrl: stagedTemplate.dataUrl,
          width: stagedTemplate.width,
          height: stagedTemplate.height,
        };
      } else if (prepTab === 'image' && stagedImage) {
        contentType = 'image';
        imageData = {
          dataUrl: stagedImage.dataUrl,
          width: stagedImage.width,
          height: stagedImage.height,
          filename: stagedImage.filename,
        };
      }

      // Create question record in Supabase
      const { data: question, error: questionError } = await supabase
        .from('questions')
        .insert([
          {
            session_id: sessionId,
            question_number: newQuestionNumber,
            content_type: contentType,
            template_type: templateType,
            image_data: imageData,
          }
        ])
        .select()
        .single();

      if (questionError) {
        console.error('Failed to create question:', questionError);
        setImageMessage('Failed to save question. Please try again.');
        return;
      }

      console.log('✅ Question created:', question);
      setCurrentQuestionId(question.id);

      // Clear all student drawings and teacher annotations
      await channel.publish('clear-all-drawings', {
        timestamp: Date.now(),
        questionId: question.id,
      });

      // Clear local state
      setStudents(prev => {
        const updated = {};
        Object.keys(prev).forEach(key => {
          updated[key] = {
            ...prev[key],
            lines: [], // Clear student lines
          };
        });
        return updated;
      });
      setTeacherAnnotations({}); // Clear all teacher annotations

      // Send content to students
      if (prepTab === 'blank') {
        // Clear any existing template/image
        await channel.publish('teacher-clear', { timestamp: Date.now() });
        setSharedImage(null);
        setStagedTemplate(null);
        setImageMessage(`Question ${newQuestionNumber}: Blank canvas sent to all students.`);
        showToast(`Question ${newQuestionNumber} sent!`, 'success');
      } else if (prepTab === 'templates' && stagedTemplate) {
        // Send template
        await channel.publish('teacher-template', stagedTemplate);
        setSharedImage(stagedTemplate); // Store as shared content
        setImageMessage(`Question ${newQuestionNumber}: Template sent to all students.`);
        showToast(`Question ${newQuestionNumber} sent!`, 'success');
      } else if (prepTab === 'image' && stagedImage) {
        // Send image
        await channel.publish('teacher-image', stagedImage);
        setSharedImage(stagedImage);
        setImageMessage(`Question ${newQuestionNumber}: Image sent to all students.`);
        showToast(`Question ${newQuestionNumber} sent!`, 'success');
      }
    } catch (error) {
      console.error('Failed to send to class:', error);
      setImageMessage('Failed to send. Please try again.');
      showToast('Failed to send question', 'error');
    }
  };

  // End session helper function
  const endSessionInDatabase = async (reason = 'teacher_ended') => {
    if (sessionId && (sessionStatus === 'active' || sessionStatus === 'created')) {
      try {
        await supabase
          .from('sessions')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
          })
          .eq('id', sessionId);

        // Publish session-ended event
        if (channel) {
          await channel.publish('session-ended', {
            timestamp: Date.now(),
            reason: reason,
          });
        }

        console.log('✅ Session ended:', reason);
        return true;
      } catch (error) {
        console.error('Error ending session:', error);
        return false;
      }
    }
    return false;
  };

  // Handle going back
  const handleBack = async () => {
    await endSessionInDatabase('teacher_back');

    if (ably) {
      ably.close();
    }
    navigate('/');
  };

  // Handle end session button click
  const handleEndSession = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to end this session?\n\nAll students will be logged out and the session will be closed.'
    );

    if (confirmed) {
      await endSessionInDatabase('teacher_ended');

      // Close connection and redirect
      if (ably) {
        ably.close();
      }
      navigate('/');
    }
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

    // Try modern Clipboard API first (works on HTTPS)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(studentUrl);
        alert('Link copied to clipboard!');
        return;
      } catch (error) {
        console.error('Clipboard API failed:', error);
      }
    }

    // Fallback for HTTP: use legacy method
    try {
      const input = linkInputRef.current;
      if (input) {
        input.select();
        input.setSelectionRange(0, 99999); // For mobile devices

        // Try legacy execCommand
        const successful = document.execCommand('copy');
        if (successful) {
          alert('Link copied to clipboard!');
          // Deselect
          window.getSelection().removeAllRanges();
        } else {
          throw new Error('execCommand failed');
        }
      } else {
        throw new Error('Input ref not available');
      }
    } catch (error) {
      console.error('Fallback copy failed:', error);
      // Select the text so user can manually copy
      if (linkInputRef.current) {
        linkInputRef.current.select();
      }
      alert('Please copy the selected link manually (Ctrl+C or Cmd+C)');
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
              <button
                className="end-session-btn"
                onClick={handleEndSession}
                title="End session and logout all students"
              >
                End Session
              </button>
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
                    ref={linkInputRef}
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
