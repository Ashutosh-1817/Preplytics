import { Sparkles, Compass, Info } from 'lucide-react';
import { useSvgId, EmptyState } from './chartKit.jsx';
import useCountUp from './useCountUp.js';
import { computeReadiness } from './readiness.js';

const R = 78;
const C = 2 * Math.PI * R;

function Ring({ score, id }) {
  const shown = useCountUp(score, 1100);
  return (
    <div className="ax-ring-xl" role="img" aria-label={`Preparation score ${score} out of 100`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" />
            <stop offset="100%" stopColor="var(--chart-4)" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--ax-track)" strokeWidth="14" />
        <circle
          cx="100" cy="100" r={R} fill="none" stroke={`url(#${id})`} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * C} ${C}`} transform="rotate(-90 100 100)"
          style={{ transition: 'stroke-dasharray 1.1s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className="ax-ring-xl-center">
        <strong>{shown}</strong>
        <span>out of 100</span>
      </div>
    </div>
  );
}

export default function ReadinessHero({ data }) {
  const id = useSvgId('rh');
  const r = computeReadiness(data);

  if (!r.ready) {
    return (
      <section className="ax-card ax-hero">
        <div className="ax-hero-head">
          <span className="ax-chip"><Sparkles size={14} /> Preparation score</span>
        </div>
        <EmptyState icon={Compass} title="Your score appears as you study">
          Create a goal with a deadline and log a few sessions. Preplytics combines progress, pace, consistency, plan adherence and estimate accuracy into one score.
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="ax-card ax-hero">
      <div className="ax-hero-head">
        <span className="ax-chip"><Sparkles size={14} /> Preparation score</span>
        <span className={`ax-pill ax-pill-${r.band.tone === 'bad' ? 'warn' : r.band.tone}`}>{r.band.label}</span>
      </div>

      <div className="ax-hero-body">
        <Ring score={r.score} id={id} />
        <ul className="ax-factors">
          {r.components.map((c) => (
            <li key={c.key}>
              <div className="ax-factor-row">
                <span className="ax-factor-name">{c.label}</span>
                <span className="ax-factor-score">{Math.round(c.score)}</span>
              </div>
              <div className="ax-factor-bar" aria-hidden="true">
                <i className={c.score >= 70 ? 'is-good' : c.score >= 40 ? 'is-mid' : 'is-low'} style={{ width: `${Math.max(3, c.score)}%` }} />
              </div>
              <span className="ax-factor-detail">{c.detail}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="ax-move">
        <span className="ax-move-icon"><Compass size={16} strokeWidth={2.2} /></span>
        <div>
          <strong>Best next move</strong>
          <p>{r.lever}</p>
        </div>
      </div>

      <details className="ax-how">
        <summary><Info size={13} /> How is this calculated?</summary>
        <p>
          A weighted blend of five signals: syllabus progress 30%, pace to deadline 25%, consistency 20%,
          plan adherence 15% and estimate accuracy 10%. Signals without data yet are left out and the rest re-weighted.
          It reflects how your preparation is going, not a prediction of exam marks.
        </p>
      </details>
    </section>
  );
}
