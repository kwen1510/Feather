import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Stage, Layer, Line, Image as KonvaImage } from 'react-konva';
import * as Ably from 'ably';
import { supabase } from '../supabaseClient';
import { Pen, Eraser, Undo, Redo, Trash2, Pointer, Feather } from 'lucide-react';
import { getOrCreateStudentId } from '../utils/identity';
import { initDB, saveStroke as saveStrokeToIndexedDB, loadStrokes as loadStrokesFromIndexedDB, clearStrokes as clearStrokesFromIndexedDB, validateSession, replaceAllStrokes as replaceAllStrokesInIndexedDB } from '../utils/indexedDB';
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

  // Sync student lines to Ably (publish to teacher)
  useEffect(() => {
    if (!isRemoteUpdate.current && channel) {
      const timer = setTimeout(() => {
        channel.publish('student-layer', {
          lines: studentLines,
          studentId,          // Persistent ID (primary key)
          clientId,           // Volatile ID (backward compatibility)
          meta: {
            display: canvasSize,
            scale: canvasScale,
          },
        });
        console.log('📤 Published student layer:', studentLines.length, 'lines (studentId:', studentId, ')');
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [studentLines, channel, clientId, studentId, canvasSize, canvasScale]);

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
          if (hasInitiallyConnected && whiteboardChannel) {
            console.log('🔄 Reconnected - re-entering presence and syncing state');
            try {
              // Re-enter presence
              await whiteboardChannel.presence.enter({
                name: studentName || 'Anonymous',
                studentId: studentId || '',
                isVisible: !document.hidden
              });
              console.log('✅ Re-entered presence as:', studentName || 'Anonymous', 'with studentId:', studentId || '');

              // Request current question state + annotations (combined in sync-full-state)
              setTimeout(() => {
                if (!isActive) return;
                console.log('🔄 Requesting full state (question + annotations)');
                whiteboardChannel.publish('request-current-state', {
                  clientId: clientId || '',
                  studentId: studentId || '',
                  timestamp: Date.now(),
                });
              }, 300);
              
              // Re-publish current strokes to teacher after reconnection
              setTimeout(() => {
                if (!isActive) return;
                const currentStrokes = studentLinesRef.current;
                if (currentStrokes && currentStrokes.length > 0) {
                  console.log('🔄 Re-emitting', currentStrokes.length, 'strokes to teacher after reconnection...');
                  whiteboardChannel.publish('student-layer', {
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

            setTimeout(() => {
              isRemoteUpdate.current = false;
            }, 100);
          }
        });

        // Listen for full state sync (content + annotations)
        subscribe('sync-full-state', (message) => {
          if (!isActive) return;
          if (message.data.targetClientId === clientId) {
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
          }
        });

        // Listen for clear all drawings command (when teacher sends new content)
        subscribe('clear-all-drawings', (message) => {
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
        subscribe('session-started', () => {
          if (!isActive) return;
          setSessionStatus('active');
        });

        // Listen for session ended
        subscribe('session-ended', () => {
          if (!isActive) return;
          console.log('🔚 Session ended');

          setSessionStatus('ended');
          navigate('/student-login');
        });

        // Listen for teacher annotation recovery response (when student requests after refresh)
        subscribe('response-teacher-annotations', (message) => {
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

        // Listen for teacher request for student strokes (after teacher reconnects)
        subscribe('request-student-strokes', async (message) => {
          if (!isActive) return;
          console.log('📨 Teacher requested student strokes - loading from IndexedDB');

          try {
            // Load own strokes from IndexedDB
            const ownStrokes = await loadStrokesFromIndexedDB(roomId, studentId, 'student');
            console.log(`📤 Sending ${ownStrokes.length} strokes to teacher`);

            // Send strokes back to teacher
            setTimeout(() => {
              if (whiteboardChannel && whiteboardChannel.state === 'attached') {
                whiteboardChannel.publish('response-student-strokes', {
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

        // Enter presence with student name and initial visibility status
        await whiteboardChannel.presence.enter({
          name: studentName || 'Anonymous',
          studentId: studentId || '',
          isVisible: !document.hidden
        });

        if (!isActive) {
          await whiteboardChannel.presence.leaveClient(clientId);
          ablyClient.close();
          return;
        }

        setChannel(whiteboardChannel);

        // Request current state (content + annotations)
        setTimeout(() => {
          if (!isActive) return;
          whiteboardChannel.publish('request-current-state', {
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
                  
                  // 4) Explicitly publish loaded strokes to teacher (rejoin after refresh)
                  setTimeout(() => {
                    if (whiteboardChannel && isActive) {
                      console.log('4️⃣ Re-emitting strokes to teacher after refresh...');
                      whiteboardChannel.publish('student-layer', {
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

              // Request teacher annotations via Ably (teacher will load from IndexedDB and respond)
              console.log('📤 Requesting teacher annotations via Ably...');
              if (whiteboardChannel && isActive) {
                whiteboardChannel.publish('request-teacher-annotations', {
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
  }, [clientId, roomId, studentName, navigate, studentId]); // Removed sessionId and currentQuestionId to prevent reconnects

  // Track tab visibility and notify teacher
  useEffect(() => {
    // Prevent duplicate listeners in React Strict Mode
    if (!channel || visibilityListenerAttached.current) return;

    visibilityListenerAttached.current = true;

    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;

      channel.presence.update({
        name: studentName || 'Anonymous',
        studentId: studentId || '',
        isVisible: isVisible,
        lastVisibilityChange: Date.now()
      });

      channel.publish('student-visibility', {
        studentId: studentId || '', // Use persistent studentId (teacher state keyed by this)
        studentName: studentName || 'Anonymous',
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

    // Save the stroke to IndexedDB immediately after drawing (150ms delay)
    if (wasPen && currentLineRef.current && currentLineRef.current.strokeId) {
      const strokeToSave = currentLineRef.current;
      setTimeout(async () => {
        try {
          // 1) When i draw a stroke, store in indexdb
          console.log('1️⃣ Drawing finished - Storing stroke in IndexedDB...');
          await saveStrokeToIndexedDB(strokeToSave, roomId, studentId, 'student', sessionId);
          console.log('✅ Stroke saved to IndexedDB:', strokeToSave.strokeId);
        } catch (error) {
          console.error('❌ Error saving stroke to IndexedDB:', error);
        }
      }, 150);
    }
    
    // If eraser was used, sync the entire state to IndexedDB
    if (wasEraser) {
      setTimeout(async () => {
        try {
          console.log('🗑️ Eraser used - Syncing remaining strokes to IndexedDB...');
          await replaceAllStrokesInIndexedDB(studentLinesRef.current, roomId, studentId, 'student', sessionId);
          console.log('✅ Eraser: Synced to IndexedDB');
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
      
      // Sync with IndexedDB
      try {
        await replaceAllStrokesInIndexedDB(previousState, roomId, studentId, 'student', sessionId);
        console.log('✅ Undo: Synced to IndexedDB');
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
      
      // Sync with IndexedDB
      try {
        await replaceAllStrokesInIndexedDB(nextState, roomId, studentId, 'student', sessionId);
        console.log('✅ Redo: Synced to IndexedDB');
      } catch (error) {
        console.error('❌ Error syncing redo to IndexedDB:', error);
      }
    }
  };

  const handleClear = async () => {
    undoStack.current.push([...studentLines]);
    redoStack.current = [];
    setStudentLines([]);
    
    // Clear from IndexedDB
    try {
      await clearStrokesFromIndexedDB(roomId, studentId, 'student');
      console.log('✅ Clear: Synced to IndexedDB');
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
            <div className="feather-branding">
              <Feather size={28} strokeWidth={2} />
              <span>Feather</span>
            </div>
            {roomId && (
              <span className="session-info">
                Session: {roomId}
              </span>
            )}
            <span className="student-info">{formatClientLabel()}</span>
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
                  onClick={toggleInputMode}
                  className={`mobile-tool-button ${inputMode === 'all' ? 'active' : ''}`}
                  aria-label={inputMode === 'stylus-only' ? 'Stylus mode (pen only)' : 'All inputs'}
                  title={inputMode === 'stylus-only' ? 'Stylus mode (pen only)' : 'All inputs'}
                >
                  <Pointer size={20} />
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
              {isLoadingData && (
                <div className="canvas-loading-overlay">
                  <div className="loading-spinner"></div>
                  <p>Loading your work...</p>
                </div>
              )}
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
