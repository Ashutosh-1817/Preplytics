import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { TrendingDown, CalendarClock, CircleCheck, TriangleAlert } from 'lucide-react';
import {
  Card, EmptyState, ChartTooltip, AXIS_TICK, AXIS_LINE,
  dayLabel, hoursTick, useReducedMotion, useSvgId, fmtMin,
} from './chartKit.jsx';

const EMPTY = {
  no_goals: 'Create a goal to see a burn-down.',
  no_deadline: 'Set a deadline on this goal to see its burn-down. It compares your progress with the pace needed to finish on time.',
  no_roadmap: 'This goal has no roadmap topics yet. Generate or add topics to see its burn-down.',
};

const STATUS = {
  ahead: { label: 'Ahead of pace', tone: 'good', Icon: CircleCheck },
  on_track: { label: 'On track', tone: 'good', Icon: CircleCheck },
  behind: { label: 'Behind pace', tone: 'warn', Icon: TriangleAlert },
  overdue: { label: 'Past deadline', tone: 'warn', Icon: TriangleAlert },
  complete: { label: 'Complete', tone: 'good', Icon: CircleCheck },
};

function Tile({ label, value, sub, tone }) {
  return (
    <div className={`ax-tile ${tone ? `ax-tile-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <em>{sub}</em> : null}
    </div>
  );
}

export default function BurnDownChart({ burndown: b }) {
  const reduced = useReducedMotion();
  const gradId = useSvgId('bd');

  if (!b?.available) {
    return (
      <Card title="Burn-down" sub="Remaining work against the pace needed to hit your deadline.">
        <EmptyState icon={TrendingDown} title="Nothing to chart yet">
          {EMPTY[b?.reason] ?? EMPTY.no_deadline}
        </EmptyState>
      </Card>
    );
  }

  const status = STATUS[b.status] ?? STATUS.on_track;
  const keys = new Set(b.points.map((p) => p.date));
  const progress = b.totalMinutes > 0 ? Math.round((b.completedMinutes / b.totalMinutes) * 100) : 0;

  let finishSub = null;
  if (b.projectedFinish && b.status !== 'complete') {
    if (b.projectedDaysLate > 0) finishSub = `${b.projectedDaysLate} day${b.projectedDaysLate === 1 ? '' : 's'} after deadline`;
    else if (b.projectedDaysLate < 0) finishSub = `${-b.projectedDaysLate} day${b.projectedDaysLate === -1 ? '' : 's'} before deadline`;
    else finishSub = 'On the deadline';
  }

  return (
    <Card
      className="ax-card-hero"
      title="Burn-down"
      sub={`Remaining work against the pace needed to hit your deadline${b.goalCount > 1 ? ` · ${b.goalCount} goals combined` : ''}`}
      actions={<span className={`ax-pill ax-pill-${status.tone}`}><status.Icon size={13} strokeWidth={2.4} />{status.label}</span>}
    >
      <div className="ax-tiles">
        <Tile label="Remaining" value={fmtMin(b.remainingMinutes)} sub={`${progress}% of ${fmtMin(b.totalMinutes)} done`} />
        <Tile label="Recent pace" value={b.velocityPerDay > 0 ? `${fmtMin(b.velocityPerDay)}/day` : '—'} sub={b.velocityPerDay > 0 ? 'last 2 weeks' : 'no recent completions'} />
        <Tile
          label="Needed per day"
          value={b.requiredDailyMinutes > 0 ? `${fmtMin(b.requiredDailyMinutes)}/day` : '—'}
          sub={b.plannedDailyMinutes > 0 ? `you plan ${fmtMin(b.plannedDailyMinutes)}` : null}
          tone={b.requiredDailyMinutes > b.plannedDailyMinutes && b.plannedDailyMinutes > 0 ? 'warn' : undefined}
        />
        <Tile
          label="Projected finish"
          value={b.projectedFinish && b.status !== 'complete' ? dayLabel(b.projectedFinish) : b.status === 'complete' ? 'Done' : '—'}
          sub={finishSub ?? `deadline ${dayLabel(b.deadline)}`}
          tone={b.projectedDaysLate > 0 ? 'warn' : undefined}
        />
      </div>

      <div className="ax-chart" role="img" aria-label="Burn-down chart: remaining work over time against the ideal pace">
        <ResponsiveContainer width="100%" height={310}>
          <ComposedChart data={b.points} margin={{ top: 14, right: 12, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.24} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
            <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={40} tickMargin={8} />
            <YAxis tickFormatter={hoursTick} tick={AXIS_TICK} axisLine={false} tickLine={false} width={46} />
            <Tooltip content={(props) => <ChartTooltip {...props} formatLabel={dayLabel} formatValue={(v) => fmtMin(v)} />} />
            {keys.has(b.todayKey) && (
              <ReferenceLine x={b.todayKey} stroke="var(--ax-faint)" strokeDasharray="3 4"
                label={{ value: 'Today', position: 'insideTopRight', fontSize: 11, fill: 'var(--ink-muted)' }} />
            )}
            {keys.has(b.deadline) && (
              <ReferenceLine x={b.deadline} stroke="var(--chart-5)" strokeDasharray="3 4"
                label={{ value: 'Deadline', position: 'insideTopRight', fontSize: 11, fill: 'var(--chart-5)' }} />
            )}
            <Line type="linear" dataKey="ideal" name="Ideal pace" stroke="var(--ax-faint)" strokeWidth={2} strokeDasharray="6 5" dot={false} isAnimationActive={!reduced} />
            <Line type="linear" dataKey="projected" name="Projected" stroke="var(--chart-3)" strokeWidth={2.25} strokeDasharray="2 5" strokeLinecap="round" dot={false} connectNulls={false} isAnimationActive={!reduced} />
            <Area type="monotone" dataKey="actual" name="Remaining" stroke="var(--chart-1)" strokeWidth={2.75} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} connectNulls={false} isAnimationActive={!reduced} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="ax-legend-inline" aria-hidden="true">
        <span><i style={{ background: 'var(--chart-1)' }} />Remaining work</span>
        <span><i className="ax-legend-dash" />Ideal pace</span>
        <span><i className="ax-legend-dots" />Projected</span>
        <span className="ax-hint"><CalendarClock size={13} /> Based on your current roadmap</span>
      </div>
    </Card>
  );
}
