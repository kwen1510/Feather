import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Stage, Layer, Line, Image as KonvaImage } from 'react-konva';
import * as Ably from 'ably';
import { supabase } from '../supabaseClient';
import { Pen, Eraser, Undo, Redo, Trash2 } from 'lucide-react';
import { getOrCreateStudentId } from '../utils/identity';
import { saveStudentWork, loadStudentWork, cleanupOldSessions, clearSessionData } from '../utils/indexedDB';
import './StudentNew.css';

const BASE_CANVAS = { width: 800, height: 600 };
const MIN_SCALE = 0.65;
const MAX_SCALE = 2.2;
const STUDENT_PREFS_KEY = 'studentCanvasPrefs';
const PREFS_VERSION = 2; // Increment when adding new preferences

// Mobile detection utility
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.innerWidth <= 768;
};

// Component to display shared image as background
const SharedImageLayer = ({ sharedImage, canvasWidth, canvasHeight }) => {
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (!sharedImage) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    img.src = sharedImage.dataUrl;
    img.onload = () => {
      setImage(img);
    };
  }, [sharedImage]);

  if (!sharedImage || !image) return null;

  // Use actual loaded image dimensions for accurate scaling
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;

  // Prevent division by zero
  if (!imageWidth || !imageHeight || !canvasWidth || !canvasHeight) {
    return null;
  }

  // Calculate scaling to fit canvas while maintaining aspect ratio
  const imageAspect = imageWidth / imageHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  let displayWidth, displayHeight, x, y;

  if (imageAspect > canvasAspect) {
    // Image is wider than canvas - fit to width
    displayWidth = canvasWidth;
    displayHeight = canvasWidth / imageAspect;
    x = 0;
    y = (canvasHeight - displayHeight) / 2;
  } else {
    // Image is taller than canvas - fit to height
    displayHeight = canvasHeight;
    displayWidth = canvasHeight * imageAspect;
    x = (canvasWidth - displayWidth) / 2;
    y = 0;
  }

  // Ensure dimensions don't exceed canvas bounds
  displayWidth = Math.min(displayWidth, canvasWidth);
  displayHeight = Math.min(displayHeight, canvasHeight);

  return (
    <KonvaImage
      image={image}
      x={x}
      y={y}
      width={displayWidth}
      height={displayHeight}
      listening={false}
    />
  );
};

