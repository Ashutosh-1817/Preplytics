import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Square, Loader2 } from 'lucide-react';
import { startSession, stopSession, fetchActiveSession, getSessionConflict } from '../../services/sessions.api.js';
import { readActiveSession, writeActiveSession, clearActiveSession } from '../../utils/activeSessionStorage.js';
import { consumeSessionHandoff, clearSessionHandoff } from '../../utils/sessionHandoff.js';
import SessionConflictDialog from '../SessionConflictDialog.jsx';
import useIdleDetector from './useIdleDetector.js';
import '../ConfirmDialog.css';

const IDLE_MS = 15 * 60 * 1000; // no activity for this long -> "still studying?"
const IDLE_AUTO_TRIM_MS = 10 * 60 * 1000; // unanswered this long -> stop and trim automatically

// Sessions this component asked the server to stop but that may not be stopped
// yet (moving between topics). Stops the next topic mistaking one for "another timer".
const stopping = new Set();

const formatElapsed = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
};

const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function PrepHubTimer({ nodeId, nodeTitle, onChanged }) {
  const [active, setActive] = useState(null); // { _id, startedAt }
  const [other, setOther] = useState(null); // a timer running on a DIFFERENT topic
  const [conflict, setConflict] = useState(null);
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [idle, setIdle] = useState(null); // { since } while the "still studying?" dialog is open

  const activeRef = useRef(null);
  const idleRef = useRef(null);
  const onChangedRef = useRef(onChanged);
  const stopNowRef = useRef(null);

  useEffect(() => {
    activeRef.current = active;
    idleRef.current = idle?.since ?? null;
    onChangedRef.current = onChanged;
  });

  const adopt = useCallback(
    (running) => {
      setActive({ _id: running.sessionId, startedAt: running.startedAt });
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(running.startedAt).getTime()) / 1000)));
      setOther(null);
      writeActiveSession(running.sessionId, running.nodeId, running.startedAt);
    },
    []
  );

  // ---------- what is REALLY running? (the server is the source of truth) ----------
  useEffect(() => {
    let cancelled = false;
    let recheck;
    let rechecked = false;

    clearSessionHandoff(); // we are the receiving screen now

    const stored = readActiveSession();
    if (stored && stored.nodeId === nodeId) {
      setActive({ _id: stored.sessionId, startedAt: stored.startedAt });
      setElapsed(Math.floor((Date.now() - new Date(stored.startedAt).getTime()) / 1000));
    }

    const check = () =>
      fetchActiveSession()
        .then((found) => {
          if (cancelled) return;
          const running = found && stopping.has(found.sessionId) ? null : found;

          if (!running) {
            clearActiveSession();
            setActive(null);
            setElapsed(0);
            setOther(null);
          } else if (running.nodeId === nodeId) {
            adopt(running);
          } else {
            writeActiveSession(running.sessionId, running.nodeId, running.startedAt);
            setActive(null);
            setElapsed(0);
            setOther(running);
            // The previous topic's timer may still be stopping: look once more shortly
            if (!rechecked) {
              rechecked = true;
              recheck = setTimeout(check, 1500);
            }
          }
        })
        .catch(() => {
          // offline: keep showing what we remembered
        });

    check();

    return () => {
      cancelled = true;
      clearTimeout(recheck);
    };
  }, [nodeId, adopt]);

  // ---------- leaving: stop and save (unless handing the session to the roadmap) ----------
  useEffect(
    () => () => {
      const running = activeRef.current;
      if (!running) return;
      if (consumeSessionHandoff(nodeId)) return;

      const trimTo = idleRef.current; // leaving while "still studying?" was open: trim to last activity
      clearActiveSession();
      stopping.add(running._id);
      stopSession(running._id, trimTo ? { endedAt: new Date(trimTo).toISOString() } : {})
        .catch(() => {})
        .finally(() => stopping.delete(running._id));
    },
    [nodeId]
  );

  // ---------- clock + tab title ----------
  useEffect(() => {
    if (!active) return undefined;
    const startedAtMs = new Date(active.startedAt).getTime();
    const previousTitle = document.title;

    const tick = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      setElapsed(seconds);
      document.title = `${formatElapsed(seconds)} · ${nodeTitle}`;
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => {
      clearInterval(interval);
      document.title = previousTitle;
    };
  }, [active, nodeTitle]);

  // ---------- start / stop ----------
  const attemptStart = async (force = false) => {
    setError('');
    setInfo('');
    setStarting(true);

    try {
      const session = await startSession(nodeId, { force });
      setActive({ _id: session._id, startedAt: session.startedAt });
      setElapsed(0);
      setOther(null);
      setConflict(null);
      writeActiveSession(session._id, nodeId, session.startedAt);
      onChangedRef.current?.();
    } catch (err) {
      const running = getSessionConflict(err);
      if (running && running.nodeId === nodeId) {
        setConflict(null);
        adopt(running);
      } else if (running) {
        setConflict(running);
      } else {
        setConflict(null);
        setError(err.response?.data?.error?.message || 'Could not start the session.');
      }
    } finally {
      setStarting(false);
    }
  };

  // endedAtMs = trim the session to that moment (idle check); omit to stop now
  const stopNow = async (endedAtMs = null) => {
    const running = activeRef.current;
    if (!running) return;
    setError('');
    setInfo('');

    try {
      const result = await stopSession(running._id, endedAtMs ? { endedAt: new Date(endedAtMs).toISOString() } : {});
      clearActiveSession();
      setActive(null);
      setElapsed(0);
      setIdle(null);
      if (result.discarded) setInfo('Too short to log, so it was not recorded.');
      else if (endedAtMs) setInfo(`Stopped at ${clock(endedAtMs)}, your last activity.`);
      onChangedRef.current?.();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not stop the session.');
    }
  };

  useEffect(() => {
    stopNowRef.current = stopNow;
  });

  const handleStopOther = async () => {
    setError('');
    try {
      await stopSession(other.sessionId);
      clearActiveSession();
      setOther(null);
      setInfo('Stopped the other timer and saved its time.');
      onChangedRef.current?.();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not stop that timer.');
    }
  };

  // ---------- idle check ----------
  useIdleDetector({
    enabled: !!active && !idle,
    idleMs: IDLE_MS,
    onIdle: (since) => setIdle({ since }),
  });

  // Nobody answered "still studying?": stop and trim automatically
  useEffect(() => {
    if (!idle) return undefined;
    const timer = setTimeout(() => stopNowRef.current?.(idle.since), IDLE_AUTO_TRIM_MS);
    return () => clearTimeout(timer);
  }, [idle]);

  return (
    <div className="ph-timer">
      {(error || info) && (
        <span className={`ph-timer-note ${error ? 'ph-timer-note-error' : ''}`} role="status">
          {error || info}
        </span>
      )}

      {other && !active && (
        <span className="ph-timer-other">
          Timer running on {other.nodeTitle ? `“${other.nodeTitle}”` : 'another topic'}
          <button type="button" className="ph-link-btn" onClick={handleStopOther}>
            Stop it
          </button>
        </span>
      )}

      {active ? (
        <>
          <span className="ph-timer-clock" aria-live="off">
            <span className="ph-pulse" aria-hidden="true" />
            {formatElapsed(elapsed)}
          </span>
          <button type="button" className="ph-btn ph-btn-stop" onClick={() => stopNow()}>
            <Square size={14} fill="currentColor" /> Stop
          </button>
        </>
      ) : (
        <button type="button" className="ph-btn ph-btn-primary" onClick={() => attemptStart(false)} disabled={starting}>
          {starting ? <Loader2 size={15} className="ph-spin" /> : <Play size={15} fill="currentColor" />} Start session
        </button>
      )}

      {conflict && (
        <SessionConflictDialog
          conflict={conflict}
          onConfirm={() => attemptStart(true)}
          onCancel={() => setConflict(null)}
        />
      )}

      {idle &&
        createPortal(
          <div className="confirm-backdrop">
            <div className="confirm-panel" role="alertdialog" aria-modal="true" aria-label="Still studying?">
              <h3 className="confirm-title">Still studying?</h3>
              <p className="confirm-message">
                No activity since <strong>{clock(idle.since)}</strong> ({Math.max(1, Math.round((Date.now() - idle.since) / 60000))} min
                ago). Your timer is still running. Keep that time, or stop the session at your last activity?
              </p>
              <div className="confirm-actions">
                <button type="button" className="btn btn-ghost" onClick={() => stopNow(idle.since)}>
                  Stop at {clock(idle.since)}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setIdle(null)}>
                  Yes, keep going
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default PrepHubTimer;