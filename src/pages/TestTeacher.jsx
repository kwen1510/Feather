import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Ably from 'ably/promises';
import QRCode from 'qrcode';
import { Feather } from 'lucide-react';
import StudentCard from '../components/StudentCard';
import AnnotationModal from '../components/AnnotationModal';
import { resizeAndCompressImage } from '../utils/imageUtils';
import { supabase } from '../supabaseClient';
import { initDB, saveStroke as saveStrokeToIndexedDB, loadStrokes as loadStrokesFromIndexedDB, clearStrokes as clearStrokesFromIndexedDB, validateSession, replaceAllStrokes as replaceAllStrokesInIndexedDB, loadAllTeacherAnnotations } from '../utils/indexedDB';
import './TeacherDashboard.css';

// Generate unique stroke ID
const generateStrokeId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const TestTeacher = () => {
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

  // Supabase session tracking (validation only)
  const [sessionId, setSessionId] = useState(null);
  const [sessionStatus, setSessionStatus] = useState('created'); // 'created' | 'active' | 'ended'
  const [isNewSession, setIsNewSession] = useState(false); // Track if session is newly created with no students

  // Ably connection
  const [ably, setAbly] = useState(null);
  const [broadcastChannel, setBroadcastChannel] = useState(null); // Broadcast channel: {roomId}-broadcast (teacher publishes, all subscribe)
  const [studentChannels, setStudentChannels] = useState({}); // Individual channels: {roomId}-{studentId} (one per student, bidirectional)
  const studentChannelsRef = useRef({}); // Ref to access latest student channels in callbacks
  const [isConnected, setIsConnected] = useState(false);
  const [clientId] = useState(`teacher-${Math.random().toString(36).substring(7)}`);

  // Question tracking for persistence
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(0);

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
  const studentsRef = useRef({}); // Ref to access latest students in callbacks
  const logoutTimerRef = useRef(null);
  const imageInputRef = useRef(null);
  const linkInputRef = useRef(null); // Ref for the student link input field
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [toasts, setToasts] = useState([]);

  const isRemoteUpdate = useRef(false);
  const sessionInitStateRef = useRef({ roomId: null, status: 'idle' });
  const joinedStudentsRef = useRef(new Set()); // Track students who have already joined this session
  const ablyInitializedRef = useRef(false); // Track if Ably has been initialized to prevent duplicates
  const [isLoadingData, setIsLoadingData] = useState(false); // Loading state during page refresh

  // Load shared image from localStorage after roomId is initialized
  useEffect(() => {
    if (roomId) {
      try {
        const saved = localStorage.getItem(`sharedImage_${roomId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          setSharedImage(parsed);
          console.log('✅ Restored shared image from localStorage for room:', roomId);
        }
      } catch (error) {
        console.error('Error loading shared image from localStorage:', error);
      }
    }
  }, [roomId]); // Only run when roomId changes

  // Keep ref updated with latest sharedImage and save to localStorage
  useEffect(() => {
    sharedImageRef.current = sharedImage;
    
    // Save shared image to localStorage for persistence across page refreshes
    if (roomId) {
      try {
        if (sharedImage) {
          localStorage.setItem(`sharedImage_${roomId}`, JSON.stringify(sharedImage));
        } else {
          localStorage.removeItem(`sharedImage_${roomId}`);
        }
      } catch (error) {
        console.error('Error saving shared image to localStorage:', error);
      }
    }
  }, [sharedImage, roomId]);

  // Keep refs updated with latest state
  useEffect(() => {
    teacherAnnotationsRef.current = teacherAnnotations;
  }, [teacherAnnotations]);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  useEffect(() => {
    studentChannelsRef.current = studentChannels;
  }, [studentChannels]);

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
      // SAVE FINAL QUESTION DATA BEFORE ENDING SESSION
      if (currentQuestionNumber > 0 && roomId) {
        console.log(`💾 Saving final question ${currentQuestionNumber} before ending session...`);

        try {
          // Aggregate data from REFS (to get latest state, not stale callback state)
          const studentsData = {};
          const currentStudents = studentsRef.current;
          const currentTeacherAnnotations = teacherAnnotationsRef.current;

          for (const [studentId, student] of Object.entries(currentStudents)) {
            studentsData[studentId] = {
              studentLines: student.lines || [],
              teacherAnnotations: currentTeacherAnnotations[studentId] || [],
              studentName: student.name || 'Unknown Student',
              clientId: student.clientId || null,
            };
          }

          console.log(`📊 Aggregated data for ${Object.keys(studentsData).length} students`);

          const response = await fetch('/api/strokes/persist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              questionNumber: currentQuestionNumber,
              contentType: sharedImage?.type ? 'template' : (sharedImage ? 'image' : 'blank'),
              content: sharedImage,
              studentsData: studentsData,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            console.log(`✅ Saved final ${result.savedCount} student responses before ending`);
          }
        } catch (persistError) {
          console.error('Error saving final question:', persistError);
        }
      }

      await supabase
        .from('sessions')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      // Publish session-ended event to broadcast channel
      if (broadcastChannel) {
        await broadcastChannel.publish('session-ended', {
          timestamp: Date.now(),
          reason,
        });
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
  }, [sessionId, sessionStatus, broadcastChannel, currentQuestionNumber, roomId, sharedImage]);

  // Redis auto-save removed - now using IndexedDB + Ably recovery only

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

          // Detect if this is a new session (status 'created' with no students connected yet)
          const isFirstSession = session.status === 'created' && !session.started_at;
          setIsNewSession(isFirstSession);
          console.log(`🔍 Session detection: isNewSession=${isFirstSession}, status=${session.status}, started_at=${session.started_at}`);

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
      }
    };
  }, [roomId, clientId]);

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

  // Connect to Ably
  useEffect(() => {
    // Prevent duplicate initialization
    if (ablyInitializedRef.current || !roomId || !clientId) {
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

        let hasInitiallyConnected = false;

        ablyClient.connection.on('connected', async () => {
          setIsConnected(true);
          console.log('✅ Teacher connected to Ably');

          // Handle reconnection - request strokes from all students
          if (hasInitiallyConnected && whiteboardChannel) {
            console.log('🔄 Teacher reconnected - requesting strokes from all students');

            try {
              // Re-enter presence
              await whiteboardChannel.presence.enter({
                role: 'teacher',
                timestamp: Date.now()
              });

              // Broadcast request for student strokes (check connected students)
              setTimeout(async () => {
                if (whiteboardChannel && whiteboardChannel.state === 'attached') {
                  // Check number of connected students before requesting strokes
                  const connectedMembers = await whiteboardChannel.presence.get();
                  const connectedStudents = connectedMembers.filter(member =>
                    member.clientId &&
                    member.clientId !== clientId &&
                    member.clientId.includes('student')
                  );
                  const studentCount = connectedStudents.length;

                  if (studentCount === 0) {
                    // No students connected - skip stroke request entirely
                    console.log('ℹ️ No students connected - skipping stroke request on reconnection');
                  } else {
                    // 1+ students connected - show toast and request strokes
                    console.log(`📤 Broadcasting request for strokes from ${studentCount} student(s)`);
                    showToast('Restoring saved state', 'info');

                    whiteboardChannel.publish('request-student-strokes', {
                      timestamp: Date.now(),
                    });
                  }
                }
              }, 500);

              // Load own annotations from IndexedDB
              setTimeout(async () => {
                try {
                  const { loadAllTeacherAnnotations } = await import('../utils/indexedDB');
                  const allAnnotations = await loadAllTeacherAnnotations(roomId, 'teacher');
                  if (Object.keys(allAnnotations).length > 0) {
                    console.log(`✅ Loaded teacher annotations for ${Object.keys(allAnnotations).length} students from IndexedDB`);
                    setTeacherAnnotations(allAnnotations);
                  }
                } catch (error) {
                  console.error('❌ Error loading teacher annotations from IndexedDB:', error);
                }
              }, 300);
            } catch (error) {
              console.error('❌ Error during teacher reconnection:', error);
            }
          } else {
            hasInitiallyConnected = true;
          }
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
        const studentCh = ablyClient.channels.get(`${roomId}-student`);
        const teacherCh = ablyClient.channels.get(`${roomId}-teacher`);

        whiteboardChannel = studentCh; // Keep reference for cleanup (presence monitoring on student channel)

        // Removed: Subscribe to stroke count updates (will be replaced with real-time stroke subscription)

        // Listen for presence events (student connect/disconnect)
        studentCh.presence.subscribe('enter', (member) => {
          // Skip non-student members
          if (!member.clientId || member.clientId === clientId || !member.clientId.includes('student')) {
            return;
          }

          const studentName = member.data?.name || extractStudentName(member.clientId);
          const incomingClientId = member.clientId;
          const incomingStudentId = member.data?.studentId;

          console.log('👤 Presence enter event:', {
            studentName,
            incomingClientId,
            incomingStudentId,
            hasData: !!member.data
          });

          if (!incomingStudentId) {
            console.warn('⚠️ Student joined without persistent studentId:', incomingClientId);
            return;
          }

          if (!incomingClientId) {
            console.warn('⚠️ Student joined without clientId:', incomingStudentId);
            return;
          }

          setStudents(prev => {
            // Check if student already exists (keyed by persistent studentId)
            const existingStudent = prev[incomingStudentId];
            
            // Check if student has been in this session before (even if they left)
            const hasJoinedBefore = joinedStudentsRef.current.has(incomingStudentId);

            // Reconnection cases:
            // 1. Student exists in state with clientId (quick reconnect)
            // 2. Student NOT in state but HAS joined before (rejoining after leave)
            const isReconnection = (existingStudent && existingStudent.clientId) || 
                                   (!existingStudent && hasJoinedBefore);

            if (isReconnection) {
              // Student reconnected - update clientId and presence
              console.log('🔄 Student reconnected:', existingStudent?.clientId || 'N/A', '→', incomingClientId, '(', studentName, ')');

              // Show rejoined toast
              showToast(`${studentName} rejoined`, 'success');

              // Update selectedStudent if teacher has modal open with this student
              if (selectedStudent?.studentId === incomingStudentId) {
                setSelectedStudent({
                  ...existingStudent,
                  clientId: incomingClientId,
                });
              }

              const updatedStudent = {
                ...(existingStudent || {}),   // Preserve all state (flags, etc.) if exists
                studentId: incomingStudentId,
                clientId: incomingClientId,  // Update to new clientId for Ably delivery
                name: studentName,
                isActive: true,
                isVisible: member.data?.isVisible !== false,
                lastUpdate: Date.now(),
              };

              console.log('✅ Updated existing student:', updatedStudent);

              return {
                ...prev,
                [incomingStudentId]: updatedStudent
              };
            }

            // New student - show join toast only once per session
            // (Also handles case where student exists but has undefined clientId due to race condition)
            const isFirstJoin = !hasJoinedBefore;
            
            if (isFirstJoin) {
              joinedStudentsRef.current.add(incomingStudentId);
              showToast(`${studentName} joined`, 'success');
            } else if (existingStudent && !existingStudent.clientId) {
              // Student existed with undefined clientId - log this anomaly
              console.warn('⚠️ Fixed student with undefined clientId:', incomingStudentId);
            }

            const newStudent = {
              studentId: incomingStudentId,
              clientId: incomingClientId,
              name: studentName,
              isActive: true,
              isVisible: member.data?.isVisible !== false,
              lastUpdate: Date.now(),
              isFlagged: existingStudent?.isFlagged || false, // Preserve flag if exists
            };

            console.log(isFirstJoin ? '✅ Added new student:' : '✅ Initialized student with clientId:', newStudent);
            console.log('📊 Total students after add:', Object.keys(prev).length + 1);

            return {
              ...prev,
              [incomingStudentId]: newStudent
            };
          });

          // Send current shared image if exists
          setTimeout(() => {
            try {
              if (!whiteboardChannel || whiteboardChannel.state !== 'attached') {
                console.warn('⚠️ Cannot send sync-full-state: channel not ready');
                return;
              }

              const annotations = teacherAnnotationsRef.current?.[incomingStudentId] || [];

              whiteboardChannel.publish('sync-full-state', {
                targetClientId: incomingClientId,
                content: sharedImageRef.current || null,
                annotations: annotations,
                timestamp: Date.now(),
              });

              if (annotations.length > 0) {
                console.log('📤 Sent', annotations.length, 'teacher annotations to', studentName);
              }
            } catch (error) {
              console.error('❌ Error sending sync-full-state:', error);
            }
          }, 300);
        });

        studentCh.presence.subscribe('leave', (member) => {
          if (member.clientId !== clientId && member.clientId.includes('student')) {
            const leavingStudentId = member.data?.studentId;

            setStudents(prev => {
              // Find student by studentId
              const student = leavingStudentId ? prev[leavingStudentId] : null;

              if (!student) return prev;

              const studentName = student?.name || extractStudentName(member.clientId);

              // Only show "left" toast if they actually joined this session (prevent spam on refresh)
              if (joinedStudentsRef.current.has(leavingStudentId)) {
                showToast(`${studentName} left`, 'info');
              }

              // DON'T remove from joinedStudentsRef - we want to track they've been in this session
              // This prevents duplicate "joined" toasts if they reconnect

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

        // Listen for student drawing updates
        whiteboardChannel.subscribe('student-layer', (message) => {
          const { lines, studentId, clientId: studentClientId } = message.data;

          // Use persistent studentId (direct O(1) lookup) or fallback to clientId search
          setStudents(prev => {
            const lookupId = studentId || Object.keys(prev).find(id => prev[id].clientId === studentClientId);

            if (!lookupId) {
              console.warn('⚠️ Student not found for stroke update. studentId:', studentId, 'clientId:', studentClientId);
              console.warn('Available students:', Object.keys(prev));
              return prev;
            }

            console.log('✅ Updating student', lookupId, 'with', (lines || []).length, 'lines');

            return {
              ...prev,
              [lookupId]: {
                ...prev[lookupId],
                lines: lines || [],
              }
            };
          });
        });

        // Listen for teacher shared images
        whiteboardChannel.subscribe('teacher-image', (message) => {
          setSharedImage(message.data);
        });

        // Listen for students requesting current state (fallback)
        whiteboardChannel.subscribe('request-current-state', (message) => {
          const requestingStudentId = message.data?.studentId;

          // Send current shared image + annotations to the requesting student
          setTimeout(() => {
            try {
              if (!whiteboardChannel || whiteboardChannel.state !== 'attached') {
                console.warn('⚠️ Cannot send sync-full-state: channel not ready');
                return;
              }

              const annotations = teacherAnnotationsRef.current?.[requestingStudentId] || [];

              whiteboardChannel.publish('sync-full-state', {
                targetClientId: message.clientId,
                content: sharedImageRef.current || null,
                annotations: annotations,
                timestamp: Date.now(),
              });
            } catch (error) {
              console.error('❌ Error sending sync-full-state on request:', error);
            }
          }, 100);
        });

        // Handle student request for teacher annotations (after student refresh)
        whiteboardChannel.subscribe('request-teacher-annotations', async (message) => {
          const requestingStudentId = message.data?.studentId;
          const requestingClientId = message.data?.clientId;

          console.log(`📨 Received annotation request from student ${requestingStudentId}`);

          // Load annotations from IndexedDB for this student
          try {
            const { loadAllTeacherAnnotations } = await import('../utils/indexedDB');
            const allAnnotations = await loadAllTeacherAnnotations(roomId, 'teacher');
            const annotations = allAnnotations[requestingStudentId] || [];

            console.log(`📤 Sending ${annotations.length} teacher annotations to student ${requestingStudentId}`);

            // Send annotations back to requesting student
            setTimeout(() => {
              if (whiteboardChannel && whiteboardChannel.state === 'attached') {
                whiteboardChannel.publish('response-teacher-annotations', {
                  targetStudentId: requestingStudentId,
                  targetClientId: requestingClientId,
                  annotations: annotations,
                  timestamp: Date.now(),
                });
              }
            }, 100);
          } catch (error) {
            console.error('❌ Error loading annotations from IndexedDB:', error);
          }
        });

        // Handle student response with their strokes (after teacher reconnect)
        whiteboardChannel.subscribe('response-student-strokes', (message) => {
          const studentId = message.data?.studentId;
          const studentLines = message.data?.strokes || [];
          const studentName = message.data?.studentName;

          console.log(`📨 Received ${studentLines.length} strokes from student ${studentName} (${studentId})`);

          if (studentId && studentLines.length > 0) {
            // Update the student's strokes in the dashboard
            setStudents(prevStudents => {
              const existing = prevStudents[studentId];
              if (existing) {
                return {
                  ...prevStudents,
                  [studentId]: {
                    ...existing,
                    lines: studentLines,
                  }
                };
              }
              return prevStudents;
            });
          }
        });

        // Enter presence with teacher role
        await studentCh.presence.enter({
          role: 'teacher',
          timestamp: Date.now()
        });

        // Load existing students who are already in the room
        const existingMembers = await studentCh.presence.get();

        // Update students from presence (merge with existing state)
        setStudents(prevStudents => {
          const currentStudents = { ...prevStudents }; // Start with current state

          console.log(`📥 Loading ${existingMembers.length} existing members from presence`);

          existingMembers.forEach(member => {
            // Skip teacher or invalid members
            if (!member.clientId || member.clientId === clientId || !member.clientId.includes('student')) {
              return;
            }

            const studentName = member.data?.name || extractStudentName(member.clientId);
            const memberStudentId = member.data?.studentId;
            const memberClientId = member.clientId;

            if (!memberStudentId) {
              console.warn('⚠️ Student in presence without studentId:', memberClientId);
              return;
            }

            if (!memberClientId) {
              console.warn('⚠️ Student in presence without clientId:', memberStudentId);
              return;
            }

            const existingStudent = prevStudents[memberStudentId] || {};

            // Merge: Keep restored data (flags, etc.), update presence data (clientId, isActive, etc.)
            currentStudents[memberStudentId] = {
              ...existingStudent, // Keep all restored data (studentId, flags, etc.)
              studentId: memberStudentId,
              clientId: memberClientId, // Update to current clientId
              name: studentName,
              isActive: true,
              isVisible: member.data?.isVisible !== false,
              lastUpdate: Date.now(),
              isFlagged: existingStudent.isFlagged || false,
            };

            // Track that this student has joined (prevent duplicate join toasts)
            if (!joinedStudentsRef.current.has(memberStudentId)) {
              joinedStudentsRef.current.add(memberStudentId);
            }

            console.log('✅ Loaded student from presence:', studentName, '| studentId:', memberStudentId, '| clientId:', memberClientId);
          });

          console.log(`📊 Total students in state after presence load: ${Object.keys(currentStudents).length}`);
          return currentStudents;
        });

        setStudentChannel(studentCh);
        setTeacherChannel(teacherCh);

        // Load strokes ONLY on page refresh (IndexedDB for teacher, Redis for students)
        // Use sessionStorage flag to reliably detect refresh
        const hasLoadedBefore = sessionStorage.getItem('feather_teacher_page_loaded');
        const navEntry = performance.getEntriesByType('navigation')[0];
        const isPageRefresh = hasLoadedBefore === 'true' ||
                             navEntry?.type === 'reload' ||
                             performance.navigation?.type === 1;

        // Mark that page has been loaded
        sessionStorage.setItem('feather_teacher_page_loaded', 'true');

        console.log('🔍 Teacher page load detection:', {
          hasLoadedBefore,
          navType: navEntry?.type,
          isPageRefresh,
        });

        if (isPageRefresh) {
          setTimeout(async () => {
            try {
              console.log('🔄 Page refresh detected - loading teacher annotations from IndexedDB...');

              // Initialize IndexedDB
              await initDB();
              console.log('✅ IndexedDB initialized for teacher');

              // Validate session - clear IndexedDB if session changed
              const isValidSession = await validateSession(roomId, clientId, 'teacher', sessionId);

              if (!isValidSession) {
                console.log('⚠️ Session changed - IndexedDB was cleared for teacher');
              }

              // Load teacher annotations from IndexedDB only
              if (isValidSession) {
                console.log('📂 Loading all teacher annotations from IndexedDB...');
                const teacherAnnotationsFromIndexedDB = await loadAllTeacherAnnotations(roomId);

                if (Object.keys(teacherAnnotationsFromIndexedDB).length > 0) {
                  console.log(`✅ Loaded teacher annotations from IndexedDB for ${Object.keys(teacherAnnotationsFromIndexedDB).length} students`);
                  setTeacherAnnotations(teacherAnnotationsFromIndexedDB);
                } else {
                  console.log('ℹ️ No teacher annotations found in IndexedDB');
                }
              }

              // Request strokes from all connected students after page refresh
              setTimeout(async () => {
                if (whiteboardChannel && whiteboardChannel.state === 'attached') {
                  // Check number of connected students before requesting strokes
                  const connectedMembers = await studentCh.presence.get();
                  const connectedStudents = connectedMembers.filter(member =>
                    member.clientId &&
                    member.clientId !== clientId &&
                    member.clientId.includes('student')
                  );
                  const studentCount = connectedStudents.length;

                  if (studentCount === 0) {
                    // No students connected - skip stroke request entirely
                    console.log('ℹ️ No students connected - skipping stroke request');
                  } else {
                    // 1+ students connected - show toast and request strokes
                    console.log(`📤 Broadcasting request for strokes from ${studentCount} student(s)`);
                    showToast('Restoring saved state', 'info');

                    whiteboardChannel.publish('request-student-strokes', {
                      timestamp: Date.now(),
                    });
                  }
                }
              }, 1200); // Give students time to connect and be ready

              // Student strokes will be received via Ably when students respond to request
              console.log('ℹ️ Student strokes will be requested from all connected students via Ably');
            } catch (error) {
              console.error('Error loading strokes on refresh:', error);
            }
          }, 1000); // Small delay to ensure channel is fully set up
        } else {
          console.log('ℹ️ Normal page load - skipping persistence restore');
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
        studentCh.presence.unsubscribe();
      }

      if (ablyClient) {
        ablyClient.close();
      }
    };
  }, [roomId, clientId]);

  // Extract friendly name from clientId
  const extractStudentName = (clientId) => {
    if (!clientId) return 'Student';
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

    // Publish annotations to Ably using current clientId for delivery (for real-time updates)
    teacherChannel.publish('teacher-annotation', {
      targetStudentId: currentClientId, // Use clientId for Ably delivery
      annotations: annotations,
      teacherId: clientId,
      timestamp: Date.now(),
    });

    // Save all annotations to IndexedDB for this specific student
    setTimeout(async () => {
      try {
        console.log(`💾 Saving ${annotations.length} teacher annotations for student ${persistentStudentId} to IndexedDB`);
        
        // Create a composite key for teacher annotations: `teacher:${persistentStudentId}`
        // This allows us to store annotations per student in IndexedDB
        const teacherUserId = `teacher:${persistentStudentId}`;
        
        // Use replaceAllStrokes to save all annotations for this student
        await replaceAllStrokesInIndexedDB(annotations, roomId, teacherUserId, 'teacher', sessionId);
        console.log(`✅ Saved teacher annotations for student ${persistentStudentId} to IndexedDB`);
      } catch (error) {
        console.error('❌ Error saving teacher annotations to IndexedDB:', error);
      }
    }, 150);
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
      detailedError += `Size: ${fileSizeMB}MB\n\n`;

      // Check for specific error types
      if (error.message?.includes('HEIC') || error.message?.includes('heic')) {
        detailedError += 'HEIC conversion failed. This can happen with some iPad photos.\n';
        detailedError += 'Try: Taking a screenshot of the photo, or using a different image format.';
      } else if (error.message?.includes('still too large') || error.message?.includes('limit')) {
        detailedError += 'Image is too large even after compression.\n';
        detailedError += 'Try: Using a smaller image, cropping the photo, or taking a new photo closer to the subject.';
      } else if (error.message?.includes('load')) {
        detailedError += 'Error loading image. The file may be corrupted or in an unsupported format.';
      } else if (error.message?.includes('compress')) {
        detailedError += 'Error compressing image. Try a different image or smaller file.';
      } else if (error.message?.includes('memory') || error.message?.includes('allocation')) {
        detailedError += 'Image too large for device memory. Try a smaller image.';
      } else {
        detailedError += 'Try a different image or format (JPG/PNG recommended, HEIC also supported).';
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
      await teacherChannel.publish('teacher-image', stagedImage);
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
    if (!channel || !sessionId || !isConnected) {
      console.error('Cannot send: channel or sessionId missing', { channel: !!channel, sessionId, isConnected });
      setImageMessage('Error: Not connected properly. Please refresh the page.');
      showToast('Failed to send: Connection issue', 'error');
      return;
    }

    // Prevent double-send
    if (imageMessage.includes('sending')) {
      console.log('Already sending, ignoring duplicate click');
      return;
    }

    setImageMessage('Sending to class...');

    try {
      // STEP 1: Persist current question data to Supabase (if there's data to save)
      if (currentQuestionNumber > 0) {
        console.log(`💾 Persisting question ${currentQuestionNumber} before moving to next...`);

        try {
          // Aggregate data from REFS (to ensure we get latest state)
          const studentsData = {};
          const currentStudents = studentsRef.current;
          const currentTeacherAnnotations = teacherAnnotationsRef.current;

          for (const [studentId, student] of Object.entries(currentStudents)) {
            studentsData[studentId] = {
              studentLines: student.lines || [],
              teacherAnnotations: currentTeacherAnnotations[studentId] || [],
              studentName: student.name || 'Unknown Student',
              clientId: student.clientId || null,
            };
          }

          console.log(`📊 Aggregated data for ${Object.keys(studentsData).length} students`);

          const response = await fetch('/api/strokes/persist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              questionNumber: currentQuestionNumber,
              contentType: sharedImage?.type ? 'template' : (sharedImage ? 'image' : 'blank'),
              content: sharedImage,
              studentsData: studentsData,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            console.log(`✅ Persisted ${result.savedCount} student responses for question ${currentQuestionNumber}`);
          } else {
            console.warn('Failed to persist question, but continuing...', await response.text());
          }
        } catch (persistError) {
          console.error('Error persisting question:', persistError);
          // Don't block the flow if persistence fails
        }
      }

      // STEP 2: Increment question number for the new question
      const nextQuestionNumber = currentQuestionNumber + 1;
      setCurrentQuestionNumber(nextQuestionNumber);
      console.log(`📝 Moving to question ${nextQuestionNumber}`);

      // If this is the first content being sent, start the session
      const isFirstContent = sessionStatus === 'created';

      if (isFirstContent) {
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
        setIsNewSession(false); // Session is no longer new once it's started

        // Publish session-started event (broadcast to all)
        await broadcastChannel.publish('session-started', {
          timestamp: Date.now(),
          sessionId: sessionId,
        });
      }

      // Prepare content for the message
      let content = null;
      if (prepTab === 'templates' && stagedTemplate) {
        content = stagedTemplate;
      } else if (prepTab === 'image' && stagedImage) {
        content = stagedImage;
      }
      // For blank, content stays null

      // Clear all student drawings and teacher annotations + send content in ONE message (broadcast to all)
      await broadcastChannel.publish('clear-all-drawings', {
        timestamp: Date.now(),
        content: content, // Include content directly
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
      const currentAnnotations = teacherAnnotationsRef.current;
      setTeacherAnnotations({}); // Clear all teacher annotations
      setSelectedStudent(null); // Close annotation modal and clear selected student

      // Clear IndexedDB for teacher's annotations for each student
      try {
        const studentIds = Object.keys(currentAnnotations);
        if (studentIds.length > 0) {
          for (const studentId of studentIds) {
            const teacherUserId = `teacher:${studentId}`;
            await clearStrokesFromIndexedDB(roomId, teacherUserId, 'teacher');
          }
          console.log(`🗑️ Cleared teacher annotations for ${studentIds.length} students from IndexedDB`);
        }
      } catch (error) {
        console.error('❌ Error clearing teacher annotations from IndexedDB:', error);
      }

      // Update local shared image state
      if (prepTab === 'blank') {
        setSharedImage(null);
        setStagedTemplate(null);
        setImageMessage('Blank canvas sent to all students.');
      } else if (prepTab === 'templates' && stagedTemplate) {
        setSharedImage(stagedTemplate);
        setImageMessage('Template sent to all students.');
      } else if (prepTab === 'image' && stagedImage) {
        setSharedImage(stagedImage);
        setImageMessage('Image sent to all students.');
      }

      showToast('Content sent!', 'success');
    } catch (error) {
      console.error('Failed to send to class:', error);
      setImageMessage('Failed to send. Please try again.');
      showToast('Failed to send content', 'error');
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
                <span className="status-pill session-pill" style={{backgroundColor: '#FF9500'}}>TEST MODE</span>
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
                onClick={() => {
                  setFlagFilter(prev => {
                    const newValue = prev === 'flagged' ? 'all' : 'flagged';
                    // When enabling "Flagged only", automatically hide names
                    if (newValue === 'flagged') {
                      setHideNames(true);
                    }
                    // When disabling "Flagged only", keep hideNames as is (don't change it)
                    return newValue;
                  });
                }}
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
            {isLoadingData && (
              <div className="loading-overlay">
                <div className="loading-spinner"></div>
                <p>Loading student data...</p>
              </div>
            )}
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
                  .filter(student => student && student.studentId)
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
        generateStrokeId={generateStrokeId}
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

export default TestTeacher;
