import { CheckCircle2, AlertTriangle, Ban, Gauge, Loader2, Lock, RefreshCw, X } from 'lucide-react';
import { formatDuration } from '../../utils/formatDuration.js';
import { LEVEL_OPTIONS, KIND_OPTIONS, PRIORITY_OPTIONS } from '../../utils/roadmapDraft.js';
import Select from '../Select.jsx';

// Small pieces shared by the roadmap review screens (GoalRoadmapWizard and
// SyllabusPreviewModal). Styles live in SyllabusPreviewModal.css (rp-* classes).

const fmt = formatDuration;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------- Level pickers ----------

// The five-step "how well do you know this?" control with a one-line explanation
export function LevelPills({ value, onChange, title }) {
  const current = LEVEL_OPTIONS.find((l) => l.id === value) ?? LEVEL_OPTIONS[1];

  return (
    <div className="rp-levels">
      <div className="rp-levels-title" id="rp-levels-title">{title}</div>
      <div className="rp-pills" role="radiogroup" aria-labelledby="rp-levels-title">
        {LEVEL_OPTIONS.map((level) => (
          <button
            key={level.id}
            type="button"
            role="radio"
            aria-checked={level.id === value}
            className={`rp-pill ${level.id === value ? 'is-on' : ''}`}
            onClick={() => onChange(level.id)}
          >
            {level.label}
          </button>
        ))}
      </div>
      <p className="rp-hint">{current.hint} Every topic stays on your roadmap; only the time changes.</p>
    </div>
  );
}

// Compact per-subject / per-chapter override. An empty value means "same as the parent".
export function LevelSelect({ value, onChange, inheritLabel, ariaLabel }) {
  return (
    <Select variant="compact" aria-label={ariaLabel} value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{inheritLabel}</option>
      {LEVEL_OPTIONS.map((level) => (
        <option key={level.id} value={level.id}>{level.label}</option>
      ))}
    </Select>
  );
}

// "Fit to my deadline" vs "Keep full time": only shown when the deadline is tight
export function FitModeToggle({ mode, onChange }) {
  return (
    <div className="rp-fit" role="radiogroup" aria-label="How to handle a tight deadline">
      <button type="button" role="radio" aria-checked={mode === 'fit'} className={mode === 'fit' ? 'is-on' : ''} onClick={() => onChange('fit')}>
        Fit to my deadline
      </button>
      <button type="button" role="radio" aria-checked={mode === 'comfortable'} className={mode === 'comfortable' ? 'is-on' : ''} onClick={() => onChange('comfortable')}>
        Keep full time
      </button>
    </div>
  );
}

// ---------- The deadline banner ----------

