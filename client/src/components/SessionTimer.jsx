import { useState, useEffect, useRef } from 'react';
import {
  startSession,
  stopSession,
  logManualSession,
  fetchSessions,
  fetchActiveSession,
  getSessionConflict,
  deleteSession,
  resetNodeSessions,
} from '../services/sessions.api.js';
import { readActiveSession, writeActiveSession, clearActiveSession } from '../utils/activeSessionStorage.js';
import { consumeSessionHandoff } from '../utils/sessionHandoff.js';
import SessionConflictDialog from './SessionConflictDialog.jsx';
import './SessionTimer.css';

const formatElapsed = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
};

const formatStartedAt = (iso) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? `today at ${time}`
    : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
};

// Sessions this component has asked the server to stop, but which the server
// may not have finished stopping yet. When you switch topics the old timer is
// stopped in the background; this stops the new topic's "what's running?"
// check from mistaking that dying session for a different one.
const stoppingSessionIds = new Set();

function SessionTimer({ nodeId, onSessionLogged }) {
  const [activeSession, setActiveSession] = useState(null);
  const [otherSession, setOtherSession] = useState(null); // a timer running on a DIFFERENT topic
  const [conflict, setConflict] = useState(null); // opens the "close it and start this one?" dialog
  const [isStarting, setIsStarting] = useState(false);
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

  useEffect(() => {
    onSessionLoggedRef.current = onSessionLogged;
  });

  const loadRecentSessions = () => {
    fetchSessions({ nodeId }).then(setRecentSessions).catch(() => setRecentSessions([]));
  };

  // Shows the timer for a session that is running on THIS topic
  const adoptRunningSession = (running) => {
    setActiveSession({ _id: running.sessionId, startedAt: running.startedAt });
    setElapsed(Math.max(0, Math.floor((Date.now() - new Date(running.startedAt).getTime()) / 1000)));
    setOtherSession(null);
    writeActiveSession(running.sessionId, running.nodeId, running.startedAt);
  };

  // ---------- auto-stop + save when switching nodes or unmounting ----------
  useEffect(() => {
    return () => {
      const running = activeSessionRef.current;
      if (running) {
        if (consumeSessionHandoff(nodeId)) return;
        clearActiveSession();
        stoppingSessionIds.add(running._id);
        stopSession(running._id)
          .then(() => onSessionLoggedRef.current?.())
          .catch(() => {})
          .finally(() => stoppingSessionIds.delete(running._id));
      }
    };
  }, [nodeId]);

  // ---------- find out what is REALLY running (the server is the source of truth) ----------
  useEffect(() => {
    let cancelled = false;

    setError('');
    setInfo('');
    setShowManual(false);
    setConflict(null);
    setOtherSession(null);
    loadRecentSessions();

    // Show a remembered timer instantly while the server confirms it
    const stored = readActiveSession();
    if (stored && stored.nodeId === nodeId) {
      setActiveSession({ _id: stored.sessionId, startedAt: stored.startedAt });
      setElapsed(Math.floor((Date.now() - new Date(stored.startedAt).getTime()) / 1000));
    } else {
      setActiveSession(null);
      setElapsed(0);
    }

    fetchActiveSession()
      .then((found) => {
        if (cancelled) return;

        // The old topic's timer is still being stopped in the background: ignore it
        const running = found && stoppingSessionIds.has(found.sessionId) ? null : found;

        if (!running) {
          clearActiveSession();
          setActiveSession(null);
          setElapsed(0);
        } else if (running.nodeId === nodeId) {
          adoptRunningSession(running);
        } else {
          // Running, but on another topic: say so up front instead of failing later
          writeActiveSession(running.sessionId, running.nodeId, running.startedAt);
          setActiveSession(null);
          setElapsed(0);
          setOtherSession(running);
        }
      })
      .catch(() => {
        // Offline or a failed request: keep showing what we remembered
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  useEffect(() => {
    if (!activeSession) return;
    const startedAtMs = new Date(activeSession.startedAt).getTime();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtMs) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  // force = false: the first attempt.
  // force = true: after the user said "Yes, close the other one".
  const attemptStart = async (force = false) => {
    setError('');
    setInfo('');
    setIsStarting(true);

    try {
      const session = await startSession(nodeId, { force });
      setActiveSession(session);
      setElapsed(0);
      setOtherSession(null);
      setConflict(null);
      writeActiveSession(session._id, nodeId, session.startedAt);
      onSessionLoggedRef.current?.();
    } catch (err) {
      const running = getSessionConflict(err);

      if (running && running.nodeId === nodeId) {
        // Already running on THIS topic (e.g. started in another tab): just show it
        setConflict(null);
        adoptRunningSession(running);
      } else if (running) {
        // Running on another topic: ask before closing it
        setConflict(running);
      } else {
        setConflict(null);
        setError(err.response?.data?.error?.message || 'Could not start session.');
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleStart = () => attemptStart(false);

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
      onSessionLoggedRef.current?.();
      loadRecentSessions();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not stop session.');
    }
  };

  // Stops the timer that is running on a different topic
  const handleStopOther = async () => {
    setError('');
    setInfo('');
    try {
      const result = await stopSession(otherSession.sessionId);
      clearActiveSession();
      setOtherSession(null);
      setInfo(result.discarded ? 'That timer was too short to log — not recorded.' : 'Stopped it and saved the time.');
      onSessionLoggedRef.current?.();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not stop that session.');
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
      onSessionLoggedRef.current?.();
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
      onSessionLoggedRef.current?.();
      loadRecentSessions();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not remove that session.');
    }
  };

  const handleResetAll = async () => {
    if (!confirm('Reset all logged time for this topic back to zero? This removes every session for it.')) return;
    try {
      await resetNodeSessions(nodeId);
      onSessionLoggedRef.current?.();
      loadRecentSessions();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not reset time.');
    }
  };

  return (
    <div className="session-timer">
      {error && <p className="auth-error" style={{ fontSize: 'var(--text-xs)' }}>{error}</p>}
      {info && <p className="text-muted session-info" style={{ fontSize: 'var(--text-xs)' }}>{info}</p>}

      {otherSession && !activeSession && (
        <div className="session-other" role="status">
          <div className="session-other-text">
            <strong>
              A timer is running on {otherSession.nodeTitle ? `“${otherSession.nodeTitle}”` : 'a topic that no longer exists'}
              {otherSession.goalTitle ? ` in “${otherSession.goalTitle}”` : ''}
            </strong>
            <span>Started {formatStartedAt(otherSession.startedAt)}</span>
          </div>
          <button type="button" className="btn btn-ghost session-other-btn" onClick={handleStopOther}>
            Stop it
          </button>
        </div>
      )}

      {activeSession ? (
        <div className="session-timer-active">
          <span className="session-timer-clock text-stat">{formatElapsed(elapsed)}</span>
          <button className="btn btn-primary session-stop-btn" onClick={handleStop}>⏹ Stop session</button>
        </div>
      ) : (
        <div className="session-timer-idle">
          <button className="btn btn-primary" onClick={handleStart} disabled={isStarting}>▶ Start studying</button>
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

      {conflict && (
        <SessionConflictDialog
          conflict={conflict}
          onConfirm={() => attemptStart(true)}
          onCancel={() => setConflict(null)}
        />
      )}
    </div>
  );
}

export default SessionTimer;