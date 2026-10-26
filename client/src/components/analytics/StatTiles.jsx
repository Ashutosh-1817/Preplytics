import { useMemo } from 'react';
import { AreaChart, Area, Tooltip, ResponsiveContainer, XAxis } from 'recharts';
import { Clock, Flame, CheckCircle2, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { fmtMin, useReducedMotion, useSvgId, mondayOf, ChartTooltip, dayLabelLong, dayLabel } from './chartKit.jsx';
import useCountUp from './useCountUp.js';
import { overallCoverage } from './readiness.js';

const sum = (arr, key) => arr.reduce((s, x) => s + (x[key] || 0), 0);

function weekOverWeek(daily) {
  if (daily.length < 14) return null;
  const last = sum(daily.slice(-7), 'minutes');
  const prev = sum(daily.slice(-14, -7), 'minutes');
  if (last === 0 && prev === 0) return null;
  if (prev === 0) return { label: 'New activity', tone: 'up' };
  const pct = Math.round(((last - prev) / prev) * 100);
  if (pct === 0) return { label: 'Same as prev 7d', tone: 'flat' };
  return { label: `${Math.abs(pct)}% vs prev 7d`, tone: pct > 0 ? 'up' : 'down' };
}

function series(daily) {
  if (daily.length <= 120) return daily.map((d) => ({ x: d.date, v: d.minutes, weekly: false }));
  const weeks = new Map();
  for (const d of daily) weeks.set(mondayOf(d.date), (weeks.get(mondayOf(d.date)) || 0) + d.minutes);
  return [...weeks].map(([x, v]) => ({ x, v, weekly: true }));
}

function Trend({ trend }) {
  if (!trend) return null;
  const Icon = trend.tone === 'up' ? ArrowUpRight : trend.tone === 'down' ? ArrowDownRight : Minus;
  return <span className={`ax-trend ax-trend-${trend.tone}`}><Icon size={13} strokeWidth={2.5} />{trend.label}</span>;
}

export function StudyTimeTile({ data }) {
  const reduced = useReducedMotion();
  const id = useSvgId('st');
  const { summary: s, range, daily } = data;
  const points = useMemo(() => series(daily), [daily]);
  const trend = useMemo(() => weekOverWeek(daily), [daily]);
  const shown = useCountUp(s.totalMinutes, 1000);

  return (
    <section className="ax-tile-card ax-tint-lilac">
      <div className="ax-tile-top">
        <span className="ax-tile-label"><Clock size={15} /> Study time · last {range.days} days</span>
        <Trend trend={trend} />
      </div>
      <div className="ax-tile-big">{fmtMin(shown)}</div>
      <p className="ax-tile-sub">
        {s.sessions} session{s.sessions === 1 ? '' : 's'}
        {s.activeDays > 0 ? ` · ${fmtMin(s.avgMinutesPerActiveDay)} on an active day` : ''}
      </p>
      <div className="ax-tile-chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="x" hide />
            <Tooltip
              cursor={{ stroke: 'var(--chart-4)', strokeOpacity: 0.35, strokeDasharray: '3 3' }}
              content={(props) => (
                <ChartTooltip {...props} formatLabel={(k) => (points[0]?.weekly ? `Week of ${dayLabel(k)}` : dayLabelLong(k))} formatValue={(v) => fmtMin(v)} />
              )}
            />
            <Area type="monotone" dataKey="v" name="Study time" stroke="var(--chart-4)" strokeWidth={2.25} fill={`url(#${id})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} isAnimationActive={!reduced} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function StreakTile({ data }) {
  const { streak, daily } = data;
  const shown = useCountUp(streak.current, 800);
  const last7 = daily.slice(-7);
  const letter = (key) => new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' });

  return (
    <section className="ax-tile-card ax-tint-peach">
      <div className="ax-tile-top">
        <span className="ax-tile-label"><Flame size={15} /> Day streak</span>
      </div>
      <div className="ax-tile-big">
        {shown}<span className="ax-tile-unit">{streak.current === 1 ? 'day' : 'days'}</span>
      </div>
      <p className="ax-tile-sub">Best streak {streak.longest} {streak.longest === 1 ? 'day' : 'days'}</p>
      {streak.longest > 0 && (
        <div className="ax-tile-foot">
          <div className="ax-tile-foot-row">
            <span>{streak.current >= streak.longest ? 'Personal best' : 'Toward your best'}</span>
            <strong>{streak.current}/{streak.longest}</strong>
          </div>
          <div className="ax-bar ax-bar-lg"><i style={{ width: `${Math.max(3, Math.min(100, (streak.current / streak.longest) * 100))}%`, background: 'var(--chart-3)' }} /></div>
        </div>
      )}
      <div className="ax-week" aria-label="Activity in the last 7 days">
        {last7.map((d) => (
          <div key={d.date} className={d.minutes > 0 ? 'is-on' : ''} title={`${dayLabelLong(d.date)}: ${fmtMin(d.minutes)}`}>
            <i />
            <span>{letter(d.date)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TopicsTile({ data }) {
  const { summary: s, coverage, range } = data;
  const shown = useCountUp(s.completedTopics, 800);
  const cov = overallCoverage(coverage);
  const pct = cov ? Math.round(cov.ratio * 100) : null;

  return (
    <section className="ax-tile-card ax-tint-mint">
      <div className="ax-tile-top">
        <span className="ax-tile-label"><CheckCircle2 size={15} /> Topics completed</span>
      </div>
      <div className="ax-tile-big">{shown}</div>
      <p className="ax-tile-sub">in the last {range.days} days</p>
      {range.days >= 7 && s.completedTopics > 0 && (
        <p className="ax-tile-rate">
          <strong>{(s.completedTopics / (range.days / 7)).toFixed(1)}</strong> topics per week
        </p>
      )}
      {pct !== null ? (
        <div className="ax-tile-foot">
          <div className="ax-tile-foot-row"><span>Whole syllabus</span><strong>{pct}% covered</strong></div>
          <div className="ax-bar ax-bar-lg"><i style={{ width: `${Math.max(2, pct)}%`, background: 'var(--chart-2)' }} /></div>
        </div>
      ) : null}
    </section>
  );
}
