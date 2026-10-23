import { useCallback, useEffect, useMemo, useState } from 'react';
import { estimateRoadmap } from '../services/aiSyllabus.api.js';
import { buildEstimateRequest, estimateSignature, indexEstimate } from '../utils/roadmapDraft.js';

const DEBOUNCE_MS = 350;

// Asks the server (no AI, free) how long each topic takes THIS learner and what fits
// the deadline. Runs again, debounced, whenever a level, a time, a kind or a priority
// changes. Typing in a title does not trigger it.
//
//   status: 'idle' (nothing to estimate) | 'loading' (first answer pending)
//           | 'ready' | 'error'
//   fresh:  true only when `data` answers the draft as it is right now
export default function useRoadmapEstimate({ goalId, subjects, defaultLevel, subjectNodeId = null, enabled = true }) {
  const { request, shape } = useMemo(
    () => buildEstimateRequest(subjects, defaultLevel, subjectNodeId),
    [subjects, defaultLevel, subjectNodeId]
  );
  const signature = useMemo(() => estimateSignature(request), [request]);
  const hasTopics = request.subjects.length > 0;

  // `signature` is the draft the `data` answers; `errorFor` is the draft that last failed
  const [state, setState] = useState({ signature: '', data: null, errorFor: '', error: '' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !hasTopics) return undefined;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await estimateRoadmap(goalId, request);
        if (cancelled) return;
        const data = indexEstimate(shape, response);
        setState(
          data
            ? { signature, data, errorFor: '', error: '' }
            : (prev) => ({ ...prev, errorFor: signature, error: 'The time estimate did not match your roadmap. Try again.' })
        );
      } catch (err) {
        if (cancelled) return;
        const message = err.response?.data?.error?.message || 'Could not calculate your study time.';
        setState((prev) => ({ ...prev, errorFor: signature, error: message }));
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `request` and `shape` always belong to `signature`; the signature is the real trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled, hasTopics, goalId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const failed = state.errorFor === signature;
  let status = 'idle';
  if (enabled && hasTopics) {
    if (failed) status = 'error';
    else status = state.data ? 'ready' : 'loading';
  }

  return {
    data: state.data,
    status,
    fresh: status === 'ready' && state.signature === signature,
    error: failed ? state.error : '',
    retry,
  };
}