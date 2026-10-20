import { useCallback, useEffect, useRef, useState } from 'react';
import { updateNote, fetchNote } from '../../services/notes.api.js';
import { isNoteConflict } from '../../services/prephub.api.js';

// Module-level on purpose: switching away from a note and back remounts the
// editor, but its save must stay ordered with the previous instance's save.
const tokens = new Map(); // noteId -> latest updatedAt we know the server has
const chains = new Map(); // noteId -> tail of the save queue

const seedToken = (noteId, updatedAt) => {
  if (!updatedAt) return;
  const current = tokens.get(noteId);
  if (!current || new Date(updatedAt) > new Date(current)) tokens.set(noteId, updatedAt);
};

const enqueue = (noteId, task) => {
  const tail = chains.get(noteId) ?? Promise.resolve();
  const next = tail.then(task, task); // runs even if the previous save failed
  chains.set(noteId, next);
  const cleanup = () => {
    if (chains.get(noteId) === next) chains.delete(noteId);
  };
  next.then(cleanup, cleanup);
  return next;
};

// status: saved | dirty | saving | error | conflict
function useNoteAutosave({ noteId, updatedAt, onSaved, delay = 1200 }) {
  const [status, setStatus] = useState('saved');

  const pendingRef = useRef(null);
  const timerRef = useRef(null);
  const retryRef = useRef(null);
  const runningRef = useRef(null);
  const blockedRef = useRef(false); // true while a conflict is unresolved
  const mountedRef = useRef(true);
  const runRef = useRef(null);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    onSavedRef.current = onSaved;
  });

  useEffect(() => {
    seedToken(noteId, updatedAt);
  }, [noteId, updatedAt]);

  const safeSet = useCallback((value) => {
    if (mountedRef.current) setStatus(value);
  }, []);

  const run = useCallback(() => {
    if (runningRef.current) return runningRef.current;

    let finished = false;

    const job = (async () => {
      try {
        while (pendingRef.current && !blockedRef.current) {
          const payload = pendingRef.current;
          pendingRef.current = null;
          safeSet('saving');

          try {
            const saved = await enqueue(noteId, async () => {
              const result = await updateNote(noteId, { ...payload, baseUpdatedAt: tokens.get(noteId) });
              tokens.set(noteId, result.updatedAt);
              return result;
            });
            onSavedRef.current?.(saved);
          } catch (err) {
            // Put the payload back, under anything typed in the meantime
            pendingRef.current = { ...payload, ...(pendingRef.current ?? {}) };

            if (isNoteConflict(err)) {
              blockedRef.current = true;
              safeSet('conflict');
            } else {
              safeSet('error');
              clearTimeout(retryRef.current);
              retryRef.current = setTimeout(() => runRef.current?.(), 5000);
            }
            return;
          }
        }
        if (!pendingRef.current && !blockedRef.current) safeSet('saved');
      } finally {
        finished = true;
        runningRef.current = null;
      }
    })();

    if (!finished) runningRef.current = job;
    return job;
  }, [noteId, safeSet]);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const schedule = useCallback(
    (payload) => {
      pendingRef.current = { ...(pendingRef.current ?? {}), ...payload };
      clearTimeout(retryRef.current);
      clearTimeout(timerRef.current);
      if (blockedRef.current) return;
      safeSet('dirty');
      timerRef.current = setTimeout(() => runRef.current?.(), delay);
    },
    [delay, safeSet]
  );

  const flush = useCallback(() => {
    clearTimeout(timerRef.current);
    clearTimeout(retryRef.current);
    if (pendingRef.current) return runRef.current?.() ?? Promise.resolve();
    return runningRef.current ?? Promise.resolve();
  }, []);

  // Save when the tab is hidden, warn when closing with unsaved changes, flush on unmount
  useEffect(() => {
    mountedRef.current = true;

    const onVisibility = () => {
      if (document.hidden) flush();
    };
    const onBeforeUnload = (e) => {
      if (pendingRef.current || runningRef.current) {
        flush();
        e.preventDefault();
        e.returnValue = '';
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      flush();
      mountedRef.current = false;
    };
  }, [flush]);

  // "Keep my version": adopt the server's current token, then save my edits over it
  const keepMine = useCallback(async () => {
    try {
      const fresh = await fetchNote(noteId);
      tokens.set(noteId, fresh.updatedAt);
      blockedRef.current = false;
      safeSet('dirty');
      await runRef.current?.();
    } catch {
      safeSet('conflict');
    }
  }, [noteId, safeSet]);

  // "Load the latest": drop my unsaved edits and return the server's note
  const loadLatest = useCallback(async () => {
    const fresh = await fetchNote(noteId);
    pendingRef.current = null;
    blockedRef.current = false;
    tokens.set(noteId, fresh.updatedAt);
    safeSet('saved');
    return fresh;
  }, [noteId, safeSet]);

  const retry = useCallback(() => runRef.current?.(), []);

  return { status, schedule, flush, keepMine, loadLatest, retry };
}

export default useNoteAutosave;