import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Loader2, CalendarDays, Clock } from 'lucide-react';
import { fetchSessions } from '../../services/sessions.api.js';
import { formatDuration } from '../../utils/formatDuration.js';
import { timeAgo } from '../../utils/timeAgo.js';

const STATUSES = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'needs_revision', label: 'Needs revision' },
  { value: 'completed', label: 'Completed' },
];

const dayLabel = (key) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function TopicPanel({ boot, onStatusChange, onNavigate, onAskAi }) {
  const { node, goal, position, prev, next, schedule, stats } = boot;
  const [sessions, setSessions] = useState(null);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');

  // Refresh the list whenever time is logged
  useEffect(() => {
    let cancelled = false;
    fetchSessions({ nodeId: node._id })
      .then((list) => !cancelled && setSessions(list.slice(0, 5)))
      .catch(() => !cancelled && setSessions([]));
    return () => {
      cancelled = true;
    };
  }, [node._id, node.actualMinutesSpent]);

  const changeStatus = async (value) => {
    if (value === node.status || saving) return;
    setError('');
    setSaving(value);
    try {
      await onStatusChange(value);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not change the status.');
    } finally {
      setSaving(null);
    }
  };

  const estimate = node.estimatedMinutes;
  const spent = node.actualMinutesSpent;
  const pct = estimate > 0 ? Math.min(100, Math.round((spent / estimate) * 100)) : 0;
  const over = estimate > 0 && spent > estimate;

  return (
    <div className="ph-topic-inner">
      <section className="ph-section">
        <div className="ph-goal-chip">
          <span className="ph-dot" style={{ background: goal.color || 'var(--signal)' }} />
          <span>{goal.title}</span>
        </div>
        {position && (
          <p className="ph-muted">
            Topic {position.index} of {position.total}
          </p>
        )}
      </section>

      <section className="ph-section">
        <h4>Status</h4>
        <div className="ph-statuses" role="radiogroup" aria-label="Topic status">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={node.status === s.value}
              className={`ph-status ph-status-${s.value} ${node.status === s.value ? 'ph-status-active' : ''}`}
              onClick={() => changeStatus(s.value)}
              disabled={!!saving}
            >
              {saving === s.value && <Loader2 size={12} className="ph-spin" />} {s.label}
            </button>
          ))}
        </div>
        {error && <p className="ph-error">{error}</p>}
      </section>

      <section className="ph-section">
        <h4>Time</h4>
        <p className="ph-time-line">
          <strong>{formatDuration(spent)}</strong> spent{estimate > 0 ? <> of {formatDuration(estimate)} estimated</> : ' (no estimate yet)'}
        </p>
        {estimate > 0 && (
          <div className="ph-meter" aria-hidden="true">
            <span className={over ? 'ph-meter-over' : ''} style={{ width: `${pct}%` }} />
          </div>
        )}
        {over && <p className="ph-muted">{formatDuration(spent - estimate)} over your estimate.</p>}
        <p className="ph-muted">
          {stats.sessionCount} session{stats.sessionCount === 1 ? '' : 's'}
          {stats.lastStudiedAt ? ` · last studied ${timeAgo(stats.lastStudiedAt)}` : ''}
        </p>
      </section>

      {node.status !== 'completed' && (
        <section className="ph-section">
          <h4>Schedule</h4>
          {schedule ? (
            <p className={`ph-sched ${schedule.overdue ? 'ph-sched-overdue' : ''}`}>
              <CalendarDays size={14} />
              {schedule.overdue ? `Overdue since ${dayLabel(schedule.date)}` : `Planned for ${dayLabel(schedule.date)}`}
            </p>
          ) : (
            <p className="ph-muted">Not on your calendar yet.</p>
          )}
        </section>
      )}

      <section className="ph-section">
        <h4>Recent sessions</h4>
        {!sessions && <div className="skeleton" style={{ height: 40 }} />}
        {sessions && sessions.length === 0 && <p className="ph-muted">No sessions logged yet. Start the timer when you begin.</p>}
        <ul className="ph-sessions">
          {sessions?.map((s) => (
            <li key={s._id}>
              <Clock size={13} />
              <span>
                {new Date(s.startedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              </span>
              <strong>{formatDuration(s.durationMinutes)}</strong>
              {s.source === 'manual' && <em>manual</em>}
            </li>
          ))}
        </ul>
      </section>

      <section className="ph-section">
        <button type="button" className="ph-prepbot" onClick={onAsk}>
            <span className="ph-prepbot-icon"><Sparkles size={16} /></span>
            <span className="ph-prepbot-text">
              <strong>PrepBot</strong>
              <small>Your study partner for this topic</small>
            </span>
        </button>
      </section>

      <section className="ph-section ph-nav-topics">
        <button type="button" className="ph-btn" onClick={() => prev && onNavigate(prev._id)} disabled={!prev} title={prev?.title}>
          <ChevronLeft size={15} /> Previous
        </button>
        <button type="button" className="ph-btn" onClick={() => next && onNavigate(next._id)} disabled={!next} title={next?.title}>
          Next <ChevronRight size={15} />
        </button>
      </section>
    </div>
  );
}

export default TopicPanel;