import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Ably from 'ably/promises';
import QRCode from 'qrcode';
import { Feather } from 'lucide-react';
import StudentCard from '../components/StudentCard';
import AnnotationModal from '../components/AnnotationModal';
import { resizeAndCompressImage } from '../utils/imageUtils';
import { supabase } from '../supabaseClient';
import {
  saveSessionState,
  loadSessionState,
  saveTeacherAnnotation,
  loadTeacherAnnotations,
  cleanupOldSessions,
  clearSessionData
} from '../utils/indexedDB';
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

  const [roomId, setRoomId] = useState('');
  const roomInitialisedRef = useRef(false);

  useEffect(() => {
    if (roomInitialisedRef.current) {
      return;
    }

    const urlRoom = searchParams.get('room');
    if (urlRoom) {
      setRoomId(urlRoom.toUpperCase());
    } else {
      const newCode = generateRoomCode();
      setRoomId(newCode);
      setSearchParams({ room: newCode }, { replace: true });
    }

    roomInitialisedRef.current = true;
  }, [searchParams, setSearchParams]);

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
  const [sessionStateLoaded, setSessionStateLoaded] = useState(false); // Track if IndexedDB loaded
  const [clientId] = useState(`teacher-${Math.random().toString(36).substring(7)}`);

  // Student management (keyed by persistent studentId, not volatile clientId)
  const [students, setStudents] = useState(() => {
    // Check if bot parameter is in URL
    const botCount = parseInt(searchParams.get('bot')) || 0;
    const botStudents = {};

    if (botCount > 0) {
      for (let i = 1; i <= botCount; i++) {
        const studentId = `bot-student-${i}`;
        botStudents[studentId] = {
          studentId: studentId,
          clientId: `bot-${i}`,
          name: `Bot ${i}`,
          strokeCount: 0, // Track count, not actual strokes
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
  const [distractedFilter, setDistractedFilter] = useState('all'); // all | distracted
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
  const teacherAnnotationsRef = useRef({}); // Ref to access latest teacherAnnotations in callbacks
  const currentQuestionIdRef = useRef(null);
  const questionNumberRef = useRef(0);
  const logoutTimerRef = useRef(null);
  const imageInputRef = useRef(null);
  const linkInputRef = useRef(null); // Ref for the student link input field
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [toasts, setToasts] = useState([]);

  const isRemoteUpdate = useRef(false);
  const sessionInitStateRef = useRef({ roomId: null, status: 'idle' });
  const participantInitRef = useRef(false);
  const joinedStudentsRef = useRef(new Set()); // Track students who have already joined this session
  const ablyInitializedRef = useRef(false); // Track if Ably has been initialized to prevent duplicates
  const sessionSaveTimerRef = useRef(null);

  // Keep ref updated with latest sharedImage
  useEffect(() => {
    sharedImageRef.current = sharedImage;
  }, [sharedImage]);

  // Keep ref updated with latest teacherAnnotations
  useEffect(() => {
    teacherAnnotationsRef.current = teacherAnnotations;
  }, [teacherAnnotations]);

  useEffect(() => {
    currentQuestionIdRef.current = currentQuestionId;
  }, [currentQuestionId]);

  useEffect(() => {
    questionNumberRef.current = questionNumber;
  }, [questionNumber]);

  // Persist dashboard state shortly after changes so refresh restores latest strokes
  useEffect(() => {
    if (!sessionId) {
      return;
    }

    if (sessionSaveTimerRef.current) {
      clearTimeout(sessionSaveTimerRef.current);
    }

    sessionSaveTimerRef.current = setTimeout(async () => {
      sessionSaveTimerRef.current = null;
      try {
        await saveSessionState(sessionId, {
          students,
          questionNumber,
          currentQuestionId,
          sharedImage,
        });
      } catch (error) {
        console.error('❌ Failed to save session state (debounced):', error);
      }
    }, 400);

    return () => {
      if (sessionSaveTimerRef.current) {
        clearTimeout(sessionSaveTimerRef.current);
        sessionSaveTimerRef.current = null;
      }
    };
  }, [sessionId, students, questionNumber, currentQuestionId, sharedImage]);

  // Toast notification helper
  const toastIdCounter = useRef(0);
  const showToast = (message, type = 'info') => {
    const id = `${Date.now()}-${toastIdCounter.current++}`;
    setToasts(prev => [...prev, { id, message, type }]);
    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const endSessionInDatabase = useCallback(async (reason = 'teacher_ended') => {
    if (!sessionId || (sessionStatus !== 'active' && sessionStatus !== 'created')) {
      return false;
    }

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
          reason,
        });
      }

      try {
        await clearSessionData(sessionId);
      } catch (clearError) {
        console.error('Failed to clear local session data:', clearError);
      }

      setSessionStatus('ended');

      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }

      return true;
    } catch (error) {
      console.error('Error ending session:', error);
      return false;
    }
  }, [sessionId, sessionStatus, channel]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('teacherDashboardHideNames', JSON.stringify(hideNames));
  }, [hideNames]);

  useEffect(() => {
    localStorage.setItem('teacherDashboardCardsPerRow', cardsPerRow.toString());
  }, [cardsPerRow]);

  // Create or get existing session in Supabase when dashboard loads
  useEffect(() => {
    if (!roomId) {
      return;
    }

    // Reset state when room changes
    if (sessionInitStateRef.current.roomId !== roomId) {
      sessionInitStateRef.current = { roomId, status: 'idle' };
      participantInitRef.current = false;
    }

    if (sessionInitStateRef.current.status === 'in-progress' || sessionInitStateRef.current.status === 'done') {
      return;
    }

    sessionInitStateRef.current = { roomId, status: 'in-progress' };

    let cancelled = false;

    const markIdleIfCurrentRoom = () => {
      const current = sessionInitStateRef.current;
      if (!cancelled && current.roomId === roomId) {
        sessionInitStateRef.current = { roomId, status: 'idle' };
        participantInitRef.current = false;
      }
    };

    const initializeSession = async () => {
      try {
        const { data: existingSessions, error: queryError } = await supabase
          .from('sessions')
          .select('*')
          .ilike('room_code', roomId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (queryError) {
          console.error('Failed to query sessions:', queryError);
          markIdleIfCurrentRoom();
          return;
        }

        let session = null;

        if (existingSessions && existingSessions.length > 0) {
          const existingSession = existingSessions[0];

          if (existingSession.status === 'ended') {
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
              markIdleIfCurrentRoom();
              return;
            }

            session = updatedSession;
          } else {
            session = existingSession;
          }
        } else {
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
            if (insertError.code === '23505') {

              const { data: conflictSessions, error: conflictFetchError } = await supabase
                .from('sessions')
                .select('*')
                .ilike('room_code', roomId)
                .order('created_at', { ascending: false })
                .limit(1);

              if (conflictFetchError) {
                console.error('Failed to load existing session after duplicate key error:', conflictFetchError);
                markIdleIfCurrentRoom();
                return;
              }

              if (conflictSessions && conflictSessions.length > 0) {
                session = conflictSessions[0];
              } else {
                console.error('Duplicate key reported but no session found when refetching.');
                markIdleIfCurrentRoom();
                return;
              }
            } else {
              console.error('Failed to create session:', insertError);
              markIdleIfCurrentRoom();
              return;
            }
          } else {
            session = newSession;
          }
        }

        if (cancelled) {
          return;
        }

        if (session) {
          setSessionId(session.id);
          setSessionStatus(session.status);

          if (!participantInitRef.current) {
            // Check for existing teacher participant to avoid duplicates (Strict Mode, reconnects)
            const { data: existingParticipant, error: existingParticipantError } = await supabase
              .from('participants')
              .select('*')
              .eq('session_id', session.id)
              .eq('client_id', clientId)
              .eq('role', 'teacher')
              .maybeSingle();

            if (existingParticipantError) {
              console.error('Failed to check existing teacher participant:', existingParticipantError);
            }

            if (existingParticipant) {
              setParticipantId(existingParticipant.id);
              participantInitRef.current = true;
            } else {
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
                setParticipantId(participant.id);
                participantInitRef.current = true;
              }
            }
          }

          if (!cancelled) {
            sessionInitStateRef.current = { roomId, status: 'done' };
          }
        } else {
          markIdleIfCurrentRoom();
        }
      } catch (error) {
        console.error('Error initializing session:', error);
        markIdleIfCurrentRoom();
      }
    };

    initializeSession();

    return () => {
      cancelled = true;
      const current = sessionInitStateRef.current;
      if (current.roomId === roomId && current.status === 'in-progress') {
        sessionInitStateRef.current = { roomId, status: 'idle' };
        participantInitRef.current = false;
      }
    };
  }, [roomId, clientId]);

  // Load session state from IndexedDB and cleanup old data
  useEffect(() => {
    if (!sessionId) return;

    const loadAndCleanup = async () => {
      try {
        // Cleanup old sessions (older than 7 days)
        await cleanupOldSessions(7);

        // Load saved session state from IndexedDB
        const savedState = await loadSessionState(sessionId);

        if (savedState) {

          // Restore student work
          if (savedState.students && Object.keys(savedState.students).length > 0) {
            setStudents(savedState.students);
          }

          // Restore question state
          if (savedState.questionNumber !== undefined) {
            setQuestionNumber(savedState.questionNumber);
            questionNumberRef.current = savedState.questionNumber;
          }
          if (savedState.currentQuestionId) {
            setCurrentQuestionId(savedState.currentQuestionId);
            currentQuestionIdRef.current = savedState.currentQuestionId;

            // Load teacher annotations for current question
            const annotations = await loadTeacherAnnotations(sessionId, savedState.currentQuestionId);
            if (Object.keys(annotations).length > 0) {
              setTeacherAnnotations(annotations);
            }
          } else {
            currentQuestionIdRef.current = null;
          }
          if (savedState.sharedImage) {
            setSharedImage(savedState.sharedImage);
          }
        }
      } catch (error) {
        console.error('❌ Failed to load session state:', error);
      } finally {
        // Mark as loaded regardless of success/failure
        setSessionStateLoaded(true);
      }
    };

    loadAndCleanup();
  }, [sessionId]);

  // Auto-logout teacher after 10 minutes of inactivity (disconnection)
  useEffect(() => {
    if (!sessionId || typeof window === 'undefined') {
      return;
    }

    const shouldStartTimer = !isConnected && (sessionStatus === 'active' || sessionStatus === 'created');

    if (shouldStartTimer && !logoutTimerRef.current) {
      console.log('⏱️ Teacher disconnected, starting 10-minute auto-logout timer');
      logoutTimerRef.current = window.setTimeout(async () => {
        console.log('⏰ 10-minute timeout reached, automatically ending session');
        const ended = await endSessionInDatabase('teacher_timeout_10min');
        if (!ended) {
          console.warn('Auto-logout timer fired but session was already ended or unavailable');
        } else {
          console.log('✅ Session ended due to teacher inactivity');
        }
        logoutTimerRef.current = null;
      }, 10 * 60 * 1000);
    }

    if (isConnected && logoutTimerRef.current) {
      console.log('✅ Teacher reconnected, cancelling auto-logout timer');
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  }, [isConnected, sessionId, sessionStatus, endSessionInDatabase]);

  useEffect(() => {
    return () => {
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
    };
  }, []);

  // Connect to Ably (only after session state is loaded)
  useEffect(() => {
    // Prevent duplicate initialization & wait for IndexedDB to load first
    if (ablyInitializedRef.current || !roomId || !clientId || !sessionStateLoaded) {
      return;
    }

    ablyInitializedRef.current = true;
    let ablyClient = null;
    let whiteboardChannel = null;

    const connectToAbly = async () => {
      try {
        const tokenUrl = `/api/token?clientId=${clientId}`;
        const response = await fetch(tokenUrl);

        const responseBody = await response.text();
        if (!response.ok) {
          throw new Error(
            `Token request failed (${response.status} ${response.statusText})${
              responseBody ? ` – ${responseBody}` : ''
            }`
          );
        }

        let tokenRequest;
        try {
          tokenRequest = JSON.parse(responseBody);
        } catch (parseError) {
          throw new Error(`Token response was not valid JSON: ${parseError.message}`);
        }

        ablyClient = new Ably.Realtime({
          authCallback: async (tokenParams, callback) => {
            callback(null, tokenRequest);
          },
          clientId: clientId,
        });

        ablyClient.connection.on('connected', () => {
          setIsConnected(true);
        });

        ablyClient.connection.on('disconnected', () => {
          setIsConnected(false);
        });

        ablyClient.connection.on('suspended', () => {
          setIsConnected(false);
        });

        ablyClient.connection.on('failed', () => {
          setIsConnected(false);
        });

        ablyClient.connection.on('closing', () => {
          setIsConnected(false);
        });

        ablyClient.connection.on('closed', () => {
          setIsConnected(false);
        });

        setAbly(ablyClient);

        // Get channel
        whiteboardChannel = ablyClient.channels.get(`room-${roomId}`);

        // Subscribe to lightweight stroke count updates (not full stroke data)
        whiteboardChannel.subscribe('student-stroke-count', (message) => {
          const { studentId, strokeCount } = message.data;

          if (!studentId) return;

          setStudents(prev => {
            // If student doesn't exist yet, don't create entry (wait for presence)
            if (!prev[studentId]) return prev;

            return {
              ...prev,
              [studentId]: {
                ...prev[studentId],
                strokeCount: strokeCount || 0,
                lastUpdate: Date.now(),
              }
            };
          });
        });

        // Listen for presence events (student connect/disconnect)
        whiteboardChannel.presence.subscribe('enter', (member) => {
          if (member.clientId !== clientId && member.clientId.includes('student')) {
            const studentName = member.data?.name || extractStudentName(member.clientId);
            const incomingClientId = member.clientId;
            const incomingStudentId = member.data?.studentId;

            if (!incomingStudentId) {
              console.warn('⚠️ Student joined without persistent studentId:', incomingClientId);
              return;
            }

            setStudents(prev => {
              // Check if student already exists (keyed by persistent studentId)
              const existingStudent = prev[incomingStudentId];

              if (existingStudent) {
                // Student reconnected - update clientId and presence
                console.log('🔄 Student reconnected:', existingStudent.clientId, '→', incomingClientId, '(', studentName, ')');

                // Update selectedStudent if teacher has modal open with this student
                if (selectedStudent?.studentId === incomingStudentId) {
                  setSelectedStudent({
                    ...existingStudent,
                    clientId: incomingClientId,
                  });
                }

                return {
                  ...prev,
                  [incomingStudentId]: {
                    ...existingStudent,           // Preserve all state (strokeCount, flags, etc.)
                    clientId: incomingClientId,  // Update to new clientId for Ably delivery
                    name: studentName,
                    isActive: true,
                    isVisible: member.data?.isVisible !== false,
                    lastUpdate: Date.now(),
                  }
                };
              }

              // New student - show join toast only once per session
              if (!joinedStudentsRef.current.has(incomingStudentId)) {
                joinedStudentsRef.current.add(incomingStudentId);
                showToast(`${studentName} joined`, 'success');
              }

              return {
                ...prev,
                [incomingStudentId]: {
                  studentId: incomingStudentId,
                  clientId: incomingClientId,
                  name: studentName,
                  strokeCount: 0,
                  isActive: true,
                  isVisible: member.data?.isVisible !== false,
                  lastUpdate: Date.now(),
                  isFlagged: false,
                }
              };
            });

            // Send current question state + annotations immediately (combined message)
            setTimeout(() => {
              const annotations = teacherAnnotationsRef.current?.[incomingStudentId] || [];

              whiteboardChannel.publish('sync-full-state', {
                targetClientId: incomingClientId,
                content: sharedImageRef.current || null,
                questionId: currentQuestionIdRef.current,
                questionNumber: questionNumberRef.current,
                annotations: annotations, // Send annotations immediately, not via separate request
                timestamp: Date.now(),
              });

              if (annotations.length > 0) {
                console.log('📤 Sent', annotations.length, 'teacher annotations to', studentName);
              }
            }, 300);
          }
        });

        whiteboardChannel.presence.subscribe('leave', (member) => {
          if (member.clientId !== clientId && member.clientId.includes('student')) {
            const leavingStudentId = member.data?.studentId;

            setStudents(prev => {
              // Find student by studentId
              const student = leavingStudentId ? prev[leavingStudentId] : null;

              if (!student) return prev;

              const studentName = student?.name || extractStudentName(member.clientId);
              showToast(`${studentName} left`, 'info');

              // Remove from joined tracking
              joinedStudentsRef.current.delete(leavingStudentId);

              // Remove the student card entirely (keyed by studentId)
              const { [leavingStudentId]: removed, ...remaining } = prev;
              return remaining;
            });
          }
        });

        // Listen for student visibility events (immediate notifications)
        whiteboardChannel.subscribe('student-visibility', (message) => {
          const { studentId, studentName, isVisible } = message.data;

          if (!studentId) return;

          // Check previous state before updating
          setStudents(prev => {
            const student = prev[studentId];
            if (!student) return prev;

            const wasInactive = student.isVisible === false;

            // Show notification based on visibility change
            if (!isVisible) {
              showToast(`⚠️ ${studentName} switched away`, 'warning');
            } else if (wasInactive) {
              // Only show "returned" toast if they were previously away
              showToast(`✓ ${studentName} returned`, 'success');
            }

            return {
              ...prev,
              [studentId]: {
                ...student,
                isVisible: isVisible,
                lastVisibilityChange: Date.now(),
              }
            };
          });
        });

        // Listen for teacher shared images
        whiteboardChannel.subscribe('teacher-image', (message) => {
          setSharedImage(message.data);
        });

        // Listen for students requesting current question state (fallback)
        whiteboardChannel.subscribe('request-current-state', (message) => {
          const requestingStudentId = message.data?.studentId;

          // Send current question state + annotations to the requesting student
          setTimeout(() => {
            const annotations = teacherAnnotationsRef.current?.[requestingStudentId] || [];

            whiteboardChannel.publish('sync-full-state', {
              targetClientId: message.clientId,
              content: sharedImageRef.current || null,
              questionId: currentQuestionIdRef.current,
              questionNumber: questionNumberRef.current,
              annotations: annotations,
              timestamp: Date.now(),
            });
          }, 100);
        });

        // Enter presence with teacher role
        await whiteboardChannel.presence.enter({
          role: 'teacher',
          timestamp: Date.now()
        });

        // Load existing students who are already in the room
        const existingMembers = await whiteboardChannel.presence.get();

        // MERGE presence with restored state (don't replace!)
        const currentStudents = { ...students }; // Start with restored state

        // Update students from presence (merge, don't replace)
        existingMembers.forEach(member => {
          if (member.clientId !== clientId && member.clientId.includes('student')) {
            const studentName = member.data?.name || extractStudentName(member.clientId);
            const memberStudentId = member.data?.studentId;

            if (!memberStudentId) {
              console.warn('⚠️ Student in presence without studentId:', member.clientId);
              return;
            }

            const existingStudent = students[memberStudentId] || {};

            // Merge: Keep restored data (strokeCount, etc.), update presence data (clientId, isActive, etc.)
            currentStudents[memberStudentId] = {
              ...existingStudent, // Keep all restored data (strokeCount, studentId, flags, etc.)
              studentId: memberStudentId,
              clientId: member.clientId, // Update to current clientId
              name: studentName,
              isActive: true,
              isVisible: member.data?.isVisible !== false,
              lastUpdate: Date.now(),
              isFlagged: existingStudent.isFlagged || false,
              strokeCount: existingStudent.strokeCount || 0,
            };
          }
        });

        setStudents(currentStudents);

        setChannel(whiteboardChannel);

        if (!participantInitRef.current && sessionId) {
          // Failsafe in case session effect didn't run yet
          try {
            const { data: existingParticipant, error: existingParticipantError } = await supabase
              .from('participants')
              .select('*')
              .eq('session_id', sessionId)
              .eq('client_id', clientId)
              .eq('role', 'teacher')
              .maybeSingle();

            if (existingParticipantError) {
              console.error('Failed to check existing teacher participant during Ably init:', existingParticipantError);
            }

            if (existingParticipant) {
              setParticipantId(existingParticipant.id);
              participantInitRef.current = true;
            } else {
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
                console.error('Failed to create teacher participant during Ably init:', participantError);
              } else {
                setParticipantId(participant.id);
                participantInitRef.current = true;
              }
            }
          } catch (error) {
            console.error('Error ensuring teacher participant during Ably init:', error);
          }
        }
      } catch (error) {
        console.error('Failed to connect to Ably:', error);
      }
    };

    connectToAbly();

    return () => {
      // Don't reset ablyInitializedRef - prevents duplicate subscriptions in React Strict Mode

      if (whiteboardChannel) {
        // Unsubscribe from all events
        whiteboardChannel.unsubscribe();
        whiteboardChannel.presence.unsubscribe();
      }

      if (ablyClient) {
        ablyClient.close();
      }
    };
  }, [roomId, clientId, sessionStateLoaded]); // Wait for IndexedDB to load first

  // Auto-save session state to IndexedDB every 10 seconds (metadata only, no stroke data)
  useEffect(() => {
    if (!sessionId) return;

    const interval = setInterval(async () => {
      try {
        await saveSessionState(sessionId, {
          students: students, // Only contains metadata (studentId, name, strokeCount, flags) - no stroke data
          questionNumber: questionNumber,
          currentQuestionId: currentQuestionId,
          sharedImage: sharedImage,
        });
        console.log('💾 Auto-saved session metadata to IndexedDB');
      } catch (error) {
        console.error('❌ Failed to auto-save session state:', error);
      }
    }, 10000); // Every 10 seconds

    return () => clearInterval(interval);
  }, [sessionId, students, questionNumber, currentQuestionId, sharedImage]);

  // Auto-save teacher annotations to IndexedDB every 10 seconds
  useEffect(() => {
    if (!sessionId || !currentQuestionId) return;

    const interval = setInterval(async () => {
      try {
        // Save all teacher annotations for current question
        const annotationCount = Object.keys(teacherAnnotations).length;
        if (annotationCount > 0) {
          for (const [targetStudentId, annotations] of Object.entries(teacherAnnotations)) {
            await saveTeacherAnnotation(sessionId, targetStudentId, currentQuestionId, annotations);
          }
        }
      } catch (error) {
        console.error('❌ Failed to auto-save teacher annotations:', error);
      }
    }, 10000); // Every 10 seconds

    return () => clearInterval(interval);
  }, [sessionId, currentQuestionId, teacherAnnotations]);

  // Extract friendly name from clientId
  const extractStudentName = (clientId) => {
    const match = clientId.match(/student-(\d+)/) || clientId.match(/student-([\w]+)/);
    return match ? `Student ${match[1]}` : clientId;
  };

  // Handle opening annotation modal
  const handleCardClick = (student) => {
    setSelectedStudent(students[student.studentId] || student);
  };

  // Handle closing annotation modal
  const handleCloseModal = () => {
    setSelectedStudent(null);
  };

  // Handle teacher annotations
  const handleAnnotate = async (annotations) => {
    if (!selectedStudent || !channel) return;

    // Use persistent studentId for storage, clientId for Ably delivery
    const persistentStudentId = selectedStudent.studentId;
    const currentClientId = selectedStudent.clientId;

    if (!persistentStudentId) {
      console.error('❌ Student has no persistent studentId, cannot save annotation');
      return;
    }

    // Store annotations locally using persistent studentId as key
    setTeacherAnnotations(prev => ({
      ...prev,
      [persistentStudentId]: annotations,
    }));

    // Save to IndexedDB using persistent studentId
    if (sessionId && currentQuestionId) {
      try {
        await saveTeacherAnnotation(sessionId, persistentStudentId, currentQuestionId, annotations);
      } catch (error) {
        console.error('❌ Failed to save teacher annotation:', error);
      }
    }

    // Publish annotations to Ably using current clientId for delivery
    channel.publish('teacher-annotation', {
      targetStudentId: currentClientId, // Use clientId for Ably delivery
      annotations: annotations,
      teacherId: clientId,
      timestamp: Date.now(),
    });

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
      prev && prev.studentId === studentId ? { ...prev, isFlagged: !prev.isFlagged } : prev
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

    // Log file details for debugging
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    console.log('📸 File selected:', {
      name: file.name,
      type: file.type,
      size: `${fileSizeMB}MB (${file.size} bytes)`,
      lastModified: new Date(file.lastModified).toISOString()
    });

    // Validate file type
    if (!file.type.startsWith('image/')) {
      const errorMsg = `❌ Invalid file type: ${file.type || 'unknown'}. Please select an image file (JPG, PNG, etc.)`;
      setImageMessage(errorMsg);
      console.error(errorMsg);
      showToast('Invalid file type', 'error');
      return;
    }

    // Validate file size (25MB limit)
    const maxSizeMB = 25;
    if (file.size > maxSizeMB * 1024 * 1024) {
      const errorMsg = `❌ File too large: ${fileSizeMB}MB. Maximum size is ${maxSizeMB}MB.`;
      setImageMessage(errorMsg);
      console.error(errorMsg);
      showToast('File too large', 'error');
      return;
    }

    setIsUploadingImage(true);
    setImageMessage(`Processing ${file.name} (${fileSizeMB}MB)...`);

    try {
      const { dataUrl, width, height, size } = await resizeAndCompressImage(file);
      const payload = {
        dataUrl,
        width,
        height,
        filename: file.name,
        timestamp: Date.now(),
      };
      setStagedImage(payload);
      setImageMessage(`✅ Image ready (${width}×${height}, ${Math.round(size/1024)}KB)`);
      console.log('✅ Image processed successfully');
    } catch (error) {
      const errorDetails = {
        fileName: file.name,
        fileType: file.type,
        fileSize: `${fileSizeMB}MB`,
        errorMessage: error.message || 'Unknown error',
        errorStack: error.stack
      };

      console.error('❌ [TEACHER] Image upload failed:', errorDetails);

      // Create detailed error message
      let detailedError = `❌ Upload failed: ${error.message || 'Unknown error'}\n`;
      detailedError += `File: ${file.name} (${file.type})\n`;
      detailedError += `Size: ${fileSizeMB}MB\n`;

      // Check for specific error types
      if (error.message?.includes('load')) {
        detailedError += 'Error loading image. The file may be corrupted or in an unsupported format.';
      } else if (error.message?.includes('compress')) {
        detailedError += 'Error compressing image. Try a different image or smaller file.';
      } else if (error.message?.includes('memory') || error.message?.includes('allocation')) {
        detailedError += 'Image too large for device memory. Try a smaller image.';
      } else {
        detailedError += 'Try a different image or format (JPG/PNG recommended).';
      }

      setImageMessage(detailedError);
      showToast(`Upload failed: ${error.message}`, 'error');
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
    if (!channel || !sessionId) {
      console.error('Cannot send: channel or sessionId missing', { channel: !!channel, sessionId });
      setImageMessage('Error: Not connected properly. Please refresh the page.');
      showToast('Failed to send: Connection issue', 'error');
      return;
    }

    try {
      // If this is the first content being sent, start the session
      const isFirstQuestion = sessionStatus === 'created';

      if (isFirstQuestion) {

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

      }

      // BEFORE moving to next question: Save all current work to Supabase
      if (currentQuestionId) {
        console.log('💾 Saving teacher annotations from Q', questionNumber, 'to Supabase before moving to next question');

        // Save teacher annotations to Supabase
        // Note: Students save their own work, so teacher only needs to save annotations
        const savePromises = [];

        for (const [targetStudentId, annotations] of Object.entries(teacherAnnotations)) {
          if (annotations.length > 0) {
            // Find participant by persistent studentId
            // Note: participant.client_id may be outdated after student refresh, but participant_id is stable
            const student = students[targetStudentId];

            if (student) {
              const { data: participant } = await supabase
                .from('participants')
                .select('id')
                .eq('session_id', sessionId)
                .eq('client_id', student.clientId) // Use current clientId from state
                .eq('role', 'student')
                .maybeSingle();

              if (participant) {
                const savePromise = supabase
                  .from('annotations')
                  .upsert({
                    session_id: sessionId,
                    participant_id: participant.id,
                    question_id: currentQuestionId,
                    student_lines: [], // Students save their own lines
                    teacher_annotations: annotations,
                    last_updated_at: new Date().toISOString(),
                  }, {
                    onConflict: 'participant_id,question_id'
                  });

                savePromises.push(savePromise);
              }
            }
          }
        }

        // Wait for all saves to complete
        if (savePromises.length > 0) {
          try {
            await Promise.all(savePromises);
            console.log(`✅ Saved annotations for ${savePromises.length} students to Supabase`);
          } catch (saveError) {
            console.error('❌ Failed to save some annotations to Supabase:', saveError);
            // Continue anyway - annotations are still in IndexedDB
          }
        }
      }

      // Increment question number
      const newQuestionNumber = questionNumber + 1;
      setQuestionNumber(newQuestionNumber);
      questionNumberRef.current = newQuestionNumber;

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

      setCurrentQuestionId(question.id);
      currentQuestionIdRef.current = question.id;

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

    const notifySuccess = () => {
      showToast('Link copied to clipboard!', 'success');
    };

    // Try modern Clipboard API first (works on HTTPS)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(studentUrl);
        notifySuccess();
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
        input.setSelectionRange(0, studentUrl.length);

        // Try legacy execCommand
        const successful = document.execCommand('copy');
        if (successful) {
          notifySuccess();
          // Deselect
          window.getSelection().removeAllRanges();
          return;
        }
      }
      throw new Error('execCommand failed');
    } catch (error) {
      console.error('Fallback copy failed:', error);
      // Select the text so user can manually copy
      if (linkInputRef.current) {
        linkInputRef.current.select();
      }
      showToast('Select the link and press ⌘C/CTRL+C to copy', 'warning');
    }
  };

  // Get student array sorted alphabetically by name
  const getStudentsList = () => {
    return Object.values(students).sort((a, b) => {
      // Get student names, fallback to clientId if no name
      const nameA = (a.name || a.clientId || '').toLowerCase();
      const nameB = (b.name || b.clientId || '').toLowerCase();

      // Alphabetical sorting (00_xxx before 01_yyy, Ace before Andy)
      return nameA.localeCompare(nameB);
    });
  };

  // Filter students by search query
  const getFilteredStudents = () => {
    const allStudents = getStudentsList();
    const query = searchQuery.trim().toLowerCase();

    return allStudents.filter(student => {
      const matchesSearch = !query
        ? true
        : (student.name || student.studentId).toLowerCase().includes(query);

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
    ? students[selectedStudent.studentId] || selectedStudent
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
        <div className="feather-branding" onClick={() => window.location.reload()} style={{ cursor: 'pointer' }}>
          <Feather size={32} strokeWidth={2} />
          <span className="feather-text">Feather</span>
        </div>

        <section className="hero-card glass-panel">
          <div className="hero-top">
            <div className="hero-copy">
              <p className="eyebrow">Teacher dashboard</p>
              <h1>Monitor and annotate student canvases live</h1>
              <p className="hero-subtitle">
                Share the session code to invite students. Their canvases appear in real time as they connect.
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
              <button
                className="end-session-btn"
                onClick={handleEndSession}
                title="End session and logout all students"
              >
                End Session
              </button>
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

        <section className="controls-section glass-panel">
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
                  .filter(student => student && student.studentId && student.clientId)
                  .map(student => (
                    <StudentCard
                      key={student.studentId}
                      student={student}
                      onClick={handleCardClick}
                      onToggleFlag={toggleFlag}
                      teacherAnnotations={teacherAnnotations[student.studentId] || []}
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
          selectedStudentData ? (teacherAnnotations[selectedStudentData.studentId] || []) : []
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
