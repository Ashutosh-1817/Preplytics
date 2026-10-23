import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CalendarClock, Loader2, X } from 'lucide-react';
import { regenerateSchedule } from '../services/calendar.api.js';
import { formatDuration } from '../utils/formatDuration.js';
import './CatchUpDialog.css';

function CatchUpDialog({ goalId, preview, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const blocked = preview.exceedsHardLimit;
  const tight = preview.isOverCapacity && !blocked;

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      await regenerateSchedule(goalId);
      await onDone();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not reschedule. Please try again.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="cu-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="cu-panel" role="dialog" aria-modal="true" aria-label="Catch up">
        <div className="cu-head">
          <div className="cu-icon"><CalendarClock size={20} /></div>
          <div>
            <h3 className="cu-title">Catch up on missed topics</h3>
            <p className="text-muted cu-sub">
              {preview.missedCount} {preview.missedCount === 1 ? 'topic' : 'topics'} ({formatDuration(preview.missedMinutes)}) from past days {preview.missedCount === 1 ? 'was' : 'were'} not completed.
            </p>
          </div>
          <button type="button" className="cu-x" aria-label="Close" onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>

        <ul className="cu-list">
          {preview.missed.map((m) => (
            <li key={m.nodeId} className="cu-item">
              <div className="cu-item-main">
                <span className="cu-item-title">{m.title}</span>
                <span className="text-muted cu-item-path">{[m.subjectTitle, m.chapterTitle].filter(Boolean).join(' › ')}</span>
              </div>
              <div className="cu-item-side">
                <span>{formatDuration(m.minutes)}</span>
                <span className="text-muted">{m.daysLate} {m.daysLate === 1 ? 'day' : 'days'} late</span>
              </div>
            </li>
          ))}
        </ul>

        <p className="cu-explain">
          Catch up keeps every topic and spreads everything unfinished ({formatDuration(preview.remainingMinutes)}) over your next {preview.days} {preview.days === 1 ? 'day' : 'days'}. Past days stay as a record and are not changed.
        </p>

        {blocked && (
          <div className="cu-warn cu-warn-bad">
            <AlertTriangle size={15} />
            <span>
              This cannot fit before your deadline even at the daily limit ({formatDuration(preview.maxDailyMinutes)}). Extend the deadline with Edit goal, or use Change level on subjects you now know better to shorten their time.
            </span>
          </div>
        )}
        {tight && (
          <div className="cu-warn">
            <AlertTriangle size={15} />
            <span>
              This needs about {formatDuration(preview.requiredDailyMinutes)} a day, above your usual {formatDuration(preview.dailyCapacityMinutes)}. You can still catch up, or use Change level / raise your daily time first.
            </span>
          </div>
        )}
        {error && <p className="auth-error">{error}</p>}

        <div className="cu-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Not now</button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={busy || blocked}>
            {busy && <Loader2 size={15} className="cu-spin" />} Reschedule my missed topics
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default CatchUpDialog;