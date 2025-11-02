import React, { useEffect, useMemo, useState } from 'react';
import './LoadTesting.css';

const DEFAULT_API_BASE = import.meta.env.VITE_LOAD_TEST_API ?? 'http://localhost:8080';
const LOG_LIMIT = 200;

const numericFields = [
  { key: 'numberOfStudents', label: 'Simulated Students', min: 1, step: 1 },
  { key: 'drawIntervalMs', label: 'Draw Interval (ms)', min: 100, step: 100 },
  { key: 'strokesPerDraw', label: 'Strokes Per Draw', min: 1, step: 1 },
  { key: 'testDurationSeconds', label: 'Duration (seconds)', min: 10, step: 10 },
  { key: 'rampUpBatchSize', label: 'Ramp Batch Size', min: 1, step: 1 },
  { key: 'rampUpDelayMs', label: 'Ramp Delay Between Batches (ms)', min: 0, step: 50 },
  { key: 'statsIntervalMs', label: 'Stats Interval (ms)', min: 1000, step: 1000 },
];

const numericFieldKeys = new Set(numericFields.map((field) => field.key));

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return '';
  }
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

function LoadTesting() {
  const [status, setStatus] = useState(null);
  const [presets, setPresets] = useState({});
  const [selectedPreset, setSelectedPreset] = useState('');
  const [formValues, setFormValues] = useState({});
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState([]);

  const isTestActive = status && ['connecting', 'running', 'stopping'].includes(status.state);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchBootstrap = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/load-tests`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to load presets: ${response.status}`);
        }
        const data = await response.json();
        if (!isMounted) {
          return;
        }
        setStatus(data.status);
        setFormValues(data.status?.config ?? {});
        setPresets(data.presets ?? {});
        setSelectedPreset(Object.keys(data.presets ?? {})[0] ?? '');
        setLogs([]);
      } catch (err) {
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchBootstrap();

    return () => {
      controller.abort();
      isMounted = false;
    };
  }, [apiBase]);

  useEffect(() => {
    const sourceUrl = `${apiBase.replace(/\/$/, '')}/api/load-tests/events`;
    const eventSource = new EventSource(sourceUrl);

    eventSource.addEventListener('state', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setStatus(payload);
      } catch (err) {
        console.error('Failed to parse state event', err);
      }
    });

    eventSource.addEventListener('stats', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setStatus(payload);
      } catch (err) {
        console.error('Failed to parse stats event', err);
      }
    });

    eventSource.addEventListener('log', (event) => {
      try {
        const logEntry = JSON.parse(event.data);
        setLogs((current) => {
          const next = [...current, { ...logEntry, timestamp: logEntry.timestamp ?? Date.now() }];
          return next.slice(-LOG_LIMIT);
        });
      } catch (err) {
        console.error('Failed to parse log event', err);
      }
    });

    eventSource.addEventListener('history', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setLogs(payload.log ?? []);
      } catch (err) {
        console.error('Failed to parse history event', err);
      }
    });

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [apiBase]);

  const presetOptions = useMemo(() => Object.entries(presets), [presets]);

  useEffect(() => {
    if (!selectedPreset) {
      return;
    }
    const preset = presets[selectedPreset];
    if (!preset || !preset.config) {
      return;
    }
    setFormValues((current) => ({
      ...current,
      ...preset.config,
    }));
  }, [selectedPreset, presets]);

  const handleInputChange = (key, value) => {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleNumericChange = (key) => (event) => {
    const raw = event.target.value;
    handleInputChange(key, raw === '' ? '' : Number(raw));
  };

  const handleStart = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const payload = {
        preset: selectedPreset || undefined,
        config: Object.fromEntries(
          Object.entries(formValues).flatMap(([key, value]) => {
            if (numericFieldKeys.has(key)) {
              if (value === '' || Number.isNaN(Number(value))) {
                return [];
              }
              return [[key, Number(value)]];
            }

            if (typeof value === 'string') {
              const trimmed = value.trim();
              return trimmed ? [[key, trimmed]] : [];
            }

            if (value === undefined || value === null) {
              return [];
            }

            return [[key, value]];
          }),
        ),
      };
      const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/load-tests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await response.json().catch(() => ({}));
        throw new Error(message.error || `Failed to start test (${response.status})`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStop = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/load-tests/stop`, {
        method: 'POST',
      });
      if (!response.ok) {
        const message = await response.json().catch(() => ({}));
        throw new Error(message.error || `Failed to stop test (${response.status})`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const stats = status?.stats;

  if (isLoading) {
    return (
      <div className="load-testing-page">
        <div className="panel">
          <p>Loading load testing console...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="load-testing-page">
      <div className="panel controls-panel">
        <header>
          <div>
            <h1>Load Testing Console</h1>
            <p className="subtitle">Spin up simulated classrooms and watch live metrics.</p>
          </div>
          <div className={`status-pill status-${status?.state || 'idle'}`}>
            {status?.state || 'idle'}
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <div className="field">
          <label htmlFor="api-base">Load Test API Base URL</label>
          <input
            id="api-base"
            type="url"
            value={apiBase}
            onChange={(event) => setApiBase(event.target.value)}
            placeholder="https://your-loadtest-server"
          />
        </div>

        <div className="field">
          <label htmlFor="preset">Test Preset</label>
          <select
            id="preset"
            value={selectedPreset}
            onChange={(event) => setSelectedPreset(event.target.value)}
            disabled={isTestActive}
          >
            {presetOptions.map(([key, preset]) => (
              <option key={key} value={key}>
                {preset.label}
              </option>
            ))}
          </select>
          {selectedPreset && presets[selectedPreset] && (
            <p className="preset-description">{presets[selectedPreset].description}</p>
          )}
        </div>

        <div className="fieldset">
          <h2>Scenario Parameters</h2>
          <div className="field-grid">
            {numericFields.map(({ key, label, min, step }) => (
              <label key={key} htmlFor={key} className="field">
                <span>{label}</span>
                <input
                  id={key}
                  type="number"
                  min={min}
                  step={step}
                  value={formValues[key] ?? ''}
                  onChange={handleNumericChange(key)}
                  disabled={isTestActive}
                />
              </label>
            ))}
            <label htmlFor="roomCode" className="field">
              <span>Room Code</span>
              <input
                id="roomCode"
                type="text"
                value={formValues.roomCode ?? ''}
                onChange={(event) => handleInputChange('roomCode', event.target.value)}
                disabled={isTestActive}
              />
            </label>
            <label htmlFor="tokenServerUrl" className="field">
              <span>Token Server URL</span>
              <input
                id="tokenServerUrl"
                type="url"
                value={formValues.tokenServerUrl ?? ''}
                onChange={(event) => handleInputChange('tokenServerUrl', event.target.value)}
                disabled={isTestActive}
              />
            </label>
          </div>
        </div>

        <div className="actions">
          <button
            type="button"
            className="btn start"
            onClick={handleStart}
            disabled={isTestActive || isSubmitting}
          >
            Launch Test
          </button>
          <button
            type="button"
            className="btn stop"
            onClick={handleStop}
            disabled={!isTestActive || isSubmitting}
          >
            Stop Test
          </button>
        </div>
      </div>

      <div className="panel metrics-panel">
        <section>
          <h2>Live Metrics</h2>
          {stats ? (
            <dl className="metrics-grid">
              <div>
                <dt>Duration</dt>
                <dd>{stats.durationSeconds ? `${stats.durationSeconds}s` : '-'}</dd>
              </div>
              <div>
                <dt>Active Connections</dt>
                <dd>{`${stats.activeConnections}/${status?.config?.numberOfStudents ?? 0}`}</dd>
              </div>
              <div>
                <dt>Total Connections</dt>
                <dd>{stats.totalConnections}</dd>
              </div>
              <div>
                <dt>Messages Sent</dt>
                <dd>
                  {stats.totalMessagesSent}
                  {stats.messagesPerSecond ? ` (${stats.messagesPerSecond}/s)` : ''}
                </dd>
              </div>
              <div>
                <dt>Messages Received</dt>
                <dd>
                  {stats.totalMessagesReceived}
                  {stats.receivedPerSecond ? ` (${stats.receivedPerSecond}/s)` : ''}
                </dd>
              </div>
              <div>
                <dt>Draw Actions</dt>
                <dd>{stats.totalDrawActions}</dd>
              </div>
              <div>
                <dt>Errors</dt>
                <dd>{stats.errors}</dd>
              </div>
            </dl>
          ) : (
            <p>No metrics yet.</p>
          )}
        </section>

        <section className="logs-section">
          <h2>Event Log</h2>
          <div className="logs">
            {logs.length === 0 ? (
              <p className="muted">No log entries yet.</p>
            ) : (
              logs
                .slice()
                .reverse()
                .map((log, index) => (
                  <div key={`${log.timestamp}-${index}`} className={`log log-${log.level || 'info'}`}>
                    <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
                    <span className="log-message">{log.message}</span>
                  </div>
                ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default LoadTesting;
