import { ListChecks } from 'lucide-react';
import { Card, EmptyState } from './chartKit.jsx';

const SEGMENTS = [
  { key: 'completed', label: 'Completed', color: 'var(--success)' },
  { key: 'pushed', label: 'Rescheduled', color: 'var(--chart-3)' },
  { key: 'missed', label: 'Missed', color: 'var(--alert)' },
  { key: 'overdue', label: 'Overdue', color: 'color-mix(in srgb, var(--alert) 45%, var(--surface))' },
  { key: 'upcoming', label: 'Upcoming', color: 'var(--ax-border-strong)' },
];

export default function PlanAdherence({ plan }) {
  const total = SEGMENTS.reduce((s, x) => s + (plan?.[x.key] ?? 0), 0);

  if (!plan || total === 0) {
    return (
      <Card icon={ListChecks} title="Plan adherence" sub="How closely you follow your schedule">
        <EmptyState icon={ListChecks} title="No scheduled tasks in this period">
          Once your roadmap is scheduled, you will see how much of the plan you complete on time.
        </EmptyState>
      </Card>
    );
  }

  const rate = plan.adherenceRate;
  const pct = rate === null || rate === undefined ? null : Math.round(rate * 100);

  return (
    <Card icon={ListChecks} title="Plan adherence" sub="Scheduled tasks by outcome">
      <div className="ax-adh-top">
        <div className="ax-adh-score">
          <strong>{pct === null ? '—' : `${pct}%`}</strong>
          <span>{pct === null ? 'nothing due yet' : 'of due tasks completed'}</span>
        </div>
        <div className="ax-adh-note">
          {pct === null
            ? 'Tasks scheduled for the future will count once their day has passed.'
            : pct >= 80 ? 'Strong follow-through. Keep the routine going.'
              : pct >= 50 ? 'Decent, but a few tasks are slipping. Try shorter daily plans.'
                : 'Many tasks are slipping. Consider lowering daily load or moving the deadline.'}
        </div>
      </div>

      <div className="ax-stack" role="img" aria-label="Scheduled tasks by outcome">
        {SEGMENTS.map((s) => {
          const n = plan[s.key] ?? 0;
          return n > 0 ? <i key={s.key} style={{ flexGrow: n, background: s.color }} title={`${s.label}: ${n}`} /> : null;
        })}
      </div>

      <ul className="ax-adh-legend">
        {SEGMENTS.map((s) => (
          <li key={s.key}>
            <span className="ax-dot" style={{ background: s.color }} />
            <span>{s.label}</span>
            <strong>{plan[s.key] ?? 0}</strong>
          </li>
        ))}
      </ul>
    </Card>
  );
}
