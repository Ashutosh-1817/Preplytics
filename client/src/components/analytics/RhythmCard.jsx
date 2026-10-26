import { useMemo } from 'react';
import { Clock3, Sun, Moon } from 'lucide-react';
import { Card, EmptyState, fmtMin } from './chartKit.jsx';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PARTS = [
  { key: 'morning', label: 'Morning', hours: [5, 6, 7, 8, 9, 10, 11], color: 'var(--chart-3)' },
  { key: 'afternoon', label: 'Afternoon', hours: [12, 13, 14, 15, 16], color: 'var(--chart-2)' },
  { key: 'evening', label: 'Evening', hours: [17, 18, 19, 20, 21], color: 'var(--chart-1)' },
  { key: 'night', label: 'Night', hours: [22, 23, 0, 1, 2, 3, 4], color: 'var(--chart-4)' },
];

const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12}${h % 24 < 12 ? ' AM' : ' PM'}`;
const axisLabel = (h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;

export default function RhythmCard({ rhythm }) {
  const m = useMemo(() => {
    if (!rhythm) return null;
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    const sessions = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const c of rhythm) {
      const d = c.dow - 1;
      if (d >= 0 && d < 7 && c.hour >= 0 && c.hour < 24) { grid[d][c.hour] += c.minutes; sessions[d][c.hour] += c.sessions; }
    }
    const total = grid.flat().reduce((s, v) => s + v, 0);
    const byHour = Array.from({ length: 24 }, (_, h) => grid.reduce((s, row) => s + row[h], 0));
    const byDay = grid.map((row) => row.reduce((s, v) => s + v, 0));

    // best consecutive 2-hour window (wraps past midnight)
    let peak = { h: 0, v: -1 };
    for (let h = 0; h < 24; h += 1) {
      const v = byHour[h] + byHour[(h + 1) % 24];
      if (v > peak.v) peak = { h, v };
    }
    const bestDay = byDay.indexOf(Math.max(...byDay));
    const parts = PARTS.map((p) => ({ ...p, minutes: p.hours.reduce((s, h) => s + byHour[h], 0) }));
    const topPart = [...parts].sort((a, b) => b.minutes - a.minutes)[0];

    const nz = grid.flat().filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))];
    const cuts = nz.length ? [q(0.25), q(0.5), q(0.75)] : [0, 0, 0];
    const level = (v) => (v <= 0 ? 0 : v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : 4);

    return { grid, sessions, total, peak, bestDay, byDay, parts, topPart, level };
  }, [rhythm]);

  if (!rhythm) return null; // server not updated yet

  return (
    <Card
      icon={Clock3}
      className="ax-card-rhythm"
      title="When you study best"
      sub="Study time by weekday and the hour each session started"
    >
      {!m || m.total === 0 ? (
        <EmptyState icon={Clock3} title="No sessions in this period">Log a few sessions and your best study hours show up here.</EmptyState>
      ) : (
        <>
          <div className="ax-rhythm-insights">
            <div className="ax-rinsight">
              <span className="ax-rinsight-icon"><Sun size={16} /></span>
              <div>
                <span>Peak window</span>
                <strong>{hourLabel(m.peak.h)} – {hourLabel((m.peak.h + 2) % 24)}</strong>
                <em>{Math.round((m.peak.v / m.total) * 100)}% of your study time</em>
              </div>
            </div>
            <div className="ax-rinsight">
              <span className="ax-rinsight-icon"><Clock3 size={16} /></span>
              <div>
                <span>Strongest day</span>
                <strong>{DAYS_LONG[m.bestDay]}</strong>
                <em>{fmtMin(m.byDay[m.bestDay])} in this period</em>
              </div>
            </div>
            <div className="ax-rinsight">
              <span className="ax-rinsight-icon"><Moon size={16} /></span>
              <div>
                <span>Most active</span>
                <strong>{m.topPart.label}s</strong>
                <em>{Math.round((m.topPart.minutes / m.total) * 100)}% of your study time</em>
              </div>
            </div>
          </div>

          <div className="ax-rgrid-wrap">
            <div className="ax-rgrid" role="img" aria-label="Heatmap of study time by weekday and hour">
              <span />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="ax-rhour" aria-hidden="true">{h % 6 === 0 ? axisLabel(h) : ''}</span>
              ))}
              {DAYS.map((d, di) => (
                <div key={d} className="ax-rrow">
                  <span className="ax-rday" aria-hidden="true">{d}</span>
                  {m.grid[di].map((v, h) => (
                    <i
                      key={h}
                      className={`ax-rcell lv-${m.level(v)}`}
                      data-tip={`${DAYS_LONG[di]} ${hourLabel(h)} · ${v > 0 ? `${fmtMin(v)}, ${m.sessions[di][h]} session${m.sessions[di][h] === 1 ? '' : 's'}` : 'no study'}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="ax-dayparts">
            <div className="ax-stack" aria-hidden="true">
              {m.parts.map((p) => (p.minutes > 0 ? <i key={p.key} style={{ flexGrow: p.minutes, background: p.color }} title={`${p.label}: ${fmtMin(p.minutes)}`} /> : null))}
            </div>
            <ul className="ax-adh-legend ax-parts-legend">
              {m.parts.map((p) => (
                <li key={p.key}>
                  <span className="ax-dot" style={{ background: p.color }} />
                  <span>{p.label}</span>
                  <strong>{Math.round((p.minutes / m.total) * 100)}%</strong>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Card>
  );
}
