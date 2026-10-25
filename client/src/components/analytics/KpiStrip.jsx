import { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { Clock, CalendarCheck, Flame, CheckCircle2, Target, Gauge, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { fmtMin, useReducedMotion, useSvgId, mondayOf } from './chartKit.jsx';

const sum = (arr, key) => arr.reduce((s, x) => s + (x[key] || 0), 0);

// Last 7 days vs the 7 before, only when the period is long enough to compare honestly.
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

function sparkSeries(daily) {
  if (daily.length <= 120) return daily.map((d) => ({ x: d.date, v: d.minutes }));
  const weeks = new Map();
  for (const d of daily) weeks.set(mondayOf(d.date), (weeks.get(mondayOf(d.date)) || 0) + d.minutes);
  return [...weeks].map(([x, v]) => ({ x, v }));
}

function Sparkline({ data, reduced }) {
  const id = useSvgId('sp');
  return (
    <div className="ax-spark" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke="var(--chart-1)" strokeWidth={1.75} fill={`url(#${id})`} dot={false} isAnimationActive={!reduced} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Ring({ value, tone = 'var(--chart-2)' }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const pct = value === null || value === undefined ? 0 : Math.min(1, Math.max(0, value));
  return (
    <svg className="ax-ring" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--surface-raised)" strokeWidth="5" />
      <circle
        cx="22" cy="22" r={r} fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${pct * c} ${c}`} transform="rotate(-90 22 22)"
      />
    </svg>
  );
}

function Trend({ trend }) {
  if (!trend) return null;
  const Icon = trend.tone === 'up' ? ArrowUpRight : trend.tone === 'down' ? ArrowDownRight : Minus;
  return (
    <span className={`ax-trend ax-trend-${trend.tone}`}>
      <Icon size={13} strokeWidth={2.5} />
      {trend.label}
    </span>
  );
}

function Kpi({ icon: Icon, label, value, unit, sub, trend, visual }) {
  return (
    <div className="ax-kpi">
      <div className="ax-kpi-top">
        <span className="ax-kpi-label"><Icon size={15} strokeWidth={2} />{label}</span>
        {trend}
      </div>
      <div className="ax-kpi-main">
        <div>
          <div className="ax-kpi-value">
            {value}
            {unit ? <span className="ax-kpi-unit">{unit}</span> : null}
          </div>
          {sub ? <div className="ax-kpi-sub">{sub}</div> : null}
        </div>
        {visual}
      </div>
    </div>
  );
}

export default function KpiStrip({ data }) {
  const reduced = useReducedMotion();
  const { summary: s, range, streak, efficiency, plan, daily } = data;
  const spark = useMemo(() => sparkSeries(daily), [daily]);
  const trend = useMemo(() => weekOverWeek(daily), [daily]);
  const last7 = daily.slice(-7);

  const adherence = plan?.adherenceRate;
  const ratio = efficiency?.ratio;
  const verdict = !ratio ? 'Not enough data yet' : ratio >= 1.05 ? 'Faster than estimated' : ratio <= 0.95 ? 'Slower than estimated' : 'Right on estimate';
  const consistency = range.days > 0 ? s.activeDays / range.days : 0;

  return (
    <div className="ax-kpis" role="list">
      <Kpi
        icon={Clock}
        label="Study time"
        value={fmtMin(s.totalMinutes)}
        sub={`${s.sessions} session${s.sessions === 1 ? '' : 's'} · last ${range.days} days`}
        trend={<Trend trend={trend ? { ...trend } : null} />}
        visual={<Sparkline data={spark} reduced={reduced} />}
      />
      <Kpi
        icon={CalendarCheck}
        label="Active days"
        value={s.activeDays}
        unit={`/ ${range.days}`}
        sub={`${Math.round(consistency * 100)}% consistency`}
        visual={
          <div className="ax-meter-mini" aria-hidden="true">
            <i style={{ width: `${Math.max(2, consistency * 100)}%` }} />
          </div>
        }
      />
      <Kpi
        icon={Flame}
        label="Day streak"
        value={streak.current}
        unit={streak.current === 1 ? 'day' : 'days'}
        sub={`Best ${streak.longest} ${streak.longest === 1 ? 'day' : 'days'}`}
        visual={
          <div className="ax-dots" aria-label="Activity in the last 7 days">
            {last7.map((d) => (
              <i key={d.date} className={d.minutes > 0 ? 'is-on' : ''} title={`${d.date}: ${fmtMin(d.minutes)}`} />
            ))}
          </div>
        }
      />
      <Kpi
        icon={CheckCircle2}
        label="Topics completed"
        value={s.completedTopics}
        sub={s.completedTopics === 1 ? 'topic finished' : 'topics finished'}
      />
      <Kpi
        icon={Target}
        label="Plan adherence"
        value={adherence === null || adherence === undefined ? '—' : `${Math.round(adherence * 100)}%`}
        sub={adherence === null || adherence === undefined ? 'No scheduled tasks due yet' : 'Scheduled tasks completed'}
        visual={<Ring value={adherence} />}
      />
      <Kpi
        icon={Gauge}
        label="Estimate accuracy"
        value={ratio ? ratio.toFixed(2) : '—'}
        unit={ratio ? '×' : ''}
        sub={verdict}
      />
    </div>
  );
}
