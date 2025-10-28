import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Stage, Layer, Line, Image as KonvaImage } from 'react-konva';
import * as Ably from 'ably';
import { supabase } from '../supabaseClient';
import { Pen, Eraser, Undo, Redo, Trash2 } from 'lucide-react';
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
  const [clientId] = useState(`student-${Math.random().toString(36).substr(2, 9)}`);
  const [isConnected, setIsConnected] = useState(false);

  // Supabase session tracking
  const [sessionId, setSessionId] = useState(null);
  const [participantId, setParticipantId] = useState(null);
  const [sessionStatus, setSessionStatus] = useState('loading'); // 'loading' | 'waiting' | 'active' | 'ended'
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

  // Redirect to login if missing name or room, or if logging out from refresh
  useEffect(() => {
    // Check if user is logging out from a refresh
    const shouldLogout = sessionStorage.getItem('student-logout-on-load');
    if (shouldLogout === 'true') {
      sessionStorage.removeItem('student-logout-on-load');
      navigate('/student-login');
      return;
    }

    if (!roomId || !studentName) {
      navigate(`/student-login${roomId ? `?room=${roomId}` : ''}`);
    }
  }, [roomId, studentName, navigate]);

  // Load saved preferences
  useEffect(() => {
    if (typeof window === 'undefined') return;
    console.log('🔵 [STUDENT] Loading preferences from localStorage...');
    try {
      const stored = localStorage.getItem(STUDENT_PREFS_KEY);
      if (stored) {
        const prefs = JSON.parse(stored);
        console.log('🔵 [STUDENT] Found stored preferences:', prefs);
        // Check version - if old version, clear and use defaults
        if (prefs.version !== PREFS_VERSION) {
          console.log('🔵 [STUDENT] Version mismatch! Expected:', PREFS_VERSION, 'Got:', prefs.version);
          console.log('🔵 [STUDENT] Clearing old preferences...');
          localStorage.removeItem(STUDENT_PREFS_KEY);
          return;
        }
        console.log('🔵 [STUDENT] Applying preferences...');
        if (prefs.tool) setTool(prefs.tool);
        if (prefs.color) setColor(prefs.color);
        if (typeof prefs.brushSize === 'number') setBrushSize(prefs.brushSize);
        if (prefs.inputMode) setInputMode(prefs.inputMode);
        if (prefs.toolbarPosition) setToolbarPosition(prefs.toolbarPosition);
        console.log('🔵 [STUDENT] Preferences loaded successfully!');
      } else {
        console.log('🔵 [STUDENT] No stored preferences found, using defaults');
      }
    } catch (error) {
      console.warn('🔵 [STUDENT] Failed to load student prefs', error);
      localStorage.removeItem(STUDENT_PREFS_KEY);
    }
  }, []);

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
    if (typeof window === 'undefined') return;
    // Skip saving on first render to avoid overwriting loaded preferences
    if (isFirstRender.current) {
      isFirstRender.current = false;
      console.log('💾 [STUDENT] Skipping save on first render');
      return;
    }
    const prefs = { version: PREFS_VERSION, tool, color, brushSize, inputMode, toolbarPosition };
    console.log('💾 [STUDENT] Saving preferences to localStorage:', prefs);
    localStorage.setItem(STUDENT_PREFS_KEY, JSON.stringify(prefs));
  }, [tool, color, brushSize, inputMode, toolbarPosition]);

  // Undo/redo stacks
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const isFirstRender = useRef(true);

  // Ref to always access latest studentLines in auto-save
  const studentLinesRef = useRef(studentLines);
  useEffect(() => {
    studentLinesRef.current = studentLines;
  }, [studentLines]);

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

  // Validate session and create participant record
  useEffect(() => {
    const initializeSession = async () => {
      try {
        console.log('📝 Student validating session for room:', roomId);

        // Check if session exists for this room (case-insensitive)
        const { data: sessions, error: sessionError } = await supabase
          .from('sessions')
          .select('*')
          .ilike('room_code', roomId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (sessionError) {
          console.error('Failed to query session:', sessionError);
          setSessionStatus('ended');
          return;
        }

        if (!sessions || sessions.length === 0) {
          console.log('❌ No session found for room:', roomId);
          setSessionStatus('ended');
          return;
        }

        const session = sessions[0];
        console.log('✅ Session found:', session);

        setSessionId(session.id);
        setSessionStatus(session.status === 'active' ? 'active' : 'waiting');

        // Create participant record
        const { data: participant, error: participantError } = await supabase
          .from('participants')
          .insert([
            {
              session_id: session.id,
              client_id: clientId,
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

        console.log('👤 Participant created:', participant);
        setParticipantId(participant.id);

      } catch (error) {
        console.error('Error initializing session:', error);
        setSessionStatus('ended');
      }
    };

    initializeSession();
  }, [roomId, clientId, studentName]);

  // Initialize Ably connection
  useEffect(() => {
    const initAbly = async () => {
      try {
        const ably = new Ably.Realtime({
          authUrl: '/api/token',
          authParams: { clientId },
        });

        ably.connection.on('connected', () => {
          console.log('Connected to Ably');
          setIsConnected(true);
        });

        ably.connection.on('disconnected', () => {
          console.log('Disconnected from Ably');
          setIsConnected(false);
        });

        const whiteboardChannel = ably.channels.get(`room-${roomId}`);

        // Listen for student layer updates
        // NOTE: Students should NOT listen to their own messages to avoid race conditions
        // Only the teacher needs to see student updates
        whiteboardChannel.subscribe('student-layer', (message) => {
          // Ignore all student-layer messages when you're a student
          // Students maintain their own local state
          return;
        });

        // Listen for teacher annotations and filter by targetStudentId
        whiteboardChannel.subscribe('teacher-annotation', (message) => {
          if (message.data.targetStudentId === clientId) {
            isRemoteUpdate.current = true;
            setTeacherLines(message.data.annotations || []);
            setTimeout(() => {
              isRemoteUpdate.current = false;
            }, 100);
          }
        });

        // Listen for teacher shared images
        whiteboardChannel.subscribe('teacher-image', (message) => {
          setSharedImage({
            dataUrl: message.data?.dataUrl,
            width: message.data?.width,
            height: message.data?.height,
            timestamp: message.data?.timestamp,
          });
        });

        // Listen for teacher templates
        whiteboardChannel.subscribe('teacher-template', (message) => {
          setSharedImage({
            dataUrl: message.data?.dataUrl,
            width: message.data?.width,
            height: message.data?.height,
            type: message.data?.type, // hanzi, graph-corner, graph-cross
            timestamp: message.data?.timestamp,
          });
        });

        // Listen for teacher clear command
        whiteboardChannel.subscribe('teacher-clear', (message) => {
          setSharedImage(null);
        });

        // Listen for question state sync (when joining/rejoining)
        whiteboardChannel.subscribe('sync-question-state', (message) => {
          if (message.data.targetClientId === clientId) {
            console.log('📥 Received current question state');
            setSharedImage(message.data.content);
          }
        });

        // Listen for clear all drawings command (when teacher sends new content)
        whiteboardChannel.subscribe('clear-all-drawings', (message) => {
          console.log('📝 Clearing all drawings (teacher sent new content)');

          // Track the new question
          if (message.data?.questionId) {
            setCurrentQuestionId(message.data.questionId);
          }

          isRemoteUpdate.current = true;
          setStudentLines([]); // Clear student's own drawings
          setTeacherLines([]); // Clear teacher annotations
          setTimeout(() => {
            isRemoteUpdate.current = false;
          }, 100);
        });

        // Listen for session started
        whiteboardChannel.subscribe('session-started', (message) => {
          console.log('🎉 Session started!');
          setSessionStatus('active');
        });

        // Listen for session ended
        whiteboardChannel.subscribe('session-ended', (message) => {
          console.log('🛑 Session ended:', message.data?.reason);
          setSessionStatus('ended');

          // Redirect to login immediately
          navigate('/student-login');
        });

        // Enter presence with student name and initial visibility status
        await whiteboardChannel.presence.enter({
          name: studentName,
          isVisible: !document.hidden
        });
        console.log(`Joined room ${roomId} as ${studentName}`);

        setChannel(whiteboardChannel);

        // Request current question state after joining (in case we're joining mid-session)
        setTimeout(() => {
          whiteboardChannel.publish('request-current-state', {
            clientId: clientId,
            timestamp: Date.now(),
          });
          console.log('📞 Requested current question state from teacher');
        }, 1000); // Wait 1 second to ensure all subscriptions are set up

        return () => {
          // Leave presence before closing connection
          if (whiteboardChannel) {
            whiteboardChannel.presence.leave().then(() => {
              console.log('👋 Left presence as', clientId);
              ably.close();
            }).catch((err) => {
              console.error('Error leaving presence:', err);
              ably.close();
            });
          } else {
            ably.close();
          }
        };
      } catch (error) {
        console.error('Failed to initialize Ably:', error);
      }
    };

    initAbly();
  }, [clientId, roomId]);

  // Track tab visibility and notify teacher
  useEffect(() => {
    if (!channel) return;

    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      console.log(`👁️ Tab visibility changed: ${isVisible ? 'visible' : 'hidden'}`);

      // Update presence with visibility status
      channel.presence.update({
        name: studentName,
        isVisible: isVisible,
        lastVisibilityChange: Date.now()
      });

      // Publish event for immediate notification (both hide AND show)
      channel.publish('student-visibility', {
        clientId: clientId,
        studentName: studentName,
        isVisible: isVisible,
        timestamp: Date.now()
      });
    };

    // Listen for visibility changes (tab switch, minimize, etc.)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
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
  useEffect(() => {
    if (!isRemoteUpdate.current && channel) {
      const timer = setTimeout(() => {
        channel.publish('student-layer', {
          lines: studentLines,
          clientId,
          meta: {
            base: BASE_CANVAS,
            display: canvasSize,
            scale: canvasScale,
          },
        });
        console.log('Published student layer:', studentLines.length, 'lines');
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [studentLines, channel, clientId, canvasSize, canvasScale]);

  // Handle page refresh - confirm and logout
  useEffect(() => {
    if (!channel) return;

    const handleBeforeUnload = (e) => {
      // Immediately leave presence to avoid duplicate sessions
      try {
        // Use sync method for immediate effect
        channel.presence.leaveClient(clientId);
      } catch (error) {
        console.error('Error leaving presence on unload:', error);
      }

      // Set flag to logout on reload
      sessionStorage.setItem('student-logout-on-load', 'true');

      // Show browser confirmation dialog
      e.preventDefault();
      e.returnValue = 'Are you sure you want to leave? You will be logged out.';
      return e.returnValue;
    };

    // Use pagehide for better mobile support (iOS Safari, iPad)
    const handlePageHide = (e) => {
      console.log('📱 Page hide event - cleaning up session');

      // Immediately leave presence
      try {
        channel.presence.leaveClient(clientId);
      } catch (error) {
        console.error('Error leaving presence on pagehide:', error);
      }

      // Set logout flag
      sessionStorage.setItem('student-logout-on-load', 'true');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [channel, clientId]);

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
          } else {
            console.log('💾 Auto-saved student work');
          }
        } else {
          // Create new annotation
          const { error: insertError } = await supabase
            .from('annotations')
            .insert([annotationData]);

          if (insertError) {
            console.error('Failed to create annotation:', insertError);
          } else {
            console.log('💾 Created new annotation');
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

        console.log('💾 Saved work for new question');
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
        meta: {
          base: BASE_CANVAS,
          display: canvasSize,
          scale: canvasScale,
        },
      });
      console.log('Published student clear');
    }
  };

  const getShortClientId = () => {
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
            <h1>Student Canvas</h1>
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
