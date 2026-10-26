import { useState } from 'react';
import { Layers } from 'lucide-react';
import { Card, EmptyState, fmtMin } from './chartKit.jsx';
import { overallCoverage } from './readiness.js';

const SHOW = 6;
const band = (p) => (p >= 0.7 ? 'high' : p >= 0.4 ? 'mid' : 'low');

export default function CoverageCard({ coverage, showGoal }) {
  const [all, setAll] = useState(false);

  if (!coverage) return null; // server not updated yet: hide instead of showing a broken card

  if (coverage.length === 0) {
    return (
      <Card icon={Layers} title="Syllabus coverage" sub="How much of each subject is done">
        <EmptyState icon={Layers} title="No roadmap topics yet">Add subjects and topics to a goal to track coverage here.</EmptyState>
      </Card>
    );
  }

  const overall = overallCoverage(coverage);
  const sorted = [...coverage].sort((a, b) => a.percent - b.percent);
  const rows = all ? sorted : sorted.slice(0, SHOW);

  return (
    <Card
      icon={Layers}
      title="Syllabus coverage"
      sub="Least covered subjects first"
      actions={overall ? <span className="ax-big-pct">{Math.round(overall.ratio * 100)}%<small>overall</small></span> : null}
    >
      <ul className="ax-cov">
        {rows.map((c) => (
          <li key={c.subjectId}>
            <div className="ax-cov-row">
              <span className="ax-cov-name">
                {c.title}
                {showGoal && c.goalTitle ? <em> · {c.goalTitle}</em> : null}
              </span>
              <span className="ax-cov-meta">{c.doneNodes}/{c.nodes} topics</span>
              <strong className={`ax-cov-pct ax-cov-${band(c.percent)}`}>{Math.round(c.percent * 100)}%</strong>
            </div>
            <div className="ax-bar ax-bar-lg">
              <i className={`ax-cov-fill ax-cov-${band(c.percent)}`} style={{ width: `${Math.max(c.percent > 0 ? 3 : 0, c.percent * 100)}%` }} />
            </div>
            <span className="ax-cov-left">{c.totalMinutes > c.doneMinutes ? `${fmtMin(c.totalMinutes - c.doneMinutes)} left` : 'Complete'}</span>
          </li>
        ))}
      </ul>
      {sorted.length > SHOW && (
        <button type="button" className="ax-link" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${sorted.length} subjects`}
        </button>
      )}
    </Card>
  );
}
