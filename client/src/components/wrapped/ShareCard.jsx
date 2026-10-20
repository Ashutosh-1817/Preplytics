import { forwardRef } from 'react';
import { formatDuration } from '../../utils/formatDuration.js';
import { CARD_W, CARD_H } from './exportCard.js';

const dayLabel = (key) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

// Plain, static markup on purpose (no motion, no CSS variables, no
// backdrop-filter): it must export to PNG identically in light and dark mode.
const ShareCard = forwardRef(function ShareCard({ d }, ref) {
  const top = d.subjects.top[0];
  const adherence = d.progress.adherenceRate;

  const stats = [
    { label: 'Study time', value: formatDuration(d.totals.minutes) },
    { label: 'Active days', value: `${d.totals.activeDays}/${d.period.days}` },
    { label: 'Best streak', value: `${Math.max(d.streak.longest, d.streak.current)}d` },
    { label: 'Topics done', value: String(d.totals.completedTopics) },
  ];

  return (
    <div ref={ref} className="wc-card" style={{ width: CARD_W, height: CARD_H }}>
      <div className="wc-top">
        <span className="wc-brand">Preplytics Wrapped</span>
        <span className="wc-period">
          {dayLabel(d.period.from)} – {dayLabel(d.period.to)}
        </span>
      </div>

      <div className="wc-persona">
        <span className="wc-persona-label">This period you were</span>
        <strong className="wc-persona-title">{d.narrative.persona.title}</strong>
        <span className="wc-persona-tag">{d.narrative.persona.tagline}</span>
      </div>

      <div className="wc-grid">
        {stats.map((s) => (
          <div key={s.label} className="wc-stat">
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="wc-foot">
        {top && (
          <div className="wc-line">
            <span>Top subject</span>
            <strong>
              {top.title} · {top.share}%
            </strong>
          </div>
        )}
        {adherence !== null && (
          <div className="wc-line">
            <span>Plan adherence</span>
            <strong>{Math.round(adherence * 100)}%</strong>
          </div>
        )}
        {d.estimates.ratio && !d.estimates.lowConfidence && (
          <div className="wc-line">
            <span>Estimate accuracy</span>
            <strong>{d.estimates.ratio.toFixed(2)}×</strong>
          </div>
        )}
      </div>
    </div>
  );
});

export default ShareCard;