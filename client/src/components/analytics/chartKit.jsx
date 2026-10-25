import { useEffect, useId, useState } from 'react';
import { formatDuration } from '../../utils/formatDuration.js';

// Categorical series colours live in Analytics.css (--chart-1 ... --chart-6) so the whole page can be re-themed in one place.
export const CHART_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)',
  'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)',
];

export const AXIS_TICK = { fontSize: 11.5, fill: 'var(--ink-muted)' };
export const AXIS_LINE = { stroke: 'var(--border)' };

const utc = (key) => new Date(`${key}T00:00:00Z`);

export const dayLabel = (key) =>
  utc(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const dayLabelLong = (key) =>
  utc(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export const hoursTick = (m) => (m === 0 ? '0' : `${Math.round((m / 60) * 10) / 10}h`);

export const mondayOf = (key) => {
  const d = utc(key);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

// SVG ids must be safe inside url(#...)
export function useSvgId(prefix = 'ax') {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

export function ChartTooltip({ active, payload, label, formatLabel, formatValue }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined && !p.hide);
  if (rows.length === 0) return null;

  return (
    <div className="ax-tooltip">
      <div className="ax-tooltip-label">{formatLabel ? formatLabel(label) : label}</div>
      {rows.map((p) => (
        <div key={p.dataKey ?? p.name} className="ax-tooltip-row">
          <span className="ax-dot" style={{ background: p.color || p.stroke || p.fill }} />
          <span>{p.name}</span>
          <strong>{formatValue ? formatValue(p.value, p) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="ax-empty">
      {Icon ? (
        <span className="ax-empty-icon"><Icon size={20} strokeWidth={1.8} /></span>
      ) : null}
      {title ? <p className="ax-empty-title">{title}</p> : null}
      <p className="ax-empty-text">{children}</p>
    </div>
  );
}

export function Card({ title, sub, actions, className = '', children }) {
  return (
    <section className={`ax-card ${className}`}>
      <header className="ax-card-head">
        <div className="ax-card-titles">
          <h3 className="ax-card-title">{title}</h3>
          {sub ? <p className="ax-card-sub">{sub}</p> : null}
        </div>
        {actions ? <div className="ax-card-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="ax-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`ax-seg-btn ${value === o.value ? 'is-active' : ''}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const fmtMin = formatDuration;
