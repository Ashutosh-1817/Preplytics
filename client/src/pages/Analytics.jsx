import { useEffect, useMemo, useState } from 'react';
import { Clock, CalendarDays, Flame, CheckCircle2, Target, Gauge, AlertTriangle, ThumbsUp, Lightbulb } from 'lucide-react';
import { fetchGoals } from '../services/goals.api.js';
import { fetchAnalytics } from '../services/analytics.api.js';
import { formatDuration } from '../utils/formatDuration.js';
import KpiCard from '../components/KpiCard.jsx';
import { BurnDownChart, DailyStudyChart, SubjectDonut, EfficiencyCard } from '../components/analytics/AnalyticsCharts.jsx';
import './Analytics.css';

const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
];

const TONE_ICON = { good: ThumbsUp, warn: AlertTriangle, info: Lightbulb };

function Analytics() {
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);

  const [goals, setGoals] = useState([]);
  const [goalId, setGoalId] = useState('all');
  const [range, setRange] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetchGoals().then(setGoals).catch(() => setGoals([]));
  }, []);

  useEffect(() => {
    let cancelled = false; // a slower, older request must never overwrite a newer one
    setLoading(true);
    setError('');

    fetchAnalytics({ goalId: goalId === 'all' ? undefined : goalId, range, tz })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error?.message || 'Could not load analytics.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [goalId, range, tz, reloadKey]);

  const singleGoal = goalId !== 'all';
  const s = data?.summary;
  const adherence = data?.plan?.adherenceRate;

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <div>
          <h1 className="text-stat analytics-title">Analytics</h1>
          <p className="text-muted analytics-sub">Real data from your sessions, roadmap and schedule · time zone {tz}</p>
        </div>

        <div className="analytics-filters">
          <select className="auth-input analytics-select" value={goalId} onChange={(e) => setGoalId(e.target.value)} aria-label="Goal">
            <option value="all">All goals</option>
            {goals.map((g) => (
              <option key={g._id} value={g._id}>
                {g.title}
              </option>
            ))}
          </select>

          <div className="analytics-range" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                className={`analytics-range-btn ${range === r.value ? 'analytics-range-btn-active' : ''}`}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="surface analytics-error">
          <p className="auth-error">{error}</p>
          <button type="button" className="btn btn-ghost" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      )}

      {!data && loading && (
        <div className="analytics-skeletons">
          <div className="skeleton" style={{ height: 96 }} />
          <div className="skeleton" style={{ height: 340 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      )}

      {data && (
        <div className={loading ? 'analytics-stale' : ''}>
          <div className="analytics-kpis">
            <KpiCard icon={<Clock size={22} />} label={`Study time · ${data.range.days}d`} value={formatDuration(s.totalMinutes)} />
            <KpiCard icon={<CalendarDays size={22} />} label="Active days" value={`${s.activeDays} / ${data.range.days}`} />
            <KpiCard icon={<Flame size={22} />} label={`Day streak · best ${data.streak.longest}`} value={String(data.streak.current)} />
            <KpiCard icon={<CheckCircle2 size={22} />} label="Topics completed" value={String(s.completedTopics)} />
            <KpiCard icon={<Target size={22} />} label="Plan adherence" value={adherence === null || adherence === undefined ? '—' : `${Math.round(adherence * 100)}%`} />
            <KpiCard icon={<Gauge size={22} />} label="Estimate accuracy" value={data.efficiency.ratio ? `${data.efficiency.ratio.toFixed(2)}×` : '—'} />
          </div>

          {data.insights.length > 0 && (
            <section className="surface analytics-card">
              <h3 className="analytics-card-title">What stands out</h3>
              <ul className="an-insights">
                {data.insights.map((i) => {
                  const Icon = TONE_ICON[i.tone] ?? Lightbulb;
                  return (
                    <li key={i.id} className={`an-insight an-insight-${i.tone}`}>
                      <Icon size={16} />
                      <span>{i.text}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="surface analytics-card">
            <h3 className="analytics-card-title">Burn-down</h3>
            <p className="text-muted analytics-card-sub">
              Remaining work against the pace needed to hit your deadline. Based on your current roadmap.
            </p>
            <BurnDownChart burndown={data.burndown} />
          </section>

          <section className="surface analytics-card">
            <h3 className="analytics-card-title">Study time {data.range.days > 90 ? 'per week' : 'per day'}</h3>
            <p className="text-muted analytics-card-sub">
              {s.sessions} session{s.sessions === 1 ? '' : 's'}
              {s.activeDays > 0 ? ` · ${formatDuration(s.avgMinutesPerActiveDay)} on an active day` : ''}
              {s.bestDay ? ` · best day ${formatDuration(s.bestDay.minutes)}` : ''}
            </p>
            <DailyStudyChart daily={data.daily} range={data.range.days} />
          </section>

          <div className="analytics-grid">
            <section className="surface analytics-card">
              <h3 className="analytics-card-title">Time by subject</h3>
              <SubjectDonut subjects={data.subjects} showGoal={!singleGoal} />
            </section>

            <section className="surface analytics-card">
              <h3 className="analytics-card-title">Estimate accuracy</h3>
              <p className="text-muted analytics-card-sub">Estimated vs actual time on completed topics.</p>
              <EfficiencyCard efficiency={data.efficiency} singleGoal={singleGoal} />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

export default Analytics;