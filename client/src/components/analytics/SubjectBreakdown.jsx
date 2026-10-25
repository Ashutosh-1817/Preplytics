import { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { PieChart as PieIcon } from 'lucide-react';
import { Card, EmptyState, ChartTooltip, CHART_COLORS, fmtMin, useReducedMotion } from './chartKit.jsx';

const MAX_SLICES = 6;

export default function SubjectBreakdown({ subjects, showGoal }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(null);

  const total = subjects.reduce((s, x) => s + x.minutes, 0);

  const slices = useMemo(() => {
    const head = subjects.slice(0, MAX_SLICES).map((s, i) => ({ ...s, key: s.subjectId ?? `s${i}`, color: CHART_COLORS[i % CHART_COLORS.length] }));
    const tail = subjects.slice(MAX_SLICES);
    if (tail.length > 0) {
      head.push({
        key: 'other',
        title: `Other (${tail.length})`,
        goalTitle: '',
        minutes: tail.reduce((s, x) => s + x.minutes, 0),
        share: tail.reduce((s, x) => s + x.share, 0),
        color: 'var(--chart-6)',
      });
    }
    return head;
  }, [subjects]);

  if (total === 0) {
    return (
      <Card title="Time by subject">
        <EmptyState icon={PieIcon} title="No subject time yet">Log study sessions against roadmap topics to see where your time goes.</EmptyState>
      </Card>
    );
  }

  const focus = active !== null ? slices[active] : null;
  const top = slices[0];

  return (
    <Card title="Time by subject" sub={`${slices.length} subject${slices.length === 1 ? '' : 's'} · hover to focus`}>
      <div className="ax-subjects">
        <div className="ax-donut" role="img" aria-label="Donut chart of study time by subject">
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie
                data={slices}
                dataKey="minutes"
                nameKey="title"
                innerRadius={66}
                outerRadius={96}
                paddingAngle={slices.length > 1 ? 2 : 0}
                cornerRadius={4}
                stroke="none"
                isAnimationActive={!reduced}
                onMouseEnter={(_, i) => setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                {slices.map((s, i) => (
                  <Cell key={s.key} fill={s.color} fillOpacity={active === null || active === i ? 1 : 0.25} style={{ outline: 'none', transition: 'fill-opacity 160ms' }} />
                ))}
              </Pie>
              <Tooltip content={(props) => <ChartTooltip {...props} formatValue={(v) => fmtMin(v)} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="ax-donut-center">
            <strong>{fmtMin(focus ? focus.minutes : total)}</strong>
            <span>{focus ? `${Math.round(focus.share * 100)}% · ${focus.title}` : 'total studied'}</span>
          </div>
        </div>

        <ul className="ax-rank">
          {slices.map((s, i) => (
            <li
              key={s.key}
              className={active === i ? 'is-active' : active !== null ? 'is-dim' : ''}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              <div className="ax-rank-row">
                <span className="ax-dot" style={{ background: s.color }} />
                <span className="ax-rank-name">
                  {s.title}
                  {showGoal && s.goalTitle ? <em> · {s.goalTitle}</em> : null}
                </span>
                <span className="ax-rank-val">{fmtMin(s.minutes)}</span>
                <span className="ax-rank-pct">{Math.round(s.share * 100)}%</span>
              </div>
              <div className="ax-bar"><i style={{ width: `${Math.max(2, (s.minutes / top.minutes) * 100)}%`, background: s.color }} /></div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
