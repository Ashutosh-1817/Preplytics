
import { useState, useEffect, useRef } from 'react';
import {
  startSession,
  stopSession,
  logManualSession,
  fetchSessions,
  deleteSession,
  resetNodeSessions,
} from '../services/sessions.api.js';
import { readActiveSession, writeActiveSession, clearActiveSession } from '../utils/activeSessionStorage.js';
import './SessionTimer.css';

const formatElapsed = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
};

function SessionTimer({ nodeId, onSessionLogged }) {
  const [activeSession, setActiveSession] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [manualMinutes, setManualMinutes] = useState(30);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [recentSessions, setRecentSessions] = useState([]);

  const activeSessionRef = useRef(null);
  const onSessionLoggedRef = useRef(onSessionLogged);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  onSessionLoggedRef.current = onSessionLogged;

  const loadRecentSessions = () => {
    fetchSessions({ nodeId }).then(setRecentSessions).catch(() => setRecentSessions([]));
  };

  // ---------- auto-stop + save when switching nodes or unmounting ----------
  useEffect(() => {
    return () => {
      const running = activeSessionRef.current;
      if (running) {
        clearActiveSession();
        stopSession(running._id)
          .then(() => onSessionLoggedRef.current?.())
          .catch(() => {});
      }
    };
  }, [nodeId]);

  // ---------- resume from localStorage + verify against backend ----------
  useEffect(() => {
    setError('');
    setInfo('');
    setShowManual(false);
    loadRecentSessions();

    const stored = readActiveSession();

    if (stored && stored.nodeId === nodeId) {
      setActiveSession({ _id: stored.sessionId, startedAt: stored.startedAt });
      setElapsed(Math.floor((Date.now() - new Date(stored.startedAt).getTime()) / 1000));

      fetchSessions({ nodeId })
        .then((sessions) => {
          const stillRunning = sessions.find((s) => s._id === stored.sessionId);
          if (!stillRunning) {
            clearActiveSession();
            setActiveSession(null);
            setElapsed(0);
          }
        })
        .catch(() => {});
    } else {
      setActiveSession(null);
      setElapsed(0);
    }
  }, [nodeId]);

  useEffect(() => {
    if (!activeSession) return;
    const startedAtMs = new Date(activeSession.startedAt).getTime();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtMs) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const handleStart = async () => {
    setError('');
    setInfo('');
    try {
      const session = await startSession(nodeId);
      setActiveSession(session);
      writeActiveSession(session._id, nodeId, session.startedAt);
      onSessionLogged();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not start session.');
    }
  };

  const handleStop = async () => {
    setError('');
    setInfo('');
    try {
      const result = await stopSession(activeSession._id);
      clearActiveSession();
      setActiveSession(null);
      setElapsed(0);
      if (result.discarded) {
        setInfo('That was too short to log — not recorded.');
      }
      onSessionLogged();
      loadRecentSessions();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not stop session.');
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingManual) return; // guards against double-click/double-submit
    setError('');
    setInfo('');
    setIsSubmittingManual(true);
    try {
      await logManualSession({
        nodeId,
        durationMinutes: Number(manualMinutes),
        startedAt: new Date().toISOString(),
      });
      setShowManual(false);
      onSessionLogged();
      loadRecentSessions();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not log session.');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const handleUndoSession = async (sessionId) => {
    try {
      await deleteSession(sessionId);
      onSessionLogged();
      loadRecentSessions();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not remove that session.');
    }
  };

  const handleResetAll = async () => {
    if (!confirm('Reset all logged time for this topic back to zero? This removes every session for it.')) return;
    try {
      await resetNodeSessions(nodeId);
      onSessionLogged();
      loadRecentSessions();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not reset time.');
    }
  };

  return (
    <div className="session-timer">
      {error && <p className="auth-error" style={{ fontSize: 'var(--text-xs)' }}>{error}</p>}
      {info && <p className="text-muted session-info" style={{ fontSize: 'var(--text-xs)' }}>{info}</p>}

      {activeSession ? (
        <div className="session-timer-active">
          <span className="session-timer-clock text-stat">{formatElapsed(elapsed)}</span>
          <button className="btn btn-primary session-stop-btn" onClick={handleStop}>⏹ Stop session</button>
        </div>
      ) : (
        <div className="session-timer-idle">
          <button className="btn btn-primary" onClick={handleStart}>▶ Start studying</button>
          <button className="btn btn-ghost" onClick={() => setShowManual((s) => !s)}>Log time manually</button>
        </div>
      )}

      {showManual && !activeSession && (
        <form className="session-manual-form" onSubmit={handleManualSubmit}>
          <input
            type="number"
            min="1"
            max="1440"
            className="auth-input"
            value={manualMinutes}
            onChange={(e) => setManualMinutes(e.target.value)}
            disabled={isSubmittingManual}
          />
          <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>minutes</span>
          <button type="submit" className="btn btn-primary" style={{ fontSize: 'var(--text-xs)' }} disabled={isSubmittingManual}>
            {isSubmittingManual ? 'Logging…' : 'Log'}
          </button>
        </form>
      )}

      {recentSessions.length > 0 && (
        <div className="session-recent-list">
          <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>Recent sessions</span>
          {recentSessions.slice(0, 5).map((s) => (
            <div key={s._id} className="session-recent-row">
              <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                {s.durationMinutes}m · {s.source === 'manual' ? 'logged' : 'timed'} · {new Date(s.startedAt).toLocaleDateString()}
              </span>
              <button type="button" className="session-undo-btn" onClick={() => handleUndoSession(s._id)}>undo</button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="session-reset-all" onClick={handleResetAll}>
        Reset total time for this topic
      </button>
    </div>
  );
}

export default SessionTimer;