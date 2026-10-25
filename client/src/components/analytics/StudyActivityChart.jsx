import { useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Brush } from 'recharts';
import { BarChart3 } from 'lucide-react';
import {
  Card, Segmented, EmptyState, ChartTooltip, AXIS_TICK, AXIS_LINE,
  dayLabel, dayLabelLong, hoursTick, mondayOf, useReducedMotion, fmtMin,
} from './chartKit.jsx';

const toWeekly = (daily) => {
  const weeks = new Map();
  for (const d of daily) {
    const key = mondayOf(d.date);
    const w = weeks.get(key) ?? { date: key, minutes: 0, sessions: 0 };
    w.minutes += d.minutes;
    w.sessions += d.sessions;
    weeks.set(key, w);
  }
  return [...weeks.values()];
};

// Trailing moving average over `win` points (shorter at the start of the series).
const withAverage = (rows, win) =>
  rows.map((row, i) => {
    const slice = rows.slice(Math.max(0, i - win + 1), i + 1);
    const avg = (key) => slice.reduce((s, r) => s + r[key], 0) / slice.length;
    return { ...row, avgMinutes: Math.round(avg('minutes')), avgSessions: Math.round(avg('sessions') * 10) / 10 };
  });

const METRICS = [
  { value: 'minutes', label: 'Time' },
  { value: 'sessions', label: 'Sessions' },
];

export default function StudyActivityChart({ daily, range, summary }) {
  const reduced = useReducedMotion();
  const [metric, setMetric] = useState('minutes');
  const weekly = range > 90;

  const data = useMemo(() => withAverage(weekly ? toWeekly(daily) : daily, weekly ? 4 : 7), [daily, weekly]);
  const isTime = metric === 'minutes';
  const total = data.reduce((s, d) => s + d.minutes, 0);

  const perPeriod = weekly ? 'week' : 'day';
  const avgValue = data.length ? data.reduce((s, d) => s + d[metric], 0) / data.length : 0;
  const best = data.reduce((b, d) => (d[metric] > (b?.[metric] ?? 0) ? d : b), null);

  const fmtValue = (v) => (isTime ? fmtMin(v) : `${Math.round(v * 10) / 10} session${v === 1 ? '' : 's'}`);
  const labelOf = (k) => (weekly ? `Week of ${dayLabel(k)}` : dayLabelLong(k));

  return (
    <Card
      className="ax-card-hero"
      title="Study activity"
      sub={`${isTime ? 'Time studied' : 'Sessions logged'} per ${perPeriod}, with a ${weekly ? '4-week' : '7-day'} moving average`}
      actions={<Segmented label="Metric" options={METRICS} value={metric} onChange={setMetric} />}
    >
      {total === 0 ? (
        <EmptyState icon={BarChart3} title="No sessions in this period">
          Start a study session from your dashboard and your activity will appear here.
        </EmptyState>
      ) : (
        <>
          <div className="ax-stats">
            <div><span>Total</span><strong>{isTime ? fmtMin(total) : summary.sessions}</strong></div>
            <div><span>Average / {perPeriod}</span><strong>{isTime ? fmtMin(Math.round(avgValue)) : (Math.round(avgValue * 10) / 10)}</strong></div>
            <div><span>Active days</span><strong>{summary.activeDays}</strong></div>
            <div>
              <span>Best {perPeriod}</span>
              <strong>{best && best[metric] > 0 ? `${isTime ? fmtMin(best.minutes) : best.sessions} · ${dayLabel(best.date)}` : '—'}</strong>
            </div>
          </div>

          <div className="ax-chart" role="img" aria-label={`Bar chart of ${isTime ? 'study time' : 'sessions'} per ${perPeriod}`}>
            <ResponsiveContainer width="100%" height={data.length > 45 ? 330 : 290}>
              <ComposedChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={34} tickMargin={8} />
                <YAxis
                  tickFormatter={isTime ? hoursTick : undefined}
                  allowDecimals={false}
                  tick={AXIS_TICK} axisLine={false} tickLine={false} width={46}
                />
                <Tooltip
                  cursor={{ fill: 'var(--surface-raised)', opacity: 0.7 }}
                  content={(props) => <ChartTooltip {...props} formatLabel={labelOf} formatValue={(v) => fmtValue(v)} />}
                />
                {avgValue > 0 && (
                  <ReferenceLine
                    y={avgValue}
                    stroke="var(--ax-faint)"
                    strokeDasharray="3 4"
                    ifOverflow="extendDomain"
                  />
                )}
                <Bar
                  dataKey={metric}
                  name={isTime ? 'Study time' : 'Sessions'}
                  fill="var(--chart-1)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={34}
                  isAnimationActive={!reduced}
                />
                <Line
                  type="monotone"
                  dataKey={isTime ? 'avgMinutes' : 'avgSessions'}
                  name={weekly ? '4-week average' : '7-day average'}
                  stroke="var(--ink)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
                  isAnimationActive={!reduced}
                />
                {data.length > 45 && (
                  <Brush
                    dataKey="date"
                    height={26}
                    travellerWidth={9}
                    stroke="var(--ax-border-strong)"
                    fill="var(--surface-subtle)"
                    tickFormatter={dayLabel}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="ax-legend-inline" aria-hidden="true">
            <span><i style={{ background: 'var(--chart-1)' }} />{isTime ? 'Study time' : 'Sessions'}</span>
            <span><i className="ax-legend-line" />{weekly ? '4-week average' : '7-day average'}</span>
            {data.length > 45 && <span className="ax-hint">Drag the handles below the chart to zoom</span>}
          </div>
        </>
      )}
    </Card>
  );
}
