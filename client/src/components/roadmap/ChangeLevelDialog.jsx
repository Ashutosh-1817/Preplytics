import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, SlidersHorizontal, X } from 'lucide-react';
import { previewRelevel, applyRelevel } from '../../services/aiSyllabus.api.js';
import { LevelPills, FitModeToggle, PlanBanner } from './RoadmapPlanParts.jsx';
import { DEFAULT_LEVEL, levelLabel, needsFitChoice, planView } from '../../utils/roadmapDraft.js';
import { formatDuration } from '../../utils/formatDuration.js';
import './ChangeLevelDialog.css';

const SKIP_TEXT = {
  completed: 'Already completed',
  already_studied: 'Already studied (time kept)',
  locked: 'You set this time yourself',
};

// "I know this better now": rescales the not-yet-studied topics of a saved subject or
// chapter. Nothing is removed. A preview is always shown before anything is saved.
function ChangeLevelDialog({ goalId, node, onClose, onApplied }) {
  const [level, setLevel] = useState(DEFAULT_LEVEL);
  const [mode, setMode] = useState('fit');
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error | saving
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('loading');
    previewRelevel(goalId, node._id, { level, mode })
      .then((data) => {
        if (!live) return;
        setPreview(data);
        setError('');
        setStatus('ready');
      })
      .catch((err) => {
        if (!live) return;
        setError(err.response?.data?.error?.message || 'Could not calculate the new times.');
        setStatus('error');
      });
    return () => {
      live = false;
    };
  }, [goalId, node._id, level, mode]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && status !== 'saving' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, onClose]);

  const fitChoice = Boolean(preview && needsFitChoice(preview.summary));
  const effectiveMode = fitChoice ? mode : 'fit';
  const view = preview ? planView(preview.summary, effectiveMode) : null;
  const totals = preview?.totals;
  const nothingToDo = totals && totals.rescaledCount === 0;
  const canApply = status === 'ready' && !nothingToDo && view?.kind !== 'blocked';

  const apply = async () => {
    setStatus('saving');
    setError('');
    try {
      await applyRelevel(goalId, node._id, { level, mode: effectiveMode });
      await onApplied();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not save the new times.');
      setStatus('ready');
    }
  };

  const rows = preview?.items ?? [];

  return createPortal(
    <div className="cl-backdrop" onMouseDown={(e) => e.target === e.currentTarget && status !== 'saving' && onClose()}>
      <div className="cl-panel" role="dialog" aria-modal="true" aria-label="Change level">
        <div className="cl-head">
          <div className="cl-icon"><SlidersHorizontal size={18} /></div>
          <div className="cl-head-text">
            <h3>Change level: {node.title}</h3>
            <p className="text-muted">
              {preview && Object.keys(preview.currentLevels).length > 0
                ? `Currently: ${Object.entries(preview.currentLevels).map(([k, n]) => `${k === 'unknown' ? 'not recorded' : levelLabel(k)} (${n})`).join(', ')}`
                : 'Pick how well you know it now.'}
            </p>
          </div>
          <button type="button" className="cl-x" aria-label="Close" onClick={onClose} disabled={status === 'saving'}><X size={16} /></button>
        </div>

        <LevelPills value={level} onChange={setLevel} title="How well do you know this now?" />
        {fitChoice && <FitModeToggle mode={mode} onChange={setMode} />}
        <PlanBanner view={view} status={status === 'error' ? 'error' : status === 'loading' && !preview ? 'loading' : 'ok'} error={error} onRetry={() => setLevel((l) => l)} />

        {preview && (
          <div className={`cl-list ${status === 'loading' ? 'cl-stale' : ''}`}>
            {rows.map((it) => (
              <div key={it.nodeId} className={`cl-row ${it.action === 'skip' ? 'cl-row-skip' : ''}`}>
                <div className="cl-row-main">
                  <span className="cl-row-title">{it.title}</span>
                  {it.chapterTitle && <span className="text-muted cl-row-path">{it.chapterTitle}</span>}
                </div>
                {it.action === 'skip' ? (
                  <span className="text-muted cl-row-note">{SKIP_TEXT[it.reason]}</span>
                ) : (
                  <span className="cl-row-time">
                    <span className="text-muted">{formatDuration(it.before)}</span> → <strong>{formatDuration(it.after)}</strong>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {totals && (
          <p className="text-muted cl-foot">
            {nothingToDo
              ? 'Every topic here is already done, studied or set by you, so there is nothing to change.'
              : `${totals.rescaledCount} topics change (${formatDuration(totals.rescaledBefore)} → ${formatDuration(totals.rescaledAfter)}). ${totals.skippedCount} stay as they are. No topic is removed, and your schedule is rebuilt after you confirm.`}
          </p>
        )}
        {error && status !== 'error' && <p className="auth-error">{error}</p>}

        <div className="cl-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={status === 'saving'}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={!canApply}>
            {status === 'saving' && <Loader2 size={15} className="cl-spin" />} Apply new times
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ChangeLevelDialog;