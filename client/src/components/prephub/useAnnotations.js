import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
} from '../../services/annotations.api.js';
import { getErrorMessage } from '../../services/files.api.js';

let tmpCounter = 0;
const withKey = (a) => ({ ...a, _key: a._id });

// Annotations of one PDF. Changes show instantly and are saved in the background;
// a failed save rolls the change back and reports why.
function useAnnotations(fileId) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const itemsRef = useRef(items);
  const pending = useRef(new Map()); // key -> Promise<saved> while a create is in flight
  const chains = useRef(new Map()); // key -> Promise: updates and deletes run in order
  const cache = useRef(new Map()); // page -> last array, so untouched pages keep the same reference

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setItems([]);
    setError('');
    pending.current.clear();
    chains.current.clear();

    fetchAnnotations(fileId)
      .then((list) => {
        if (cancelled) return;
        setItems(list.map(withKey));
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('error');
        setError(getErrorMessage(err, 'Could not load your annotations.'));
      });

    return () => {
      cancelled = true;
    };
  }, [fileId, reloadKey]);

  const realId = useCallback(async (key, fallbackId) => {
    const inFlight = pending.current.get(key);
    return inFlight ? (await inFlight)._id : fallbackId;
  }, []);

  const enqueue = useCallback((key, task) => {
    const previous = chains.current.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    chains.current.set(key, next);
    return next;
  }, []);

  const create = useCallback(
    (payload) => {
      tmpCounter += 1;
      const key = `tmp-${tmpCounter}`;
      const optimistic = {
        _id: key,
        _key: key,
        fileId,
        quote: '',
        comment: '',
        createdAt: new Date().toISOString(),
        ...payload,
      };
      setItems((prev) => [...prev, optimistic]);

      const promise = createAnnotation({ fileId, ...payload }).then((saved) => {
        setItems((prev) => prev.map((a) => (a._key === key ? { ...saved, _key: key } : a)));
        return saved;
      });
      pending.current.set(key, promise);
      promise
        .catch((err) => {
          setItems((prev) => prev.filter((a) => a._key !== key));
          setError(getErrorMessage(err, 'Could not save that annotation.'));
        })
        .finally(() => pending.current.delete(key));

      return key;
    },
    [fileId]
  );

  const update = useCallback(
    (key, patch) => {
      const current = itemsRef.current.find((a) => a._key === key);
      if (!current) return;
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, current[k]]));

      setItems((prev) => prev.map((a) => (a._key === key ? { ...a, ...patch } : a)));

      enqueue(key, async () => updateAnnotation(await realId(key, current._id), patch)).catch((err) => {
        setItems((prev) => prev.map((a) => (a._key === key ? { ...a, ...before } : a)));
        setError(getErrorMessage(err, 'Could not update that annotation.'));
      });
    },
    [enqueue, realId]
  );

  const remove = useCallback(
    (key) => {
      const current = itemsRef.current.find((a) => a._key === key);
      if (!current) return;

      setItems((prev) => prev.filter((a) => a._key !== key));

      enqueue(key, async () => deleteAnnotation(await realId(key, current._id))).catch((err) => {
        if (err?.response?.status === 404) return; // already gone
        setItems((prev) => (prev.some((a) => a._key === key) ? prev : [...prev, current]));
        setError(getErrorMessage(err, 'Could not delete that annotation.'));
      });
    },
    [enqueue, realId]
  );

  const byPage = useMemo(() => {
    const groups = new Map();
    for (const a of items) {
      if (!groups.has(a.page)) groups.set(a.page, []);
      groups.get(a.page).push(a);
    }
    const next = new Map();
    groups.forEach((list, page) => {
      const old = cache.current.get(page);
      next.set(page, old && old.length === list.length && old.every((x, i) => x === list[i]) ? old : list);
    });
    cache.current = next;
    return next;
  }, [items]);

  const clearError = useCallback(() => setError(''), []);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { items, byPage, status, error, clearError, create, update, remove, reload };
}

export default useAnnotations;