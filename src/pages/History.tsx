import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { useSessions } from '../hooks/useSessions';
import { useQuestions } from '../hooks/useQuestions';
import { useResponses } from '../hooks/useResponses';
import './History.css';

const BASE_CANVAS = { width: 800, height: 600 };

const formatDateTime = (value) => {
  if (!value) {
    return 'Unknown';
  }

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown';
    }
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
};

const buildTemplateImage = (type) => {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = BASE_CANVAS.width;
  canvas.height = BASE_CANVAS.height;
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, BASE_CANVAS.width, BASE_CANVAS.height);

  if (type === 'hanzi') {
    const boxSize = 450;
    const boxX = (BASE_CANVAS.width - boxSize) / 2;
    const boxY = (BASE_CANVAS.height - boxSize) / 2;

    ctx.strokeStyle = '#0F9D83';
    ctx.lineWidth = 4;
    ctx.strokeRect(boxX, boxY, boxSize, boxSize);

    ctx.strokeStyle = '#B0E8D8';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);

    ctx.beginPath();
    ctx.moveTo(BASE_CANVAS.width / 2, boxY);
    ctx.lineTo(BASE_CANVAS.width / 2, boxY + boxSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(boxX, BASE_CANVAS.height / 2);
    ctx.lineTo(boxX + boxSize, BASE_CANVAS.height / 2);
    ctx.stroke();
  } else if (type === 'graph-corner' || type === 'graph-cross') {
    const margin = 80;
    const gridSize = 40;

    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    for (let x = margin; x <= BASE_CANVAS.width - margin; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, margin);
      ctx.lineTo(x, BASE_CANVAS.height - margin);
      ctx.stroke();
    }

    for (let y = margin; y <= BASE_CANVAS.height - margin; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(margin, y);
      ctx.lineTo(BASE_CANVAS.width - margin, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#5B9BD5';
    ctx.lineWidth = 3;

    if (type === 'graph-corner') {
      ctx.beginPath();
      ctx.moveTo(margin, BASE_CANVAS.height - margin);
      ctx.lineTo(BASE_CANVAS.width - margin, BASE_CANVAS.height - margin);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(margin, margin);
      ctx.lineTo(margin, BASE_CANVAS.height - margin);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(margin, BASE_CANVAS.height / 2);
      ctx.lineTo(BASE_CANVAS.width - margin, BASE_CANVAS.height / 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(BASE_CANVAS.width / 2, margin);
      ctx.lineTo(BASE_CANVAS.width / 2, BASE_CANVAS.height - margin);
      ctx.stroke();
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  return {
    type,
    dataUrl,
    width: BASE_CANVAS.width,
    height: BASE_CANVAS.height,
    timestamp: Date.now(),
  };
};

const useBackgroundImage = (background) => {
  const dataUrl = background?.dataUrl ?? null;
  const [image] = useImage(dataUrl, 'anonymous');
  return image ?? null;
};

const computeImageLayout = (background) => {
  if (!background || !background.width || !background.height) {
    return null;
  }

  const imageAspect = background.width / background.height;
  const canvasAspect = BASE_CANVAS.width / BASE_CANVAS.height;

  let width;
  let height;
  let x;
  let y;

  if (imageAspect > canvasAspect) {
    width = BASE_CANVAS.width;
    height = width / imageAspect;
    x = 0;
    y = (BASE_CANVAS.height - height) / 2;
  } else {
    height = BASE_CANVAS.height;
    width = height * imageAspect;
    x = (BASE_CANVAS.width - width) / 2;
    y = 0;
  }

  return { x, y, width, height };
};

const ResponseCard = ({ response, background }) => {
  const containerRef = useRef(null);
  const [canvasWidth, setCanvasWidth] = useState(BASE_CANVAS.width);
  const backgroundImage = useBackgroundImage(background);
  const imageLayout = useMemo(
    () => computeImageLayout(background),
    [background]
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const update = () => {
      if (!containerRef.current) {
        return;
      }
      setCanvasWidth(containerRef.current.clientWidth || BASE_CANVAS.width);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  const scale = Math.max(0.2, canvasWidth / BASE_CANVAS.width);

  const studentLines = Array.isArray(response.student_lines)
    ? response.student_lines
    : [];
  const teacherLines = Array.isArray(response.teacher_annotations)
    ? response.teacher_annotations
    : [];

  const studentStrokeCount = studentLines.length;
  const teacherStrokeCount = teacherLines.length;

  const displayName =
    response.participant?.name ||
    response.participant?.student_id ||
    'Unknown student';

  return (
    <div className="history-response-card">
      <div className="history-response-header">
        <div>
          <strong>{displayName}</strong>
          {response.participant?.student_id && (
            <span className="history-student-id">
              #{response.participant.student_id}
            </span>
          )}
        </div>
        <div className="history-stroke-counts">
          <span>{studentStrokeCount} student</span>
          <span>{teacherStrokeCount} teacher</span>
        </div>
      </div>
      <div className="history-response-canvas" ref={containerRef}>
        <Stage
          width={BASE_CANVAS.width}
          height={BASE_CANVAS.height}
          scaleX={scale}
          scaleY={scale}
        >
          {backgroundImage && imageLayout && (
            <Layer listening={false}>
              <KonvaImage
                image={backgroundImage}
                x={imageLayout.x}
                y={imageLayout.y}
                width={imageLayout.width}
                height={imageLayout.height}
              />
            </Layer>
          )}
          <Layer listening={false}>
            {studentLines.map((line, index) => (
              <Line
                key={`student-${index}`}
                points={line.points || []}
                stroke={line.color || '#222222'}
                strokeWidth={line.strokeWidth || 3}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                opacity={0.95}
              />
            ))}
          </Layer>
          <Layer listening={false}>
            {teacherLines.map((line, index) => (
              <Line
                key={`teacher-${index}`}
                points={line.points || []}
                stroke={line.color || '#FF3B30'}
                strokeWidth={(line.strokeWidth || 3) * 1.05}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                opacity={0.85}
              />
            ))}
          </Layer>
        </Stage>
      </div>
      <div className="history-response-footer">
        <span>Last updated {formatDateTime(response.last_updated_at)}</span>
      </div>
    </div>
  );
};

const History: React.FC = () => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [questionFilter, setQuestionFilter] = useState('');

  // Fetch sessions
  const {
    data: sessions = [],
    isLoading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
  } = useSessions();

  // Auto-select first session when sessions load
  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0].id);
    } else if (sessions.length === 0) {
      setSelectedSessionId(null);
    } else if (selectedSessionId && !sessions.some((s) => s.id === selectedSessionId)) {
      // Current selection no longer exists, select first
      setSelectedSessionId(sessions[0]?.id || null);
    }
  }, [sessions, selectedSessionId]);

  // Fetch questions for selected session
  const {
    data: questions = [],
    isLoading: questionsLoading,
    error: questionsError,
  } = useQuestions(selectedSessionId);

  // Auto-select first question when questions load
  useEffect(() => {
    if (questions.length > 0 && !selectedQuestionId) {
      setSelectedQuestionId(questions[0].id);
    } else if (questions.length === 0) {
      setSelectedQuestionId(null);
    } else if (selectedQuestionId && !questions.some((q) => q.id === selectedQuestionId)) {
      // Current selection no longer exists, select first
      setSelectedQuestionId(questions[0]?.id || null);
    }
  }, [questions, selectedQuestionId]);

  // Fetch responses for selected question
  const {
    data: responses = [],
    isLoading: responsesLoading,
    error: responsesError,
  } = useResponses(selectedQuestionId);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const selectedQuestion = useMemo(
    () => questions.find((question) => question.id === selectedQuestionId) || null,
    [questions, selectedQuestionId]
  );

  const filteredQuestions = useMemo(() => {
    if (!questionFilter) {
      return questions;
    }

    const lower = questionFilter.toLowerCase();
    return questions.filter((question) => {
      const numberMatch = question.question_number
        ?.toString()
        .toLowerCase()
        .includes(lower);
      const typeMatch = question.content_type?.toLowerCase().includes(lower);
      const templateMatch = question.template_type
        ?.toLowerCase()
        .includes(lower);
      return numberMatch || typeMatch || templateMatch;
    });
  }, [questions, questionFilter]);

  const background = useMemo(() => {
    if (!selectedQuestion) {
      return null;
    }

    if (selectedQuestion.content_type === 'image') {
      return selectedQuestion.image_data || null;
    }

    if (selectedQuestion.content_type === 'template') {
      return buildTemplateImage(selectedQuestion.template_type);
    }

    return null;
  }, [selectedQuestion]);

  return (
    <div className="history-page">
      <aside className="history-sidebar">
        <header className="history-sidebar-header">
          <h1>Session History</h1>
          <button
            className="history-refresh"
            onClick={() => refetchSessions()}
            disabled={sessionsLoading}
          >
            Refresh
          </button>
        </header>

        <div className="history-panel">
          <label htmlFor="session-select">Select session</label>
          {sessionsLoading ? (
            <div className="history-loading">Loading sessions…</div>
          ) : (
            <select
              id="session-select"
              className="history-select"
              value={selectedSessionId || ''}
              onChange={(event) => setSelectedSessionId(event.target.value || null)}
            >
              <option value="">Choose a session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.room_code || 'Unnamed'} · {session.status}
                </option>
              ))}
            </select>
          )}
          {sessionsError && (
            <div className="history-error">
              {sessionsError instanceof Error
                ? sessionsError.message
                : 'Failed to load sessions. Please retry.'}
            </div>
          )}
          {selectedSession && (
            <div className="history-session-meta">
              <div>
                <strong>Room</strong>
                <span>{selectedSession.room_code || 'N/A'}</span>
              </div>
              <div>
                <strong>Status</strong>
                <span className={`history-status ${selectedSession.status}`}>
                  {selectedSession.status}
                </span>
              </div>
              <div>
                <strong>Created</strong>
                <span>{formatDateTime(selectedSession.created_at)}</span>
              </div>
              {selectedSession.started_at && (
                <div>
                  <strong>Started</strong>
                  <span>{formatDateTime(selectedSession.started_at)}</span>
                </div>
              )}
              {selectedSession.ended_at && (
                <div>
                  <strong>Ended</strong>
                  <span>{formatDateTime(selectedSession.ended_at)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="history-panel">
          <div className="history-panel-header">
            <label htmlFor="question-filter">Questions</label>
            <input
              id="question-filter"
              className="history-filter"
              type="search"
              placeholder="Filter by number or type"
              value={questionFilter}
              onChange={(event) => setQuestionFilter(event.target.value)}
              disabled={!questions.length}
            />
          </div>

          {questionsLoading ? (
            <div className="history-loading">Loading questions…</div>
          ) : filteredQuestions.length ? (
            <div className="history-question-list">
              {filteredQuestions.map((question) => (
                <button
                  key={question.id}
                  type="button"
                  className={`history-question ${
                    question.id === selectedQuestionId ? 'active' : ''
                  }`}
                  onClick={() => setSelectedQuestionId(question.id)}
                >
                  <span className="history-question-number">
                    Q{question.question_number}
                  </span>
                  <span className="history-question-type">
                    {question.content_type}
                    {question.template_type ? ` · ${question.template_type}` : ''}
                  </span>
                </button>
              ))}
            </div>
          ) : selectedSession ? (
            <div className="history-empty">No matching questions.</div>
          ) : (
            <div className="history-empty">Choose a session to view questions.</div>
          )}

          {questionsError && (
            <div className="history-error">
              {questionsError instanceof Error
                ? questionsError.message
                : 'Unable to load questions for this session.'}
            </div>
          )}
        </div>
      </aside>

      <main className="history-content">
        {selectedQuestion ? (
          <>
            <div className="history-question-summary">
              <div>
                <h2>
                  Question {selectedQuestion.question_number} ·{' '}
                  {selectedQuestion.content_type}
                </h2>
                <p>
                  Sent {formatDateTime(selectedQuestion.sent_at)} •{' '}
                  {responses.length} response{responses.length === 1 ? '' : 's'}
                </p>
              </div>
              {selectedQuestion.template_type && (
                <span className="history-template-badge">
                  Template: {selectedQuestion.template_type}
                </span>
              )}
            </div>

            {responsesError && (
              <div className="history-error history-error-inline">
                {responsesError instanceof Error
                  ? responsesError.message
                  : 'Unable to load responses for this question.'}
              </div>
            )}

            {responsesLoading ? (
              <div className="history-loading history-loading-inline">
                Loading responses…
              </div>
            ) : responses.length ? (
              <div className="history-response-grid">
                {responses.map((response) => (
                  <ResponseCard
                    key={response.id}
                    response={response}
                    background={background}
                  />
                ))}
              </div>
            ) : (
              <div className="history-empty history-empty-inline">
                No saved responses for this question yet.
              </div>
            )}
          </>
        ) : (
          <div className="history-placeholder">
            {selectedSession
              ? 'Select a question to review saved work.'
              : 'Choose a session to view its history.'}
          </div>
        )}
      </main>
    </div>
  );
};

export default History;