function Student() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomId = searchParams.get('room');
  const studentName = searchParams.get('name');

  const [channel, setChannel] = useState(null);

  const clientIdentityRef = useRef({ roomId: null, studentName: null, clientId: null });
  const [clientId, setClientId] = useState(null);
  const [studentId, setStudentId] = useState(null); // Persistent identity across refreshes

  const [isConnected, setIsConnected] = useState(false);

  const sessionInitRoomRef = useRef(null);

  // Supabase session tracking
  const [sessionId, setSessionId] = useState(null);
  const [participantId, setParticipantId] = useState(null);
  const [sessionStatus, setSessionStatus] = useState('loading'); // 'loading' | 'waiting' | 'active' | 'ended' | 'no-session'
  const [currentQuestionId, setCurrentQuestionId] = useState(null);

  // Student lines (editable, stored in base 800x600 coordinates)
  const [studentLines, setStudentLines] = useState([]);
  // Teacher lines (read-only overlay, assumed base coordinates)
  const [teacherLines, setTeacherLines] = useState([]);
  const [sharedImage, setSharedImage] = useState(null);

  // Drawing state
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('black');
  const [brushSize, setBrushSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [inputMode, setInputMode] = useState('stylus-only'); // 'all' or 'stylus-only'
  const [toolbarPosition, setToolbarPosition] = useState('left'); // 'left' or 'right'
  const [isMobile, setIsMobile] = useState(isMobileDevice());
  const visibilityListenerAttached = useRef(false);

  // Redirect to login if missing name or room - DO THIS FIRST before any initialization
  useEffect(() => {
    if (!roomId || !studentName) {
      navigate(`/student-login${roomId ? `?room=${roomId}` : ''}`);
    }
  }, [roomId, studentName, navigate]);

  // Generate clientId only when we have valid room and name
  useEffect(() => {
    if (!roomId || !studentName) return;

    const currentIdentity = clientIdentityRef.current;
    if (
      currentIdentity.clientId &&
      currentIdentity.roomId === roomId &&
      currentIdentity.studentName === studentName
    ) {
      setClientId(currentIdentity.clientId);
      return;
    }

    const randomPart1 = Math.random().toString(36).substring(2, 8);
    const randomPart2 = Math.random().toString(36).substring(2, 8);
    const timestamp = Date.now().toString(36).slice(-4);
    const uniqueId = `${randomPart1}${randomPart2}${timestamp}`;
    const generatedClientId = `student-${uniqueId}`;

    clientIdentityRef.current = { roomId, studentName, clientId: generatedClientId };
    setClientId(generatedClientId);
  }, [studentName, roomId]);

  // Initialize persistent studentId and cleanup old data
  useEffect(() => {
    const id = getOrCreateStudentId();
    setStudentId(id);

    // Cleanup old IndexedDB sessions (older than 7 days)
    cleanupOldSessions(7).catch(err => {
      console.error('Failed to cleanup old sessions:', err);
    });
  }, []);

  // Track previous sessionId to detect session changes
  const previousSessionIdRef = useRef(null);

  // Clear memory when switching to a different session
  useEffect(() => {
    if (!sessionId) return;

    const previousSessionId = previousSessionIdRef.current;

    // If we had a previous session and it's different from current, clear old data
    if (previousSessionId && previousSessionId !== sessionId) {
      console.log('🔄 Session changed from', previousSessionId, 'to', sessionId);
      console.log('🗑️ Clearing IndexedDB memory for old session:', previousSessionId);

      clearSessionData(previousSessionId)
        .then(() => {
          console.log('✅ IndexedDB memory cleared for old session');
        })
        .catch(err => {
          console.error('❌ Failed to clear old session data:', err);
        });
    }

    // Update the ref with current sessionId
    previousSessionIdRef.current = sessionId;
  }, [sessionId]);

  // Load saved preferences only when we have valid room and name
  useEffect(() => {
    if (!roomId || !studentName) return;
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STUDENT_PREFS_KEY);
      if (stored) {
        const prefs = JSON.parse(stored);
        if (prefs.version !== PREFS_VERSION) {
          localStorage.removeItem(STUDENT_PREFS_KEY);
          return;
        }
        if (prefs.tool) setTool(prefs.tool);
        if (prefs.color) setColor(prefs.color);
        if (typeof prefs.brushSize === 'number') setBrushSize(prefs.brushSize);
        if (prefs.inputMode) setInputMode(prefs.inputMode);
        if (prefs.toolbarPosition) setToolbarPosition(prefs.toolbarPosition);
      }
    } catch (error) {
      localStorage.removeItem(STUDENT_PREFS_KEY);
    }
  }, [roomId, studentName]);

  // Detect mobile device on mount and resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(isMobileDevice());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Set input mode to 'all' on mobile devices
  useEffect(() => {
    if (isMobile) {
      setInputMode('all');
      setBrushSize(3); // Fixed brush size for mobile
    }
  }, [isMobile]);

  useEffect(() => {
    if (!roomId || !studentName) return;
    if (typeof window === 'undefined') return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const prefs = { version: PREFS_VERSION, tool, color, brushSize, inputMode, toolbarPosition };
    localStorage.setItem(STUDENT_PREFS_KEY, JSON.stringify(prefs));
  }, [tool, color, brushSize, inputMode, toolbarPosition, roomId, studentName]);

  // Undo/redo stacks
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const isFirstRender = useRef(true);

  // Ref to always access latest studentLines in auto-save
  const studentLinesRef = useRef(studentLines);
  useEffect(() => {
    studentLinesRef.current = studentLines;
  }, [studentLines]);

  // Ref to always access latest teacherLines for saving
  const teacherLinesRef = useRef(teacherLines);
  useEffect(() => {
    teacherLinesRef.current = teacherLines;
  }, [teacherLines]);

  // Track last published line count for incremental updates
  const lastPublishedLineCountRef = useRef(0);

  const isRemoteUpdate = useRef(false);
  const eraserStateSaved = useRef(false);

  // Performance optimization: keep current line in ref to avoid re-renders
  const currentLineRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Prevent touch events and text selection ONLY on canvas area
  useEffect(() => {
    const canvasWrapper = canvasWrapperRef.current;
    if (!canvasWrapper) return;

    const preventTouch = (e) => {
      // Only prevent if the touch is on the canvas area, not on buttons
      const target = e.target;
      const isButton = target.closest('button') || target.closest('.student-toolbar') || target.closest('.student-topbar');

      if (!isButton) {
        e.preventDefault();
      }
    };

    const preventGesture = (e) => {
      e.preventDefault();
    };

    // Prevent text selection during drawing
    const preventSelection = (e) => {
      if (isDrawing) {
        e.preventDefault();
        return false;
      }
    };

    // Add listeners to canvas wrapper only, not entire document
    canvasWrapper.addEventListener('touchstart', preventTouch, { passive: false });
    canvasWrapper.addEventListener('touchmove', preventTouch, { passive: false });
    canvasWrapper.addEventListener('gesturestart', preventGesture, { passive: false });
    canvasWrapper.addEventListener('gesturechange', preventGesture, { passive: false });
    document.addEventListener('selectstart', preventSelection);

    return () => {
      if (canvasWrapper) {
        canvasWrapper.removeEventListener('touchstart', preventTouch);
        canvasWrapper.removeEventListener('touchmove', preventTouch);
        canvasWrapper.removeEventListener('gesturestart', preventGesture);
        canvasWrapper.removeEventListener('gesturechange', preventGesture);
      }
      document.removeEventListener('selectstart', preventSelection);
    };
  }, [isDrawing]);

  const canvasWrapperRef = useRef(null);
  const stageRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState(BASE_CANVAS);
  const canvasScale = useMemo(
    () => (BASE_CANVAS.width ? canvasSize.width / BASE_CANVAS.width : 1),
    [canvasSize.width]
  );

  // Refs to access latest canvas size and scale in Ably connection handlers
  const canvasSizeRef = useRef(canvasSize);
  const canvasScaleRef = useRef(canvasScale);
  useEffect(() => {
    canvasSizeRef.current = canvasSize;
    canvasScaleRef.current = canvasScale;
  }, [canvasSize, canvasScale]);

  // Validate session and create participant record
  useEffect(() => {
    if (!roomId || !studentName || !clientId) {
      return;
    }

    if (sessionInitRoomRef.current === roomId) {
      return;
    }

    sessionInitRoomRef.current = roomId;
    let cancelled = false;

    const initializeSession = async () => {
      try {

        // Check if session exists for this room (case-insensitive)
        const { data: sessions, error: sessionError } = await supabase
          .from('sessions')
          .select('*')
          .ilike('room_code', roomId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (sessionError) {
          console.error('Session query error:', sessionError);
          setSessionStatus('no-session');
          return;
        }

        if (!sessions || sessions.length === 0) {
          console.log('No session found for room code:', roomId);
          setSessionStatus('no-session');
          return;
        }

        const session = sessions[0];
        if (cancelled) return;

        // Check if the session has ended
        if (session.status === 'ended') {
          console.log('Session found but already ended');
          setSessionStatus('ended');
          setTimeout(() => navigate('/student-login'), 3000);
          return;
        }

        setSessionId(session.id);
        setSessionStatus(session.status === 'active' ? 'active' : 'waiting');

        // Check for existing participant by student_id (persistent) or client_id (legacy)
        const { data: existingParticipant } = await supabase
          .from('participants')
          .select('*')
          .eq('session_id', session.id)
          .or(`student_id.eq.${studentId},client_id.eq.${clientId}`)
          .maybeSingle();

        if (existingParticipant) {
          setParticipantId(existingParticipant.id);
          // Update client_id if it changed (after refresh)
          if (existingParticipant.client_id !== clientId) {
            await supabase
              .from('participants')
              .update({ client_id: clientId })
              .eq('id', existingParticipant.id);
            console.log('✅ Updated participant client_id after refresh');
          }
          return;
        }

        if (cancelled) return;

        const { data: participant, error: participantError } = await supabase
          .from('participants')
          .insert([
            {
              session_id: session.id,
              client_id: clientId,
              student_id: studentId,
              name: studentName,
              role: 'student',
            }
          ])
          .select()
          .single();

        if (participantError) {
          console.error('Failed to create participant:', participantError);
          return;
        }

        if (cancelled) return;
        setParticipantId(participant.id);

      } catch (error) {
        console.error('Error initializing session:', error);
        setSessionStatus('no-session');
        sessionInitRoomRef.current = null;
      }
    };

    initializeSession();
    return () => {
      cancelled = true;
    };
  }, [roomId, clientId, studentName]);

  // Initialize Ably connection
  useEffect(() => {
    if (!roomId || !studentName || !clientId) {
      return;
    }

    let ablyClient = null;
    let whiteboardChannel = null;
    let isActive = true;
    let hasInitiallyConnected = false;
    const channelSubscriptions = [];

    const initAbly = async () => {
      try {
        ablyClient = new Ably.Realtime({
          authUrl: '/api/token',
          authParams: { clientId },
        });

        ablyClient.connection.on('connected', async () => {
          if (!isActive) return;
          setIsConnected(true);

          // Handle reconnection after initial connection
          if (hasInitiallyConnected && whiteboardChannel) {
            console.log('🔄 Reconnected - re-entering presence and syncing state');
            try {
              // Re-enter presence
              await whiteboardChannel.presence.enter({
                name: studentName,
                studentId: studentId, // Include persistent studentId
                isVisible: !document.hidden
              });
              console.log('✅ Re-entered presence as:', studentName, 'with studentId:', studentId);

              // Load from IndexedDB if in-memory state is empty
              let linesToSend = studentLinesRef.current;
              if ((!linesToSend || linesToSend.length === 0) && studentId && sessionId && currentQuestionId) {
                console.log('🔄 In-memory state empty, loading from IndexedDB');
                const saved = await loadStudentWork(studentId, sessionId, currentQuestionId);
                if (saved?.lines) {
                  linesToSend = saved.lines;
                  setStudentLines(saved.lines);
                }
              }

              // Resend current drawing state if student has drawn anything
              if (linesToSend && linesToSend.length > 0) {
                console.log('🔄 Resending student drawing state:', linesToSend.length, 'lines');
                await whiteboardChannel.publish('student-layer', {
                  lines: linesToSend,
                  clientId,
                  name: studentName,
                  isFullUpdate: true,
                  meta: {
                    base: BASE_CANVAS,
                    display: canvasSizeRef.current,
                    scale: canvasScaleRef.current,
                  },
                });
                // Reset counter after sending full state
                lastPublishedLineCountRef.current = linesToSend.length;
                console.log('✅ Drawing state resent');
              } else {
                console.log('ℹ️ No drawing state to resend');
                lastPublishedLineCountRef.current = 0;
              }

              // Request current question state
              setTimeout(() => {
                if (!isActive) return;
                console.log('🔄 Requesting current question state');
                whiteboardChannel.publish('request-current-state', {
                  clientId: clientId,
                  timestamp: Date.now(),
                });

                // Also request teacher annotations sync to get latest
                console.log('🔄 Requesting teacher annotation sync');
                whiteboardChannel.publish('request-annotation-sync', {
                  clientId: clientId,
                  studentId: studentId, // Include persistent studentId
                  timestamp: Date.now(),
                });
              }, 500);
            } catch (error) {
              console.error('❌ Error during reconnection:', error);
            }
          } else {
            hasInitiallyConnected = true;
          }
        });

        ablyClient.connection.on('disconnected', () => {
          if (!isActive) return;
          setIsConnected(false);
        });

        whiteboardChannel = ablyClient.channels.get(`room-${roomId}`);

        const subscribe = (event, handler) => {
          whiteboardChannel.subscribe(event, handler);
          channelSubscriptions.push({ event, handler });
        };

        // Students ignore student-layer broadcasts to avoid echo
        subscribe('student-layer', () => {});

        // Listen for teacher annotations and filter by targetStudentId
        subscribe('teacher-annotation', (message) => {
          if (!isActive) return;
          console.log('📨 Received teacher-annotation event. Target:', message.data.targetStudentId, 'My clientId:', clientId, 'Match:', message.data.targetStudentId === clientId);

          if (message.data.targetStudentId === clientId) {
            const annotations = message.data.annotations || [];
            console.log('✅ ClientId matches! Applying', annotations.length, 'teacher annotation strokes');

            isRemoteUpdate.current = true;
            setTeacherLines(annotations);

            // Save teacher annotations to IndexedDB immediately (async, non-blocking)
            if (studentId && sessionId && currentQuestionId) {
              saveStudentWork(
                studentId,
                sessionId,
                currentQuestionId,
                studentLinesRef.current,
                {
                  base: BASE_CANVAS,
                  display: canvasSizeRef.current,
                  scale: canvasScaleRef.current,
                },
                annotations
              ).then(() => {
                console.log('💾 Saved teacher annotation to IndexedDB');
              }).catch(err => {
                console.error('❌ Failed to save teacher annotation to IndexedDB:', err);
              });
            }

            setTimeout(() => {
              isRemoteUpdate.current = false;
            }, 100);
          }
        });

        // Listen for teacher shared images
        subscribe('teacher-image', (message) => {
          if (!isActive) return;
          setSharedImage({
            dataUrl: message.data?.dataUrl,
            width: message.data?.width,
            height: message.data?.height,
            timestamp: message.data?.timestamp,
          });
        });

        // Listen for teacher templates
        subscribe('teacher-template', (message) => {
          if (!isActive) return;
          setSharedImage({
            dataUrl: message.data?.dataUrl,
            width: message.data?.width,
            height: message.data?.height,
            type: message.data?.type,
            timestamp: message.data?.timestamp,
          });
        });

        // Listen for teacher clear command
        subscribe('teacher-clear', () => {
          if (!isActive) return;
          setSharedImage(null);
        });

        // Listen for question state sync (when joining/rejoining)
        subscribe('sync-question-state', (message) => {
          if (!isActive) return;
          if (message.data.targetClientId === clientId) {
            const { content = null, questionId } = message.data;
            setSharedImage(content || null);
            if (questionId !== undefined) {
              setCurrentQuestionId(questionId || null);
            }
          }
        });

        // Listen for clear all drawings command (when teacher sends new content)
        subscribe('clear-all-drawings', (message) => {
          if (!isActive) return;

          if (message.data?.questionId) {
            setCurrentQuestionId(message.data.questionId);
          }

          isRemoteUpdate.current = true;
          setStudentLines([]);
          setTeacherLines([]);
          setTimeout(() => {
            isRemoteUpdate.current = false;
          }, 100);
        });

        // Listen for session started
        subscribe('session-started', () => {
          if (!isActive) return;
          setSessionStatus('active');
        });

        // Listen for session ended
        subscribe('session-ended', async () => {
          if (!isActive) return;
          console.log('🔚 Session ended - clearing IndexedDB memory for session:', sessionId);

          // Clear all data for this session from IndexedDB
          if (sessionId) {
            await clearSessionData(sessionId);
            console.log('✅ IndexedDB memory cleared for ended session');
          }

          setSessionStatus('ended');
          navigate('/student-login');
        });

        // Enter presence with student name and initial visibility status
        await whiteboardChannel.presence.enter({
          name: studentName,
          studentId: studentId, // Include persistent studentId
          isVisible: !document.hidden
        });

        if (!isActive) {
          await whiteboardChannel.presence.leaveClient(clientId);
          ablyClient.close();
          return;
        }

        setChannel(whiteboardChannel);

        // Request current question state after joining
        setTimeout(() => {
          if (!isActive) return;
          whiteboardChannel.publish('request-current-state', {
            clientId: clientId,
            timestamp: Date.now(),
          });

          // Also request teacher annotations sync
          whiteboardChannel.publish('request-annotation-sync', {
            clientId: clientId,
            studentId: studentId, // Include persistent studentId
            timestamp: Date.now(),
          });
        }, 1000);
      } catch (error) {
        console.error('Failed to initialize Ably:', error);
      }
    };

    initAbly();

    return () => {
      isActive = false;

      // Always cleanup on unmount (which only happens on actual page unload)
      if (whiteboardChannel) {
        channelSubscriptions.forEach(({ event, handler }) => {
          whiteboardChannel.unsubscribe(event, handler);
        });

        try {
          whiteboardChannel.presence.leaveClient(clientId);
        } catch (error) {
          console.error('Error leaving presence:', error);
        }
      }

      setChannel(null);

      if (ablyClient) {
        try {
          ablyClient.close();
        } catch (error) {
          console.error('Error closing Ably:', error);
        }
      }
    };
  }, [clientId, roomId, studentName, navigate, studentId, sessionId, currentQuestionId]);

  // Track tab visibility and notify teacher
  useEffect(() => {
    // Prevent duplicate listeners in React Strict Mode
    if (!channel || visibilityListenerAttached.current) return;

    visibilityListenerAttached.current = true;

    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;

      channel.presence.update({
        name: studentName,
        studentId: studentId, // Include persistent studentId
        isVisible: isVisible,
        lastVisibilityChange: Date.now()
      });

      channel.publish('student-visibility', {
        clientId: clientId,
        studentName: studentName,
        isVisible: isVisible,
        timestamp: Date.now()
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      visibilityListenerAttached.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [channel, clientId, studentName]);

  // Responsive canvas sizing (preserve 4:3 aspect)
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;

    const updateCanvasSize = () => {
      if (!canvasWrapperRef.current) return;
      const rect = canvasWrapperRef.current.getBoundingClientRect();

      // Use smaller padding on mobile for better space utilization
      const padding = isMobile ? 16 : 48;

      const availableWidth = Math.max(280, rect.width - padding);
      const availableHeight = Math.max(210, rect.height - padding);
      const widthScale = availableWidth / BASE_CANVAS.width;
      const heightScale = availableHeight / BASE_CANVAS.height;
      const rawScale = Math.min(widthScale, heightScale);

      // Allow smaller scaling on mobile (min 0.35 instead of 0.65)
      const minScale = isMobile ? 0.35 : MIN_SCALE;
      const clampedScale = Math.max(minScale, Math.min(MAX_SCALE, rawScale));
      const snappedScale = Math.round(clampedScale * 20) / 20; // increments of 0.05 for nice integers

      setCanvasSize({
        width: Math.round(BASE_CANVAS.width * snappedScale),
        height: Math.round(BASE_CANVAS.height * snappedScale),
      });
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    let resizeObserver;
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => updateCanvasSize());
      resizeObserver.observe(wrapper);
    }

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [toolbarPosition, isMobile]);

  // Sync student lines to Ably
  // Load saved work from IndexedDB when question changes
  useEffect(() => {
    if (!studentId || !sessionId || !currentQuestionId || !channel) return;

    const loadSavedWork = async () => {
      console.log('🔄 Checking IndexedDB memory for question:', currentQuestionId);

      // Capture current lines in case student already started drawing
      const currentLines = studentLinesRef.current || [];
      const hasDrawnWhileLoading = currentLines.length > 0;

      // Reset counter for new question (will be updated after merge)
      lastPublishedLineCountRef.current = 0;

      const saved = await loadStudentWork(studentId, sessionId, currentQuestionId);

      if (saved?.lines && saved.lines.length > 0) {
        console.log('📂 ✅ LOADED FROM INDEXEDDB MEMORY:', saved.lines.length, 'lines restored for question', currentQuestionId);

        // Merge: Keep saved lines + append any new lines drawn while loading
        let finalLines = saved.lines;
        if (hasDrawnWhileLoading) {
          console.log('🔀 Student drew', currentLines.length, 'new strokes while IndexedDB was loading - merging with saved', saved.lines.length, 'strokes');
          finalLines = [...saved.lines, ...currentLines];
          console.log('✅ Merged result:', finalLines.length, 'total strokes');
        }

        isRemoteUpdate.current = true;
        setStudentLines(finalLines);

        // Also restore teacher annotations if they exist
        if (saved.teacherAnnotations && saved.teacherAnnotations.length > 0) {
          console.log('👨‍🏫 Restored', saved.teacherAnnotations.length, 'teacher annotation strokes from IndexedDB');
          setTeacherLines(saved.teacherAnnotations);
        }

        // Save merged result to IndexedDB (especially if we merged new strokes)
        if (hasDrawnWhileLoading) {
          await saveStudentWork(
            studentId,
            sessionId,
            currentQuestionId,
            finalLines,
            saved.meta || {
              base: BASE_CANVAS,
              display: canvasSize,
              scale: canvasScale,
            },
            saved.teacherAnnotations || []
          );
          console.log('💾 Saved merged strokes (including new strokes drawn while loading) to IndexedDB');
        }

        // Immediately publish full merged state to teacher
        setTimeout(() => {
          channel.publish('student-layer', {
            lines: finalLines,
            clientId,
            name: studentName,
            isFullUpdate: true,
            meta: saved.meta || {
              base: BASE_CANVAS,
              display: canvasSize,
              scale: canvasScale,
            },
          });
          lastPublishedLineCountRef.current = finalLines.length;
          isRemoteUpdate.current = false;
          console.log('📤 Published', finalLines.length, 'strokes to teacher (', saved.lines.length, 'from IndexedDB +', currentLines.length, 'new)');
        }, 100);
      } else {
        console.log('ℹ️ No saved work found in IndexedDB memory for this question - starting fresh');

        // If student drew while loading (but no saved data), save those strokes now
        if (hasDrawnWhileLoading) {
          console.log('💾 Saving', currentLines.length, 'strokes drawn while IndexedDB was loading');
          await saveStudentWork(
            studentId,
            sessionId,
            currentQuestionId,
            currentLines,
            {
              base: BASE_CANVAS,
              display: canvasSize,
              scale: canvasScale,
            },
            [] // No teacher annotations yet
          );
          console.log('✅ New strokes saved to IndexedDB');
        }
      }
    };

    loadSavedWork();
  }, [studentId, sessionId, currentQuestionId, channel, clientId, studentName, canvasSize, canvasScale]);

  // Sync student lines to Ably and IndexedDB (per-stroke)
  useEffect(() => {
    if (!clientId || !channel || isRemoteUpdate.current) {
      return;
    }

    const timer = setTimeout(async () => {
      // Always save full state to IndexedDB
      if (studentId && sessionId && currentQuestionId) {
        const lineCount = studentLines.length;
        console.log('💾 Appending/Saving stroke to IndexedDB:', lineCount, 'total lines for question', currentQuestionId);
        await saveStudentWork(
          studentId,
          sessionId,
          currentQuestionId,
          studentLines,
          {
            base: BASE_CANVAS,
            display: canvasSize,
            scale: canvasScale,
          },
          teacherLinesRef.current // Include current teacher annotations
        );
        console.log('✅ Successfully saved to IndexedDB');
      }

      // Always broadcast full current state so teacher recovery is lossless
      channel.publish('student-layer', {
        lines: studentLines,
        clientId,
        name: studentName,
        isFullUpdate: true,
        meta: {
          base: BASE_CANVAS,
          display: canvasSize,
          scale: canvasScale,
        },
      });

      // Update last published count
      lastPublishedLineCountRef.current = studentLines.length;
    }, 150);

    return () => clearTimeout(timer);
  }, [studentLines, channel, clientId, canvasSize, canvasScale, studentName, studentId, sessionId, currentQuestionId]);


  // Auto-save student work to Supabase every 10 seconds
  useEffect(() => {
    if (!sessionId || !participantId || !currentQuestionId || sessionStatus !== 'active') {
      return;
    }

    const autoSave = async () => {
      try {
        // Check if annotation exists for this question and student
        const { data: existing, error: queryError } = await supabase
          .from('annotations')
          .select('id')
          .eq('question_id', currentQuestionId)
          .eq('participant_id', participantId)
          .maybeSingle(); // Use maybeSingle() instead of single() to avoid 406 error

        const annotationData = {
          session_id: sessionId,
          question_id: currentQuestionId,
          participant_id: participantId,
          student_lines: studentLinesRef.current, // Use ref to get latest lines
        };

        if (queryError) {
          console.error('Failed to query annotation:', queryError);
          return;
        }

        if (existing) {
          // Update existing annotation
          const { error: updateError } = await supabase
            .from('annotations')
            .update(annotationData)
            .eq('id', existing.id);

          if (updateError) {
            console.error('Failed to update annotation:', updateError);
          }
        } else {
          // Create new annotation
          const { error: insertError } = await supabase
            .from('annotations')
            .insert([annotationData]);

          if (insertError) {
            console.error('Failed to create annotation:', insertError);
          }
        }
      } catch (error) {
        console.error('Auto-save error:', error);
      }
    };

    // Save every 10 seconds (don't save immediately to avoid excessive saves)
    const interval = setInterval(autoSave, 10000);

    return () => clearInterval(interval);
  }, [sessionId, participantId, currentQuestionId, sessionStatus]); // Removed studentLines from deps

  // Separate effect to save immediately when question changes
  useEffect(() => {
    if (!sessionId || !participantId || !currentQuestionId || sessionStatus !== 'active') {
      return;
    }

    const saveOnQuestionChange = async () => {
      try {
        const { data: existing } = await supabase
          .from('annotations')
          .select('id')
          .eq('question_id', currentQuestionId)
          .eq('participant_id', participantId)
          .maybeSingle();

        const annotationData = {
          session_id: sessionId,
          question_id: currentQuestionId,
          participant_id: participantId,
          student_lines: studentLines,
        };

        if (existing) {
          await supabase
            .from('annotations')
            .update(annotationData)
            .eq('id', existing.id);
        } else {
          await supabase
            .from('annotations')
            .insert([annotationData]);
        }
      } catch (error) {
        console.error('Error saving on question change:', error);
      }
    };

    saveOnQuestionChange();
  }, [currentQuestionId]); // Only run when question changes

  const isAllowedPointerEvent = (evt) => {
    if (inputMode !== 'stylus-only') return true;
    return evt?.pointerType === 'pen';
  };

  const handlePointerDown = (e) => {
    const evt = e.evt;

    if (!isAllowedPointerEvent(evt)) {
      if (evt?.preventDefault) {
        evt.preventDefault();
      }
      return;
    }

    // Capture pointer for smooth tracking
    const stage = e.target.getStage();
    if (stage && evt.pointerId !== undefined) {
      const canvas = stage.content;
      if (canvas && canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(evt.pointerId);
        } catch (err) {
          // Ignore if pointer capture fails
        }
      }
    }

    if (tool === 'pen') {
      setIsDrawing(true);
      const pos = stage.getPointerPosition();
      const baseX = pos.x / canvasScale;
      const baseY = pos.y / canvasScale;
      const newLine = {
        tool,
        points: [baseX, baseY],
        color,
        strokeWidth: brushSize / canvasScale,
      };

      // Store in ref for smooth drawing
      currentLineRef.current = newLine;

      undoStack.current.push([...studentLines]);
      redoStack.current = [];

      // Immediately add the line to state
      setStudentLines([...studentLines, newLine]);
    } else if (tool === 'eraser') {
      setIsDrawing(true);
      eraserStateSaved.current = false;
    }

    if (evt.preventDefault) {
      evt.preventDefault();
    }
    if (evt.stopPropagation) {
      evt.stopPropagation();
    }
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;

    const evt = e.evt;
    if (!isAllowedPointerEvent(evt)) {
      if (evt?.preventDefault) {
        evt.preventDefault();
      }
      return;
    }

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    if (tool === 'pen') {
      // Update the ref immediately for smooth drawing
      if (currentLineRef.current) {
        const baseX = point.x / canvasScale;
        const baseY = point.y / canvasScale;
        currentLineRef.current.points = currentLineRef.current.points.concat([baseX, baseY]);

        // Capture line in local variable before async operation
        const lineToUpdate = currentLineRef.current;

        // Cancel any pending animation frame
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        // Batch update using requestAnimationFrame for smooth rendering
        animationFrameRef.current = requestAnimationFrame(() => {
          if (lineToUpdate) {
            setStudentLines(prev => {
              // Make sure we're updating the last line
              if (prev.length > 0) {
                return [...prev.slice(0, -1), lineToUpdate];
              }
              return prev;
            });
          }
        });
      }
    } else if (tool === 'eraser') {
      const previousLength = studentLines.length;
      const pointerX = point.x;
      const pointerY = point.y;
      const eraserRadius = 20;

      const linesToKeep = studentLines.filter((line) => {
        for (let i = 0; i < line.points.length; i += 2) {
          const x = line.points[i] * canvasScale;
          const y = line.points[i + 1] * canvasScale;
          const distance = Math.sqrt(Math.pow(x - pointerX, 2) + Math.pow(y - pointerY, 2));
          if (distance < eraserRadius) {
            return false;
          }
        }
        return true;
      });

      if (linesToKeep.length < previousLength && !eraserStateSaved.current) {
        undoStack.current.push([...studentLines]);
        redoStack.current = [];
        eraserStateSaved.current = true;
      }

      setStudentLines(linesToKeep);
    }

    if (evt?.preventDefault) {
      evt.preventDefault();
    }
    if (evt?.stopPropagation) {
      evt.stopPropagation();
    }
  };

  const handlePointerUp = (e) => {
    const evt = e?.evt;
    if (!isAllowedPointerEvent(evt)) {
      if (evt?.preventDefault) {
        evt.preventDefault();
      }
      return;
    }
    setIsDrawing(false);
    currentLineRef.current = null; // Clear the current line ref
  };

  const handleUndo = () => {
    if (undoStack.current.length > 0) {
      const previousState = undoStack.current.pop();
      redoStack.current.push([...studentLines]);
      setStudentLines(previousState);
    }
  };

  const handleRedo = () => {
    if (redoStack.current.length > 0) {
      const nextState = redoStack.current.pop();
      undoStack.current.push([...studentLines]);
      setStudentLines(nextState);
    }
  };

  const handleClear = async () => {
    undoStack.current.push([...studentLines]);
    redoStack.current = [];
    setStudentLines([]);

    if (channel) {
      await channel.publish('student-layer', {
        lines: [],
        clientId,
        name: studentName,
        meta: {
          base: BASE_CANVAS,
          display: canvasSize,
          scale: canvasScale,
        },
      });
    }
  };

  const getShortClientId = () => {
    if (!clientId) {
      return '---';
    }
    return clientId.split('-')[1]?.substring(0, 3) || clientId;
  };

  const toggleInputMode = () => {
    setInputMode((prev) => (prev === 'stylus-only' ? 'all' : 'stylus-only'));
  };

  const toggleToolbarPosition = () => {
    setToolbarPosition((prev) => (prev === 'left' ? 'right' : 'left'));
  };


  const formatClientLabel = () => {
    const displayName = studentName && studentName !== 'Anonymous' ? studentName : getShortClientId();
    return `Connected as ${displayName}`;
  };
  const connectionLabel = isConnected ? 'Connected' : 'Reconnecting…';
  const connectionStateClass = isConnected ? 'online' : 'offline';

  const projectPointsForDisplay = (points) =>
    points.map((value, idx) => value * canvasScale);

  const projectStrokeWidth = (line) => (line.strokeWidth || 3) * canvasScale;

  // Don't render anything if redirecting to login
  if (!roomId || !studentName) {
    return null;
  }

  return (
    <div className="student-canvas-page">
      {/* Session status overlays */}
      {sessionStatus === 'loading' && (
        <div className="session-overlay">
          <div className="session-message">
            <div className="session-spinner"></div>
            <h2>Connecting to session...</h2>
            <p>Please wait while we verify your session</p>
          </div>
        </div>
      )}

      {sessionStatus === 'waiting' && (
        <div className="session-overlay">
          <div className="session-message">
            <div className="session-icon waiting">⏳</div>
            <h2>Waiting for teacher</h2>
            <p>Your teacher hasn't started the session yet. Please wait...</p>
          </div>
        </div>
      )}

      {sessionStatus === 'no-session' && (
        <div className="session-overlay">
          <div className="session-message">
            <div className="session-icon waiting">🔍</div>
            <h2>No session found</h2>
            <p>There is no active session for room code "{roomId}".</p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              Please make sure your teacher has started a session, or verify the room code is correct.
            </p>
            <button
              onClick={() => navigate('/student-login')}
              style={{
                marginTop: '1.5rem',
                padding: '0.75rem 1.5rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
            >
              Back to Login
            </button>
          </div>
        </div>
      )}

      {sessionStatus === 'ended' && (
        <div className="session-overlay">
          <div className="session-message">
            <div className="session-icon ended">✓</div>
            <h2>Session ended</h2>
            <p>Thank you for participating! The teacher has ended this session.</p>
            <p style={{ marginTop: '1rem', fontSize: '0.9rem', opacity: 0.8 }}>
              Redirecting to login...
            </p>
          </div>
        </div>
      )}

      <div className="student-canvas-container">
        <div className="student-status-bar">
          <div className="student-status-text">
            <h1>
              Student Canvas
              {roomId && (
                <span style={{
                  marginLeft: '0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: '400',
                  color: 'rgba(0, 0, 0, 0.4)',
                  letterSpacing: '0.5px'
                }}>
                  Session: {roomId}
                </span>
              )}
            </h1>
            <p>{formatClientLabel()}</p>
          </div>
          <div className="student-status-actions">
            {!isMobile && (
              <>
                <div className="tool-status-indicator">
                  <span className="tool-status-text">
                    <i className={tool === 'pen' ? 'pi pi-pencil' : 'pi pi-eraser'}></i> {inputMode === 'all' ? 'All inputs' : 'Stylus only'}
                  </span>
                </div>
                <div className={`connection-pill ${connectionStateClass}`} aria-live="polite">
                  <span className="connection-indicator-dot" />
                  <span>{connectionLabel}</span>
                </div>
                <button className="move-toolbar-btn" onClick={toggleToolbarPosition}>
                  Move toolbar to {toolbarPosition === 'left' ? 'right' : 'left'}
                </button>
              </>
            )}
            {isMobile && (
              <div className={`connection-pill ${connectionStateClass}`} aria-live="polite">
                <span className="connection-indicator-dot" />
                <span>{connectionLabel}</span>
              </div>
            )}
          </div>
        </div>

        <div className={`student-workspace ${toolbarPosition === 'right' ? 'toolbar-right' : ''} ${isMobile ? 'mobile-view' : ''}`}>
          {/* Mobile Toolbar - Compact horizontal layout */}
          {isMobile ? (
            <div className="mobile-toolbar">
              {/* Horizontal color buttons */}
              <div className="mobile-colors">
                <button
                  onClick={() => setColor('black')}
                  className={`mobile-color-button ${color === 'black' ? 'active' : ''}`}
                  style={{ background: 'black' }}
                  aria-label="Black"
                />
                <button
                  onClick={() => setColor('#0066FF')}
                  className={`mobile-color-button ${color === '#0066FF' ? 'active' : ''}`}
                  style={{ background: '#0066FF' }}
                  aria-label="Blue"
                />
                <button
                  onClick={() => setColor('#00AA00')}
                  className={`mobile-color-button ${color === '#00AA00' ? 'active' : ''}`}
                  style={{ background: '#00AA00' }}
                  aria-label="Green"
                />
              </div>

              {/* Tool and action buttons */}
              <div className="mobile-tools">
                <button
                  onClick={() => setTool('pen')}
                  className={`mobile-tool-button ${tool === 'pen' ? 'active' : ''}`}
                  aria-label="Pen"
                >
                  <Pen size={20} />
                </button>
                <button
                  onClick={() => setTool('eraser')}
                  className={`mobile-tool-button ${tool === 'eraser' ? 'active' : ''}`}
                  aria-label="Eraser"
                >
                  <Eraser size={20} />
                </button>
                <button
                  onClick={handleUndo}
                  className="mobile-tool-button"
                  disabled={undoStack.current.length === 0}
                  aria-label="Undo"
                >
                  <Undo size={20} />
                </button>
                <button
                  onClick={handleRedo}
                  className="mobile-tool-button"
                  disabled={redoStack.current.length === 0}
                  aria-label="Redo"
                >
                  <Redo size={20} />
                </button>
                <button
                  onClick={handleClear}
                  className="mobile-tool-button danger"
                  aria-label="Clear"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ) : (
            /* Desktop Sidebar - Vertical layout */
            <div className="student-sidebar">
            {/* Colors */}
            <div className="sidebar-section">
              <h3 className="sidebar-label">COLORS</h3>
              <div className="color-buttons">
                <button
                  onClick={() => setColor('black')}
                  className={`color-button ${color === 'black' ? 'active' : ''}`}
                  style={{ background: 'black' }}
                  aria-label="Black"
                />
                <button
                  onClick={() => setColor('#0066FF')}
                  className={`color-button ${color === '#0066FF' ? 'active' : ''}`}
                  style={{ background: '#0066FF' }}
                  aria-label="Blue"
                />
                <button
                  onClick={() => setColor('#00AA00')}
                  className={`color-button ${color === '#00AA00' ? 'active' : ''}`}
                  style={{ background: '#00AA00' }}
                  aria-label="Green"
                />
              </div>
            </div>

            {/* Tools */}
            <div className="sidebar-section">
              <h3 className="sidebar-label">TOOLS</h3>
              <div className="tool-buttons tool-icon-buttons">
                <button
                  onClick={() => setTool('pen')}
                  className={`tool-icon-button ${tool === 'pen' ? 'active' : ''}`}
                  title="Pen"
                >
                  <i className="pi pi-pencil tool-icon"></i>
                  <span className="tool-label">Pen</span>
                </button>
                <button
                  onClick={() => setTool('eraser')}
                  className={`tool-icon-button ${tool === 'eraser' ? 'active' : ''}`}
                  title="Eraser"
                >
                  <i className="pi pi-eraser tool-icon"></i>
                  <span className="tool-label">Eraser</span>
                </button>
              </div>
            </div>

            {/* Brush Size */}
            <div className="sidebar-section">
              <h3 className="sidebar-label">BRUSH SIZE</h3>
              <div className="brush-size-control">
                <div className="brush-slider-container">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="brush-slider"
                  />
                  <span className="brush-value">{brushSize}</span>
                </div>
              </div>
            </div>
          {/* Input Mode */}
          <div className="sidebar-section">
            <h3 className="sidebar-label">INPUT MODE</h3>
            <button
              className={`input-mode-toggle ${inputMode === 'all' ? 'all-inputs' : ''}`}
              onClick={toggleInputMode}
            >
              {inputMode === 'stylus-only' ? 'Stylus mode (pen only)' : 'All inputs'}
            </button>
          </div>

          {/* History */}
          <div className="sidebar-section">
            <h3 className="sidebar-label">HISTORY</h3>
            <div className="history-buttons">
              <button
                onClick={handleUndo}
                className="history-button"
                disabled={undoStack.current.length === 0}
              >
                Undo
              </button>
              <button
                onClick={handleRedo}
                className="history-button"
                disabled={redoStack.current.length === 0}
              >
                Redo
              </button>
              <button onClick={handleClear} className="history-button danger">
                Clear
              </button>
            </div>
          </div>
          </div>
          )}

          {/* Canvas */}
          <div className="student-canvas-panel" ref={canvasWrapperRef}>
            <div className="student-canvas-frame">
              <div
                className="student-canvas-surface"
                style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}
              >
                <Stage
                  ref={stageRef}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onTouchStart={(e) => { e.evt?.preventDefault?.(); }}
                  onTouchMove={(e) => { e.evt?.preventDefault?.(); }}
                  onTouchEnd={(e) => { e.evt?.preventDefault?.(); }}
                  className="canvas-stage"
                  style={{ touchAction: 'none' }}
                  perfectDrawEnabled={false}
                  >
                    {/* Shared image layer (background) */}
                    <Layer listening={false}>
                      <SharedImageLayer
                        sharedImage={sharedImage}
                        canvasWidth={canvasSize.width}
                        canvasHeight={canvasSize.height}
                      />
                    </Layer>

                    {/* Student layer (editable) */}
                    <Layer>
                      {studentLines.map((line, i) => (
                        <Line
                        key={`student-${i}`}
                        points={projectPointsForDisplay(line.points)}
                        stroke={line.color}
                        strokeWidth={projectStrokeWidth(line)}
                        tension={0.5}
                        lineCap="round"
                        lineJoin="round"
                      />
                    ))}
                  </Layer>

                  {/* Teacher layer (read-only overlay) */}
                  <Layer listening={false}>
                    {teacherLines.map((line, i) => (
                      <Line
                        key={`teacher-${i}`}
                        points={projectPointsForDisplay(line.points)}
                        stroke={line.color}
                        strokeWidth={projectStrokeWidth(line)}
                        tension={0.5}
                        lineCap="round"
                        lineJoin="round"
                      />
                    ))}
                  </Layer>
                </Stage>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Student;
