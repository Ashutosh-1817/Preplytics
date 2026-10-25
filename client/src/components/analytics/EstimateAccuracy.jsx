import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { Gauge } from 'lucide-react';
import { Card, EmptyState, ChartTooltip, AXIS_TICK, AXIS_LINE, dayLabel, fmtMin, useReducedMotion, useSvgId } from './chartKit.jsx';

const RATIO_MIN = 0.33;
const RATIO_MAX = 2.0;

export default function EstimateAccuracy({ efficiency, singleGoal }) {
  const reduced = useReducedMotion();
  const gradId = useSvgId('ea');

  if (!efficiency || efficiency.nodes === 0) {
    return (
      <Card title="Estimate accuracy" sub="Estimated vs actual time on completed topics">
        <EmptyState icon={Gauge} title="Not enough timed topics yet">
          Complete topics that you timed with the session timer to see how accurate your estimates are.
        </EmptyState>
      </Card>
    );
  }

  const { ratio } = efficiency;
  const clamp = (v) => Math.min(1, Math.max(0, (v - RATIO_MIN) / (RATIO_MAX - RATIO_MIN))) * 100;
  const verdict = ratio >= 1.05 ? 'Faster than estimated' : ratio <= 0.95 ? 'Slower than estimated' : 'Right on estimate';
  const tone = ratio >= 1.05 ? 'good' : ratio <= 0.95 ? 'warn' : 'neutral';

  return (
    <Card
      title="Estimate accuracy"
      sub="Estimated ÷ actual time on completed topics"
      actions={<span className={`ax-pill ax-pill-${tone}`}>{verdict}</span>}
    >
      <div className="ax-eff-top">
        <div className="ax-eff-value">{ratio.toFixed(2)}<span>×</span></div>
        <p className="ax-eff-text">
          {fmtMin(efficiency.estimatedMinutes)} estimated vs {fmtMin(efficiency.actualMinutes)} actually spent across{' '}
          {efficiency.nodes} completed topic{efficiency.nodes === 1 ? '' : 's'}.
        </p>
      </div>

      <div className="ax-scale" aria-hidden="true">
        <div className="ax-scale-track">
          <span className="ax-scale-one" style={{ left: `${clamp(1)}%` }} />
          <span className="ax-scale-marker" style={{ left: `${clamp(ratio)}%` }} />
        </div>
        <div className="ax-scale-labels"><span>Slower</span><span>1.0× on estimate</span><span>Faster</span></div>
      </div>

      {efficiency.lowConfidence && <p className="ax-note">Based on fewer than 3 completed topics, so treat it as an early signal.</p>}
      {singleGoal && efficiency.engineRatio !== null && efficiency.engineRatio !== undefined && (
        <p className="ax-note">
          Your scheduler currently uses {efficiency.engineRatio.toFixed(2)}× ({efficiency.engineSessionCount} sessions, limited to 0.33–2.0×).
        </p>
      )}

      {efficiency.byWeek?.length > 1 && (
        <>
          <h4 className="ax-sub">By week</h4>
          <div className="ax-chart" role="img" aria-label="Estimate accuracy by week">
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={efficiency.byWeek} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="weekStart" tickFormatter={dayLabel} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={30} tickMargin={6} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={42} tickCount={4} domain={[0, (max) => Math.max(1.5, Math.ceil(max * 2) / 2)]} tickFormatter={(v) => `${Math.round(v * 10) / 10}×`} />
                <Tooltip content={(props) => <ChartTooltip {...props} formatLabel={(k) => `Week of ${dayLabel(k)}`} formatValue={(v) => `${v.toFixed(2)}×`} />} />
                <ReferenceLine y={1} stroke="var(--ax-faint)" strokeDasharray="3 4" />
                <Area type="monotone" dataKey="ratio" name="Estimated ÷ actual" stroke="var(--chart-2)" strokeWidth={2.5} fill={`url(#${gradId})`} dot={{ r: 3, strokeWidth: 2, stroke: 'var(--surface)', fill: 'var(--chart-2)' }} isAnimationActive={!reduced} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {efficiency.bySubject?.length > 0 && (
        <>
          <h4 className="ax-sub">By subject <em>(left = faster, right = slower than estimated)</em></h4>
          <ul className="ax-diverge">
            {efficiency.bySubject.slice(0, 6).map((s) => {
              const dev = s.deviationPercent;
              const width = Math.min(Math.abs(dev), 100) / 2;
              const over = dev > 5;
              const under = dev < -5;
              return (
                <li key={s.subjectId ?? s.title}>
                  <span className="ax-diverge-name" title={s.title}>{s.title}</span>
                  <div className="ax-diverge-bar" aria-hidden="true">
                    <i className="ax-diverge-axis" />
                    {dev !== 0 && (
                      <i
                        className={`ax-diverge-fill ${over ? 'is-over' : under ? 'is-under' : 'is-even'}`}
                        style={dev > 0 ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }}
                      />
                    )}
                  </div>
                  <span className={`ax-diverge-val ${over ? 'is-over' : under ? 'is-under' : ''}`}>
                    {over ? `+${dev}%` : under ? `${dev}%` : 'on par'}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