export function PlanBanner({ view, status, error, onRetry, waiting = false }) {
  if (status === 'error') {
    return (
      <div className="capacity-banner capacity-over">
        <div className="capacity-row">
          <AlertTriangle size={15} />
          <span>{error || 'Could not calculate your study time.'}</span>
        </div>
        <button type="button" className="syllabus-retry-btn" onClick={onRetry}>
          <RefreshCw size={13} /> Try again
        </button>
      </div>
    );
  }

  if (waiting || !view) {
    return (
      <div className="capacity-banner capacity-checking">
        <div className="capacity-row">
          <Loader2 size={15} className="syllabus-spin" />
          <span>{waiting ? 'Calculating your study time once every part has loaded…' : 'Calculating your study time…'}</span>
        </div>
      </div>
    );
  }

  if (view.kind === 'no-deadline') {
    return (
      <p className="text-muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>
        This goal has no deadline, so there's no capacity limit. Times below are adjusted to your level.
      </p>
    );
  }

  const days = plural(view.days, 'day');
  const meter = Math.min(100, (view.totalMinutes / Math.max(1, view.availableMinutes)) * 100);

  return (
    <div className={`capacity-banner capacity-${view.kind}`}>
      {view.kind === 'ok' && (
        <div className="capacity-row">
          <CheckCircle2 size={15} />
          <span>
            <span className="capacity-strong">Fits your schedule.</span> {fmt(view.totalMinutes)} of {fmt(view.availableMinutes)} available over the next {days}.
          </span>
        </div>
      )}

      {view.kind === 'squeezed' && (
        <div className="capacity-row">
          <Gauge size={15} />
          <div className="capacity-lines">
            <span>
              <span className="capacity-strong">Tight deadline, so some topics are shortened.</span> Every topic is kept.{' '}
              {plural(view.compressedCount, 'topic')} shortened to fit: {fmt(view.comfortableMinutes)} → {fmt(view.totalMinutes)}.
            </span>
            <span className="capacity-note">Core topics keep the most time; optional topics give up the most. Times you typed yourself are never changed.</span>
          </div>
        </div>
      )}

      {view.kind === 'short' && (
        <div className="capacity-row">
          <AlertTriangle size={15} />
          <div className="capacity-lines">
            <span>
              <span className="capacity-strong">Very tight.</span> Even at the shortest sensible time this needs {fmt(view.minimumNeededMinutes)}, but only{' '}
              {fmt(view.availableMinutes)} is available over {days}. Every topic is still included.
            </span>
            <span className="capacity-note">
              Raise your daily time to <span className="capacity-strong">{fmt(view.requiredDailyAtMinimum)}</span>
              {view.extraDaysAtMinimum > 0 && <> or extend the deadline by about {plural(view.extraDaysAtMinimum, 'day')}</>} to cover it.
            </span>
          </div>
        </div>
      )}

      {view.kind === 'over' && (
        <div className="capacity-row">
          <AlertTriangle size={15} />
          <div className="capacity-lines">
            <span>
              <span className="capacity-strong">Not enough time at full length.</span> This needs {fmt(view.totalMinutes)}, but only{' '}
              {fmt(view.availableMinutes)} is available over {days}.
            </span>
            <span className="capacity-note">
              Raise your daily time to <span className="capacity-strong">{fmt(view.requiredDailyComfortable)}</span>, or switch to “Fit to my deadline”.
            </span>
          </div>
        </div>
      )}

      {view.kind === 'blocked' && (
        <div className="capacity-row">
          <Ban size={15} />
          <div className="capacity-lines">
            <span>
              <span className="capacity-strong">Too much for this deadline.</span> Finishing in {days} would take {fmt(view.requiredDailyMinutes)} every
              day, over the {view.maxDailyMinutes / 60}-hour daily limit, so a schedule can't be built.
            </span>
            <span className="capacity-note">
              Extend the deadline with Edit goal, or remove topics you don't want to study (at least {fmt(view.hardLimitOverBy)}).
            </span>
          </div>
        </div>
      )}

      <div className="capacity-stats">
        <span>Planned <strong>{fmt(view.totalMinutes)}</strong></span>
        {view.existingMinutes > 0 && <span>Already on roadmap <strong>{fmt(view.existingMinutes)}</strong></span>}
        <span>Available <strong>{fmt(view.availableMinutes)}</strong></span>
      </div>
      <div className="capacity-meter">
        <div className="capacity-meter-fill" style={{ width: `${meter}%` }} />
      </div>
    </div>
  );
}


  // ---------- Failed items (always shown at the TOP of the review) ----------

  // failures: [{ key, label, message }]. `kind` is 'subject' or 'chapter' (wording only).
  export function FailedBanner({ failures, kind, onRetry, onRemove, onRetryAll }) {
    if (failures.length === 0) return null;

    return (
      <div className="rp-failed" role="alert">
        <div className="rp-failed-head">
          <AlertTriangle size={16} />
          <strong>
            {failures.length === 1
              ? `This ${kind} could not be generated`
              : `${failures.length} ${kind}s could not be generated`}
          </strong>
          {failures.length > 1 && (
            <button type="button" className="syllabus-retry-btn" onClick={onRetryAll}>
              <RefreshCw size={13} /> Retry all
            </button>
          )}
        </div>
        <ul className="rp-failed-list">
          {failures.map((f) => (
            <li key={f.key}>
              <div className="rp-failed-name">
                <span className="rp-failed-title">“{f.label || 'Untitled'}”</span>
                <span className="rp-failed-why">{f.message}</span>
              </div>
              <div className="rp-failed-actions">
                <button type="button" className="syllabus-retry-btn" onClick={() => onRetry(f.key)}>
                  <RefreshCw size={13} /> Retry
                </button>
                <button type="button" className="rp-cancel-btn" onClick={() => onRemove(f.key)}>
                  <X size={13} /> Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

// ---------- One topic ----------

// minutes: what to show in the box. info: the server's answer for this topic (or undefined).
// ---------- One topic ----------

// minutes: what to show in the box. info: the server's answer for this topic (or undefined).
export function TopicRow({ topic, minutes, info, mode, locked, onTitle, onMinutes, onUnlock, onKind, onPriority, onRemove }) {
  let note = null;
  if (locked) {
    note = <span className="rp-note rp-note-locked">Your time. It is never changed.</span>;
  } else if (info && mode === 'fit' && info.fitted < info.comfortable) {
    note = <span className="rp-note rp-note-squeezed">Shortened from {fmt(info.comfortable)} to fit your deadline</span>;
  } else if (info && info.comfortable !== info.baseMinutes) {
    note = <span className="rp-note">Standard {fmt(info.baseMinutes)}, adjusted to your level</span>;
  }

  return (
    <div className="rp-topic">
      <div className="syllabus-subtopic-row">
        <input
          className="syllabus-subtopic-title"
          value={topic.title}
          aria-label="Topic title"
          onChange={(e) => onTitle(e.target.value)}
        />
        <input
          type="number"
          min="5"
          step="5"
          className="syllabus-subtopic-minutes"
          aria-label={`Minutes for ${topic.title || 'this topic'}`}
          value={minutes}
          onChange={(e) => onMinutes(Number(e.target.value))}
        />
        <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>min</span>

        {/* Kind and Priority selects moved up into the main row */}
        <Select variant="compact" aria-label="Kind of study" value={topic.kind} onChange={(e) => onKind(e.target.value)}>
          {KIND_OPTIONS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </Select>
        <Select variant="compact" aria-label="Priority" value={topic.priority} onChange={(e) => onPriority(e.target.value)}>
          {PRIORITY_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </Select>

        {locked && (
          <button type="button" className="syllabus-delete rp-lock" title="Locked to your time. Click to let the app adjust it again." onClick={onUnlock}>
            <Lock size={13} />
          </button>
        )}
        <button type="button" className="syllabus-delete" title="Remove this topic from the roadmap" aria-label="Remove topic" onClick={onRemove}>
          <X size={14} />
        </button>
      </div>

      {/* Meta block simplified to only render the note if it exists */}
      {note && <div className="rp-meta">{note}</div>}
    </div>
  );
}