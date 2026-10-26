import { Flag, CalendarClock } from 'lucide-react';
import { Card, dayLabel, fmtMin } from './chartKit.jsx';

const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

export default function PaceForecast({ burndown: b }) {
  if (!b?.available) return null;

  const start = b.points[0]?.date ?? b.todayKey;
  const spanDays = Math.max(1, daysBetween(start, b.deadline));
  const elapsed = Math.min(100, Math.max(0, (daysBetween(start, b.todayKey) / spanDays) * 100));
  const done = b.totalMinutes > 0 ? (b.completedMinutes / b.totalMinutes) * 100 : 0;
  const daysLeft = daysBetween(b.todayKey, b.deadline);

  const rows = [
    { label: 'Needed per day', value: b.requiredDailyMinutes, tone: 'need' },
    { label: 'Recent pace', value: b.velocityPerDay, tone: 'recent' },
    { label: 'You plan', value: b.plannedDailyMinutes, tone: 'plan' },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));

  const late = b.projectedDaysLate;
  let verdict = null;
  if (b.status === 'complete') verdict = { tone: 'good', text: 'Roadmap complete' };
  else if (b.projectedFinish) {
    if (late > 0) verdict = { tone: 'warn', text: `Finishing about ${late} day${late === 1 ? '' : 's'} late` };
    else if (late < 0) verdict = { tone: 'good', text: `Finishing about ${-late} day${late === -1 ? '' : 's'} early` };
    else verdict = { tone: 'good', text: 'Finishing right on the deadline' };
  }

  return (
    <Card icon={Flag} title="Pace check" sub="Are you moving fast enough?">
      <div className="ax-days-left">
        <strong>{daysLeft > 0 ? daysLeft : 0}</strong>
        <span>{daysLeft === 1 ? 'day' : 'days'} until deadline · {dayLabel(b.deadline)}</span>
      </div>

      <div className="ax-compare" aria-label="Time used versus work done">
        <div>
          <div className="ax-compare-row"><span>Time used</span><strong>{Math.round(elapsed)}%</strong></div>
          <div className="ax-bar ax-bar-lg"><i style={{ width: `${Math.max(2, elapsed)}%`, background: 'var(--ax-faint)' }} /></div>
        </div>
        <div>
          <div className="ax-compare-row"><span>Work done</span><strong>{Math.round(done)}%</strong></div>
          <div className="ax-bar ax-bar-lg"><i style={{ width: `${Math.max(2, done)}%`, background: done + 3 >= elapsed ? 'var(--success)' : 'var(--chart-5)' }} /></div>
        </div>
      </div>

      <ul className="ax-bullets">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="ax-compare-row"><span>{r.label}</span><strong>{r.value > 0 ? `${fmtMin(r.value)}/day` : '—'}</strong></div>
            <div className="ax-bar"><i className={`ax-b-${r.tone}`} style={{ width: `${Math.max(r.value > 0 ? 3 : 0, (r.value / max) * 100)}%` }} /></div>
          </li>
        ))}
      </ul>

      {verdict && (
        <p className={`ax-verdict ax-verdict-${verdict.tone}`}>
          <CalendarClock size={15} /> {verdict.text}
          {b.projectedFinish && b.status !== 'complete' ? ` · projected ${dayLabel(b.projectedFinish)}` : ''}
        </p>
      )}
    </Card>
  );
}
