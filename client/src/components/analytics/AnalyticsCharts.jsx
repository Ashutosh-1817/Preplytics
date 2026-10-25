import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, PieChart, Pie, Cell,
  Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { formatDuration } from '../../utils/formatDuration.js';

const PALETTE = ['#0A0A0A', '#7A7A76', '#B5B5B0', '#3D3D3B', '#B3382C', '#3F7A4F'];
const OTHER_COLOR = '#94A3B8';
const AXIS_TICK = { fontSize: 12, fill: 'var(--ink-muted)' };

const dayLabel = (key) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

const hoursTick = (m) => (m === 0 ? '0' : `${Math.round((m / 60) * 10) / 10}h`);

function ChartTooltip({ active, payload, label, formatLabel, formatValue }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (rows.length === 0) return null;

  return (
    <div className="an-tooltip">
      <div className="an-tooltip-label">{formatLabel ? formatLabel(label) : label}</div>
      {rows.map((p) => (
        <div key={p.dataKey ?? p.name} className="an-tooltip-row">
          <span className="an-dot" style={{ background: p.color || p.stroke || p.fill }} />
          <span>{p.name}</span>
          <strong>{formatValue ? formatValue(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className="text-muted an-empty">{children}</p>;
}

// ---------- Burn-down ----------

const BURNDOWN_EMPTY = {
  no_goals: 'Create a goal to see a burn-down.',
  no_deadline: 'Set a deadline on this goal to see its burn-down. It compares your progress with the pace needed to finish on time.',
  no_roadmap: 'This goal has no roadmap topics yet. Generate or add topics to see its burn-down.',
};

const STATUS_COPY = {
  ahead: { label: 'Ahead of pace', tone: 'good' },
  on_track: { label: 'On track', tone: 'good' },
  behind: { label: 'Behind pace', tone: 'warn' },
  overdue: { label: 'Past deadline', tone: 'warn' },
  complete: { label: 'Complete', tone: 'good' },
};

export function BurnDownChart({ burndown }) {
  if (!burndown.available) {
    return <EmptyNote>{BURNDOWN_EMPTY[burndown.reason] ?? BURNDOWN_EMPTY.no_deadline}</EmptyNote>;
  }

  const b = burndown;
  const status = STATUS_COPY[b.status];

  return (
    <>
      <div className="an-burn-head">
        <span className={`an-pill an-pill-${status.tone}`}>{status.label}</span>
        <span className="text-muted an-burn-meta">
          {formatDuration(b.remainingMinutes)} left of {formatDuration(b.totalMinutes)}
          {b.goalCount > 1 ? ` across ${b.goalCount} goals` : ''}
          {' · '}
          {b.velocityPerDay > 0 ? `${formatDuration(b.velocityPerDay)}/day recent pace` : 'no recent completions'}
          {b.projectedFinish && b.status !== 'complete' ? ` · projected finish ${dayLabel(b.projectedFinish)}` : ''}
          {' · '}deadline {dayLabel(b.deadline)}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={b.points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS_TICK} stroke="var(--border)" minTickGap={36} />
          <YAxis tickFormatter={hoursTick} tick={AXIS_TICK} stroke="var(--border)" width={44} />
          <Tooltip
            content={(props) => (
              <ChartTooltip {...props} formatLabel={dayLabel} formatValue={formatDuration} />
            )}
          />
          <ReferenceLine
            x={b.todayKey}
            stroke="var(--ink-muted)"
            strokeDasharray="2 4"
            label={{ value: 'Today', position: 'insideTopRight', fontSize: 11, fill: 'var(--ink-muted)' }}
          />
          <Line type="linear" dataKey="ideal" name="Ideal pace" stroke="var(--ink-muted)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="projected" name="Projected" stroke="var(--highlight)" strokeWidth={2} strokeDasharray="2 4" dot={false} connectNulls={false} isAnimationActive={false} />
          <Line type="linear" dataKey="actual" name="Remaining" stroke="var(--signal)" strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

// ---------- Daily study time ----------

const mondayOf = (key) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

const toWeekly = (daily) => {
  const weeks = new Map();
  for (const d of daily) {
    const key = mondayOf(d.date);
    const week = weeks.get(key) ?? { date: key, minutes: 0, sessions: 0 };
    week.minutes += d.minutes;
    week.sessions += d.sessions;
    weeks.set(key, week);
  }
  return [...weeks.values()];
};

export function DailyStudyChart({ daily, range }) {
  const weekly = range > 90;
  const data = weekly ? toWeekly(daily) : daily;
  const total = data.reduce((s, d) => s + d.minutes, 0);

  if (total === 0) return <EmptyNote>No study sessions logged in this period.</EmptyNote>;

  const average = Math.round(total / data.length);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS_TICK} stroke="var(--border)" minTickGap={28} />
        <YAxis tickFormatter={hoursTick} tick={AXIS_TICK} stroke="var(--border)" width={44} />
        <Tooltip
          cursor={{ fill: 'var(--surface-raised)' }}
          content={(props) => (
            <ChartTooltip
              {...props}
              formatLabel={(k) => (weekly ? `Week of ${dayLabel(k)}` : dayLabel(k))}
              formatValue={formatDuration}
            />
          )}
        />
        <ReferenceLine
          y={average}
          stroke="var(--ink-muted)"
          strokeDasharray="4 4"
          label={{ value: `avg ${formatDuration(average)}`, position: 'insideTopLeft', fontSize: 11, fill: 'var(--ink-muted)' }}
        />
        <Bar dataKey="minutes" name={weekly ? 'Per week' : 'Per day'} fill="var(--signal)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------- Subject distribution ----------

const MAX_SLICES = 6;

export function SubjectDonut({ subjects, showGoal }) {
  const total = subjects.reduce((s, x) => s + x.minutes, 0);
  if (total === 0) return <EmptyNote>No time logged against any subject in this period.</EmptyNote>;

  const head = subjects.slice(0, MAX_SLICES);
  const tail = subjects.slice(MAX_SLICES);
  const slices = head.map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] }));
  if (tail.length > 0) {
    slices.push({
      subjectId: 'other',
      title: `Other (${tail.length})`,
      goalTitle: '',
      minutes: tail.reduce((s, x) => s + x.minutes, 0),
      share: tail.reduce((s, x) => s + x.share, 0),
      color: OTHER_COLOR,
    });
  }

  return (
    <div className="an-donut">
      <div className="an-donut-chart">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={slices} dataKey="minutes" nameKey="title" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none" isAnimationActive={false}>
              {slices.map((s) => (
                <Cell key={s.subjectId ?? s.title} fill={s.color} />
              ))}
            </Pie>
            <Tooltip content={(props) => <ChartTooltip {...props} formatValue={formatDuration} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="an-donut-center">
          <strong>{formatDuration(total)}</strong>
          <span className="text-muted">total</span>
        </div>
      </div>

      <ul className="an-legend">
        {slices.map((s) => (
          <li key={s.subjectId ?? s.title}>
            <span className="an-dot" style={{ background: s.color }} />
            <span className="an-legend-name">
              {s.title}
              {showGoal && s.goalTitle ? <em className="text-muted"> · {s.goalTitle}</em> : null}
            </span>
            <span className="an-legend-val">
              {formatDuration(s.minutes)} <span className="text-muted">({Math.round(s.share * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Efficiency ----------

const RATIO_MIN = 0.33;
const RATIO_MAX = 2.0;

export function EfficiencyCard({ efficiency, singleGoal }) {
  if (efficiency.nodes === 0) {
    return (
      <EmptyNote>
        Complete topics that you've timed with the session timer to see how accurate your estimates are.
      </EmptyNote>
    );
  }

  const ratio = efficiency.ratio;
  const position = Math.min(1, Math.max(0, (ratio - RATIO_MIN) / (RATIO_MAX - RATIO_MIN))) * 100;
  const onePosition = ((1 - RATIO_MIN) / (RATIO_MAX - RATIO_MIN)) * 100;
  const verdict = ratio >= 1.05 ? 'faster than estimated' : ratio <= 0.95 ? 'slower than estimated' : 'right on estimate';

  return (
    <div className="an-eff">
      <div className="an-eff-top">
        <div className="text-stat an-eff-value">{ratio.toFixed(2)}×</div>
        <div className="text-muted an-eff-verdict">
          You complete topics {verdict}. {formatDuration(efficiency.estimatedMinutes)} estimated vs{' '}
          {formatDuration(efficiency.actualMinutes)} actually spent across {efficiency.nodes} completed topic
          {efficiency.nodes === 1 ? '' : 's'}.
        </div>
      </div>

      <div className="an-meter" aria-hidden="true">
        <div className="an-meter-one" style={{ left: `${onePosition}%` }} />
        <div className="an-meter-marker" style={{ left: `${position}%` }} />
      </div>
      <div className="an-meter-scale text-muted">
        <span>Slower</span>
        <span>1.0× = on estimate</span>
        <span>Faster</span>
      </div>

      {efficiency.lowConfidence && (
        <p className="an-note">Based on fewer than 3 completed topics, so treat it as an early signal.</p>
      )}
      {singleGoal && efficiency.engineRatio !== null && (
        <p className="an-note text-muted">
          Your scheduler currently uses {efficiency.engineRatio.toFixed(2)}× ({efficiency.engineSessionCount} sessions,
          limited to 0.33–2.0×).
        </p>
      )}

      {efficiency.byWeek.length > 1 && (
        <>
          <h4 className="an-sub">Estimate accuracy by week</h4>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={efficiency.byWeek} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="weekStart" tickFormatter={dayLabel} tick={AXIS_TICK} stroke="var(--border)" minTickGap={28} />
              <YAxis tick={AXIS_TICK} stroke="var(--border)" width={36} domain={[0, 'auto']} tickFormatter={(v) => `${v}×`} />
              <Tooltip
                content={(props) => (
                  <ChartTooltip {...props} formatLabel={(k) => `Week of ${dayLabel(k)}`} formatValue={(v) => `${v.toFixed(2)}×`} />
                )}
              />
              <ReferenceLine y={1} stroke="var(--ink-muted)" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="ratio" name="Estimated ÷ actual" stroke="var(--highlight)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      {efficiency.bySubject.length > 0 && (
        <>
          <h4 className="an-sub">By subject</h4>
          <ul className="an-subject-list">
            {efficiency.bySubject.slice(0, 6).map((s) => {
              const over = s.deviationPercent > 5;
              const under = s.deviationPercent < -5;
              return (
                <li key={s.subjectId ?? s.title}>
                  <span className="an-legend-name">{s.title}</span>
                  <span className="text-muted">
                    {formatDuration(s.estimatedMinutes)} est · {formatDuration(s.actualMinutes)} actual
                  </span>
                  <span className={`an-pill ${over ? 'an-pill-warn' : under ? 'an-pill-good' : 'an-pill-neutral'}`}>
                    {over ? `+${s.deviationPercent}% over` : under ? `${s.deviationPercent}% under` : 'on estimate'}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}