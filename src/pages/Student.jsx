import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import * as Ably from 'ably';
import { supabase } from '../supabaseClient';
import { getOrCreateStudentId } from '../utils/identity';
import StudentStatusBar from '../components/student/StudentStatusBar';
import StudentToolbar from '../components/student/StudentToolbar';
import StudentCanvas from '../components/student/StudentCanvas';
import SessionStatusOverlay from '../components/student/SessionStatusOverlay';
import {
  initDB,
  saveStroke as saveStrokeToIndexedDB,
  loadStrokes as loadStrokesFromIndexedDB,
  clearStrokes as clearStrokesFromIndexedDB,
  validateSession,
  replaceAllStrokes as replaceAllStrokesInIndexedDB
} from '../utils/indexedDB';
import './StudentNew.css';

// Generate unique stroke ID
const generateStrokeId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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

function Student() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomId = searchParams.get('room');
  const studentName = searchParams.get('name');

  const [broadcastChannel, setBroadcastChannel] = useState(null); // Broadcast channel: {roomId}-broadcast (teacher publishes, all students subscribe)
  const [individualChannel, setIndividualChannel] = useState(null); // Individual channel: {roomId}-{studentId} (bidirectional)

  const clientIdentityRef = useRef({ roomId: null, studentName: null, clientId: null });
  const [clientId, setClientId] = useState(null);
  const [studentId] = useState(() => getOrCreateStudentId()); // Initialize synchronously on first render

  const [isConnected, setIsConnected] = useState(false);

  const sessionInitRoomRef = useRef(null);

  // Supabase session tracking (validation only)
  const [sessionId, setSessionId] = useState(null);
  const [sessionStatus, setSessionStatus] = useState('loading'); // 'loading' | 'waiting' | 'active' | 'ended' | 'no-session'

  // Student lines (editable, stored in base 800x600 coordinates)
  const [studentLines, setStudentLines] = useState([]);
  // Teacher lines (read-only overlay, assumed base coordinates)
  const [teacherLines, setTeacherLines] = useState([]);
  const [sharedImage, setSharedImage] = useState(null);
  const sharedImageRef = useRef(null); // Ref to access latest sharedImage in callbacks

  // Drawing state
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('black');
  const [brushSize, setBrushSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [inputMode, setInputMode] = useState('stylus-only'); // 'all' or 'stylus-only'
  const [toolbarPosition, setToolbarPosition] = useState('left'); // 'left' or 'right'
  const [isMobile, setIsMobile] = useState(isMobileDevice());
  const visibilityListenerAttached = useRef(false);
  const [isLoadingData, setIsLoadingData] = useState(false); // Loading state during page refresh

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
  }, [roomId]);

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

  // Detect mobile device on mount and resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(isMobileDevice());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Set fixed brush size for mobile devices
  useEffect(() => {
    if (isMobile) {
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

  // Refs for remote updates and state management
  const isRemoteUpdate = useRef(false);
  const eraserStateSaved = useRef(false);

  // Ref to always access latest studentLines
  const studentLinesRef = useRef(studentLines);
  useEffect(() => {
    studentLinesRef.current = studentLines;
  }, [studentLines]);

  // Ref to always access latest teacherLines
  const teacherLinesRef = useRef(teacherLines);
  useEffect(() => {
    teacherLinesRef.current = teacherLines;
  }, [teacherLines]);

  // Canvas refs and state - MUST be declared before effects that use them
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

  // Performance optimization: keep current line in ref to avoid re-renders
  const currentLineRef = useRef(null);
  const animationFrameRef = useRef(null);

  // NOTE: Real-time publishing removed to reduce message count
  // Publishing now happens only when stroke completes (in handlePointerUp)
  // This reduces messages from ~30 per stroke to 1 per stroke

  // Redis auto-save removed - now using IndexedDB + Ably recovery only

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

  // Validate session (check if session exists before allowing login)
  useEffect(() => {
    if (!roomId || !studentName || !clientId) {
      return;
    }

    if (sessionInitRoomRef.current === roomId) {
      return;
    }

    sessionInitRoomRef.current = roomId;
    let cancelled = false;

    const validateSession = async () => {
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

      } catch (error) {
        console.error('Error validating session:', error);
        setSessionStatus('no-session');
        sessionInitRoomRef.current = null;
      }
    };

    validateSession();
    return () => {
      cancelled = true;
    };
  }, [roomId, clientId, studentName, navigate]);

  // Initialize Ably connection - wait for studentId to be ready
  useEffect(() => {
    if (!roomId || !studentName || !clientId || !studentId) {
      return;
    }

    let ablyClient = null;
    let whiteboardChannel = null;
    let isActive = true;
    let hasInitiallyConnected = false;
    const channelSubscriptions = [];

    const initAbly = async () => {
      try {
        // 0) Page loads - initialise indexdb
        console.log('0️⃣ Page loads - Initializing IndexedDB...');
        await initDB();
        console.log('✅ IndexedDB initialized successfully');

        ablyClient = new Ably.Realtime({
          authUrl: '/api/token',
          authParams: { clientId },
        });

        ablyClient.connection.on('connected', async () => {
          if (!isActive) return;
          setIsConnected(true);
          console.log('✅ Student connected to Ably');

          // Handle reconnection after initial connection
          // On reconnect, whiteboardChannel already exists from first connection
          if (hasInitiallyConnected && whiteboardChannel) {
            console.log('🔄 Reconnected - re-entering presence and syncing state');
            try {
            // Re-enter presence on broadcast channel
            await whiteboardChannel.presence.enter({
              name: studentName || 'Anonymous',
              studentId: studentId || ''
            });
            console.log('✅ Re-entered presence as:', studentName || 'Anonymous', 'with studentId:', studentId || '');

            // Get individual channel reference (should exist from initial connection)
            const individualChannelRef = ablyClient.channels.get(`${roomId}-${studentId}`);

            // Request current question state + annotations (sent on individual channel)
            setTimeout(() => {
              if (!isActive) return;
              console.log('🔄 Requesting full state (question + annotations)');
              individualChannelRef.publish('request-current-state', {
                clientId: clientId || '',
                studentId: studentId || '',
                timestamp: Date.now(),
              });
            }, 300);

            // Re-publish current strokes to teacher after reconnection (sent on individual channel)
            setTimeout(() => {
              if (!isActive) return;
              const currentStrokes = studentLinesRef.current;
              if (currentStrokes && currentStrokes.length > 0) {
                console.log('🔄 Re-emitting', currentStrokes.length, 'strokes to teacher after reconnection...');
                individualChannelRef.publish('student-layer', {
                  lines: currentStrokes,
                  studentId: studentId || '',
                  clientId: clientId || '',
                  meta: {
                    display: canvasSizeRef.current,
                    scale: canvasScaleRef.current,
                  },
                });
                console.log('📤 Re-published strokes to teacher after reconnection');
              }
            }, 400);
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

        // Create broadcast + individual channels
        const broadcastCh = ablyClient.channels.get(`${roomId}-broadcast`);
        const individualCh = ablyClient.channels.get(`${roomId}-${studentId}`);

        whiteboardChannel = broadcastCh; // Keep reference for cleanup (presence is on broadcast channel)

        // Helper to subscribe to broadcast channel
        const subscribeBroadcast = (event, handler) => {
          broadcastCh.subscribe(event, handler);
          channelSubscriptions.push({ channel: broadcastCh, event, handler });
        };

        // Helper to subscribe to individual channel
        const subscribeIndividual = (event, handler) => {
          individualCh.subscribe(event, handler);
          channelSubscriptions.push({ channel: individualCh, event, handler });
        };

        // Listen for teacher annotations (individual channel - no filtering needed, only this student receives)
        subscribeIndividual('teacher-annotation', (message) => {
          if (!isActive) return;
          const annotations = message.data.annotations || [];
          console.log('📨 Received teacher annotation:', annotations.length, 'strokes');

          isRemoteUpdate.current = true;
          setTeacherLines(annotations);

          setTimeout(() => {
            isRemoteUpdate.current = false;
          }, 100);
        });

        // Listen for full state sync (individual channel - targeted to this student only)
        subscribeIndividual('sync-full-state', (message) => {
          if (!isActive) return;
          const { content = null, annotations = [] } = message.data;

          console.log('📨 Received sync-full-state:', {
            hasContent: !!content,
            annotationCount: annotations.length
          });

          setSharedImage(content || null);

          // Apply teacher annotations immediately
          if (annotations.length > 0) {
            console.log('✅ Applying', annotations.length, 'teacher annotations from sync');
            isRemoteUpdate.current = true;
            setTeacherLines(annotations);

            setTimeout(() => {
              isRemoteUpdate.current = false;
            }, 100);
          }
        });

        // Listen for clear all drawings command (broadcast channel - all students receive)
        subscribeBroadcast('clear-all-drawings', (message) => {
          if (!isActive) return;

          console.log('📨 Received clear-all-drawings with content:', message.data);

          // Update shared image/content if provided
          if (message.data?.content) {
            setSharedImage(message.data.content);
          } else {
            setSharedImage(null); // Clear for blank canvas
          }

          // Clear all strokes
          isRemoteUpdate.current = true;
          setStudentLines([]);
          setTeacherLines([]);
          setTimeout(() => {
            isRemoteUpdate.current = false;
          }, 100);

          // Clear IndexedDB for student's own strokes
          clearStrokesFromIndexedDB(roomId, studentId, 'student').then(() => {
            console.log('🗑️ Cleared student strokes from IndexedDB');
          }).catch(error => {
            console.error('Error clearing IndexedDB:', error);
          });
        });

        // Listen for session started
        subscribeBroadcast('session-started', () => {
          if (!isActive) return;
          setSessionStatus('active');
        });

        // Listen for session ended
        subscribeBroadcast('session-ended', () => {
          if (!isActive) return;
          console.log('🔚 Session ended');

          setSessionStatus('ended');
          navigate('/student-login');
        });

        // Listen for teacher annotation recovery response (when student requests after refresh)
        subscribeIndividual('response-teacher-annotations', (message) => {
          if (!isActive) return;
          if (message.data.targetStudentId === studentId || message.data.targetClientId === clientId) {
            const annotations = message.data.annotations || [];
            console.log(`📨 Received ${annotations.length} teacher annotations from recovery request`);

            if (annotations.length > 0) {
              isRemoteUpdate.current = true;
              setTeacherLines(annotations);
              setTimeout(() => {
                isRemoteUpdate.current = false;
              }, 100);
            }
          }
        });

        // Listen for teacher request for student strokes (after teacher reconnects) - broadcast channel
        subscribeBroadcast('request-student-strokes', async (message) => {
          if (!isActive) return;
          console.log('📨 Teacher requested student strokes - loading from IndexedDB');

          try {
            // Load own strokes from IndexedDB
            const ownStrokes = await loadStrokesFromIndexedDB(roomId, studentId, 'student');
            console.log(`📤 Sending ${ownStrokes.length} strokes to teacher`);

            // Send strokes back to teacher on individual channel
            setTimeout(() => {
              if (individualCh && individualCh.state === 'attached') {
                individualCh.publish('response-student-strokes', {
                  studentId: studentId,
                  studentName: studentName,
                  strokes: ownStrokes,
                  timestamp: Date.now(),
                });
                console.log(`✅ Sent ${ownStrokes.length} strokes to teacher`);
              }
            }, 200);
          } catch (error) {
            console.error('❌ Error loading strokes from IndexedDB:', error);
          }
        });

        // Enter presence on broadcast channel (teacher monitors presence here)
        await broadcastCh.presence.enter({
          name: studentName || 'Anonymous',
          studentId: studentId || ''
        });

        if (!isActive) {
          await broadcastCh.presence.leaveClient(clientId);
          ablyClient.close();
          return;
        }

        setBroadcastChannel(broadcastCh);
        setIndividualChannel(individualCh);

        // Request current state (content + annotations) - publish to individual channel
        setTimeout(() => {
          if (!isActive) return;
          individualCh.publish('request-current-state', {
            clientId: clientId || '',
            studentId: studentId || '',
            timestamp: Date.now(),
          });
        }, 500);

        // Load strokes ONLY on page refresh (IndexedDB for own, Redis for teacher annotations)
        // Use sessionStorage flag to reliably detect refresh
        const hasLoadedBefore = sessionStorage.getItem('feather_page_loaded');
        const navEntry = performance.getEntriesByType('navigation')[0];
        const isPageRefresh = hasLoadedBefore === 'true' ||
                             navEntry?.type === 'reload' ||
                             performance.navigation?.type === 1;

        // Mark that page has been loaded
        sessionStorage.setItem('feather_page_loaded', 'true');

        console.log('🔍 Page load detection:', {
          hasLoadedBefore,
          navType: navEntry?.type,
          isPageRefresh,
        });

        if (isPageRefresh) {
          // Set loading state
          setIsLoadingData(true);

          setTimeout(async () => {
            if (!isActive) return;

            try {
              // 2) When i reload the page, initialise index db and validate session
              console.log('2️⃣ Page refresh detected - Re-initializing IndexedDB...');
              await initDB();
              console.log('✅ IndexedDB re-initialized on reload');

              // Validate session - clear if changed
              console.log('🔍 Validating session ID...');
              const isValidSession = await validateSession(roomId, studentId, 'student', sessionId);

              if (!isValidSession) {
                console.log('⚠️ Session changed - IndexedDB was cleared, starting fresh');
                setIsLoadingData(false); // Clear loading state
                // Don't load strokes, they were cleared
              } else {
                // 3) indexDB strokes loaded
                console.log('3️⃣ Loading strokes from IndexedDB...');
                const ownStrokes = await loadStrokesFromIndexedDB(roomId, studentId, 'student');
                if (ownStrokes && ownStrokes.length > 0) {
                  console.log(`✅ IndexedDB strokes loaded: ${ownStrokes.length} strokes`);
                  isRemoteUpdate.current = true;
                  setStudentLines(ownStrokes);
                  setTimeout(() => {
                    isRemoteUpdate.current = false;
                  }, 100);
                  
                  // 4) Explicitly publish loaded strokes to teacher (rejoin after refresh) - on individual channel
                  setTimeout(() => {
                    if (individualCh && isActive) {
                      console.log('4️⃣ Re-emitting strokes to teacher after refresh...');
                      individualCh.publish('student-layer', {
                        lines: ownStrokes,
                        studentId,
                        clientId,
                        meta: {
                          display: canvasSizeRef.current,
                          scale: canvasScaleRef.current,
                        },
                      });
                      console.log(`📤 Re-published ${ownStrokes.length} strokes to teacher after rejoin`);

                      // Clear loading state after publishing
                      setIsLoadingData(false);
                    }
                  }, 200); // After isRemoteUpdate is reset
                } else {
                  console.log('ℹ️ No strokes found in IndexedDB');
                  setIsLoadingData(false); // Clear loading state
                }
              }

              // Request teacher annotations via Ably (teacher will load from IndexedDB and respond) - on individual channel
              console.log('📤 Requesting teacher annotations via Ably...');
              if (individualCh && isActive) {
                individualCh.publish('request-teacher-annotations', {
                  studentId: studentId,
                  clientId: clientId,
                  timestamp: Date.now(),
                });
                console.log('✅ Sent request for teacher annotations');
              }
            } catch (error) {
              console.error('Error loading strokes on refresh:', error);
              setIsLoadingData(false); // Clear loading state on error
            }
          }, 700); // Slightly after requesting current state
        } else {
          console.log('ℹ️ Normal page load - skipping persistence restore');
        }
      } catch (error) {
        console.error('Failed to initialize Ably:', error);
      }
    };

    initAbly();

    return () => {
      isActive = false;

      // Always cleanup on unmount (which only happens on actual page unload)
      // Unsubscribe from all channel events
      channelSubscriptions.forEach(({ channel, event, handler }) => {
        try {
          channel.unsubscribe(event, handler);
        } catch (error) {
          console.error('Error unsubscribing:', error);
        }
      });

      // Leave presence on broadcast channel
      if (whiteboardChannel) {
        try {
          whiteboardChannel.presence.leaveClient(clientId);
        } catch (error) {
          console.error('Error leaving presence:', error);
        }
      }

      setBroadcastChannel(null);
      setIndividualChannel(null);

      if (ablyClient) {
        try {
          ablyClient.close();
        } catch (error) {
          console.error('Error closing Ably:', error);
        }
      }
    };
  }, [clientId, roomId, studentName, navigate, studentId]); // Removed sessionId and currentQuestionId to prevent reconnects

  // Track tab visibility and notify teacher (publish to individual channel)
  useEffect(() => {
    if (!individualChannel || visibilityListenerAttached.current) return;

    visibilityListenerAttached.current = true;

    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;

      // Publish visibility change to individual channel (only teacher receives)
      individualChannel.publish('student-visibility', {
        studentId: studentId || '',
        studentName: studentName || 'Anonymous',
        isVisible: isVisible,
        timestamp: Date.now()
      });

      console.log(`👁️ Published visibility change: ${isVisible ? 'visible' : 'hidden'}`);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      visibilityListenerAttached.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [individualChannel, studentId, studentName]);

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
        strokeId: generateStrokeId(), // Add unique stroke ID
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
    
    const wasPen = tool === 'pen';
    const wasEraser = tool === 'eraser' && eraserStateSaved.current;
    
    setIsDrawing(false);

    // Save the stroke to IndexedDB and publish to Ably when complete
    if (wasPen && currentLineRef.current && currentLineRef.current.strokeId) {
      const strokeToSave = currentLineRef.current;
      setTimeout(async () => {
        try {
          // 1) When i draw a stroke, store in indexdb
          console.log('1️⃣ Drawing finished - Storing stroke in IndexedDB...');
          await saveStrokeToIndexedDB(strokeToSave, roomId, studentId, 'student', sessionId);
          console.log('✅ Stroke saved to IndexedDB:', strokeToSave.strokeId);

          // 2) Publish completed stroke to Ably on individual channel (so teacher can see)
          if (individualChannel) {
            individualChannel.publish('student-layer', {
              lines: studentLinesRef.current,
              studentId,
              clientId,
              meta: {
                display: canvasSize,
                scale: canvasScale,
              },
            });
            console.log('📤 Published completed stroke to Ably');
          }
        } catch (error) {
          console.error('❌ Error saving stroke to IndexedDB:', error);
        }
      }, 150);
    }
    
    // If eraser was used, sync the entire state to IndexedDB and publish to Ably
    if (wasEraser) {
      setTimeout(async () => {
        try {
          console.log('🗑️ Eraser used - Syncing remaining strokes to IndexedDB...');
          await replaceAllStrokesInIndexedDB(studentLinesRef.current, roomId, studentId, 'student', sessionId);
          console.log('✅ Eraser: Synced to IndexedDB');

          // Publish updated state after erase to individual channel
          if (individualChannel) {
            individualChannel.publish('student-layer', {
              lines: studentLinesRef.current,
              studentId,
              clientId,
              meta: {
                display: canvasSize,
                scale: canvasScale,
              },
            });
            console.log('📤 Published after erase to Ably');
          }
        } catch (error) {
          console.error('❌ Error syncing eraser changes to IndexedDB:', error);
        }
      }, 150);
    }

    currentLineRef.current = null; // Clear the current line ref
  };

  const handleUndo = async () => {
    if (undoStack.current.length > 0) {
      const previousState = undoStack.current.pop();
      redoStack.current.push([...studentLines]);
      setStudentLines(previousState);

      // Sync with IndexedDB and publish to Ably
      try {
        await replaceAllStrokesInIndexedDB(previousState, roomId, studentId, 'student', sessionId);
        console.log('✅ Undo: Synced to IndexedDB');

        // Publish updated state to individual channel
        if (individualChannel) {
          individualChannel.publish('student-layer', {
            lines: previousState,
            studentId,
            clientId,
            meta: {
              display: canvasSize,
              scale: canvasScale,
            },
          });
          console.log('📤 Published undo to Ably');
        }
      } catch (error) {
        console.error('❌ Error syncing undo to IndexedDB:', error);
      }
    }
  };

  const handleRedo = async () => {
    if (redoStack.current.length > 0) {
      const nextState = redoStack.current.pop();
      undoStack.current.push([...studentLines]);
      setStudentLines(nextState);

      // Sync with IndexedDB and publish to Ably
      try {
        await replaceAllStrokesInIndexedDB(nextState, roomId, studentId, 'student', sessionId);
        console.log('✅ Redo: Synced to IndexedDB');

        // Publish updated state to individual channel
        if (individualChannel) {
          individualChannel.publish('student-layer', {
            lines: nextState,
            studentId,
            clientId,
            meta: {
              display: canvasSize,
              scale: canvasScale,
            },
          });
          console.log('📤 Published redo to Ably');
        }
      } catch (error) {
        console.error('❌ Error syncing redo to IndexedDB:', error);
      }
    }
  };

  const handleClear = async () => {
    undoStack.current.push([...studentLines]);
    redoStack.current = [];
    setStudentLines([]);

    // Clear from IndexedDB and publish to Ably
    try {
      await clearStrokesFromIndexedDB(roomId, studentId, 'student');
      console.log('✅ Clear: Synced to IndexedDB');

      // Publish cleared state to individual channel
      if (individualChannel) {
        individualChannel.publish('student-layer', {
          lines: [],
          studentId,
          clientId,
          meta: {
            display: canvasSize,
            scale: canvasScale,
          },
        });
        console.log('📤 Published clear to Ably');
      }
    } catch (error) {
      console.error('❌ Error clearing IndexedDB:', error);
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

  const clientLabel = formatClientLabel();

  return (
    <div className="student-canvas-page">
      <SessionStatusOverlay
        status={sessionStatus}
        roomId={roomId}
        onBackToLogin={() => navigate('/student-login')}
      />

      <div className="student-canvas-container">
        <StudentStatusBar
          roomId={roomId}
          clientLabel={clientLabel}
          tool={tool}
          inputMode={inputMode}
          isMobile={isMobile}
          connectionLabel={connectionLabel}
          connectionStateClass={connectionStateClass}
          toolbarPosition={toolbarPosition}
          onToggleToolbarPosition={toggleToolbarPosition}
        />

        <div
          className={`student-workspace ${toolbarPosition === 'right' ? 'toolbar-right' : ''} ${
            isMobile ? 'mobile-view' : ''
          }`}
        >
          <StudentToolbar
            isMobile={isMobile}
            color={color}
            onColorChange={setColor}
            tool={tool}
            onToolChange={setTool}
            brushSize={brushSize}
            onBrushSizeChange={setBrushSize}
            inputMode={inputMode}
            onToggleInputMode={toggleInputMode}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClear={handleClear}
            undoDisabled={undoStack.current.length === 0}
            redoDisabled={redoStack.current.length === 0}
          />

          <StudentCanvas
            canvasWrapperRef={canvasWrapperRef}
            canvasSize={canvasSize}
            stageRef={stageRef}
            isLoadingData={isLoadingData}
            sharedImage={sharedImage}
            studentLines={studentLines}
            teacherLines={teacherLines}
            projectPointsForDisplay={projectPointsForDisplay}
            projectStrokeWidth={projectStrokeWidth}
            handlePointerDown={handlePointerDown}
            handlePointerMove={handlePointerMove}
            handlePointerUp={handlePointerUp}
          />
        </div>
      </div>
    </div>
  );
}

export default Student;
