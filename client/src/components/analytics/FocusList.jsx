import { useMemo } from 'react';
import { Crosshair } from 'lucide-react';
import { Card, EmptyState } from './chartKit.jsx';

// Ranks subjects by how much attention they need. Each reason is a real number from the data:
//  - low coverage, - estimates that run over, - a gap between its share of remaining work and its share of recent study time.
export default function FocusList({ coverage, subjects, efficiency, showGoal }) {
  const ranked = useMemo(() => {
    if (!coverage?.length) return [];
    const open = coverage.filter((c) => c.totalMinutes > c.doneMinutes);
    const remainingTotal = open.reduce((s, c) => s + (c.totalMinutes - c.doneMinutes), 0) || 1;
    const timeTotal = (subjects ?? []).reduce((s, x) => s + x.minutes, 0);
    const timeShare = new Map((subjects ?? []).map((x) => [String(x.subjectId), timeTotal > 0 ? x.minutes / timeTotal : 0]));
    const overrun = new Map((efficiency?.bySubject ?? []).map((x) => [String(x.subjectId), x.deviationPercent]));

    return open
      .map((c) => {
        const id = String(c.subjectId);
        const remainShare = (c.totalMinutes - c.doneMinutes) / remainingTotal;
        const studied = timeShare.get(id) ?? 0;
        const dev = overrun.get(id) ?? 0;
        const gap = timeTotal > 0 ? Math.max(0, remainShare - studied) : 0;
        const score = 0.5 * (1 - c.percent) + 0.25 * Math.min(1, Math.max(0, dev) / 100) + 0.25 * Math.min(1, gap * 2);

        const reasons = [];
        if (c.percent < 0.5) reasons.push({ tone: 'warn', text: `${Math.round(c.percent * 100)}% covered` });
        if (dev > 15) reasons.push({ tone: 'warn', text: `runs ${dev}% over estimates` });
        if (gap > 0.1) reasons.push({ tone: 'info', text: `${Math.round(remainShare * 100)}% of remaining work, ${Math.round(studied * 100)}% of recent study` });
        if (reasons.length === 0) reasons.push({ tone: 'good', text: `${Math.round(c.percent * 100)}% covered, steady` });
        return { ...c, score, reasons };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [coverage, subjects, efficiency]);

  if (!coverage) return null;

  return (
    <Card icon={Crosshair} title="Where to focus next" sub="Ranked by coverage, estimate overruns and study-time gap">
      {ranked.length === 0 ? (
        <EmptyState icon={Crosshair} title="Nothing urgent">Every subject is fully covered, or there is no roadmap to rank yet.</EmptyState>
      ) : (
        <ol className="ax-focus">
          {ranked.map((s, i) => (
            <li key={s.subjectId}>
              <span className="ax-focus-rank">{i + 1}</span>
              <div>
                <strong>{s.title}{showGoal && s.goalTitle ? <em> · {s.goalTitle}</em> : null}</strong>
                <div className="ax-reasons">
                  {s.reasons.map((r) => <span key={r.text} className={`ax-reason ax-reason-${r.tone}`}>{r.text}</span>)}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
