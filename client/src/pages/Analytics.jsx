import { useEffect, useMemo, useState } from 'react';
import { Download, RotateCw, CircleAlert } from 'lucide-react';
import { fetchGoals } from '../services/goals.api.js';
import { fetchAnalytics } from '../services/analytics.api.js';
import ReadinessHero from '../components/analytics/ReadinessHero.jsx';
import { StudyTimeTile, StreakTile, TopicsTile } from '../components/analytics/StatTiles.jsx';
import Insights from '../components/analytics/Insights.jsx';
import StudyActivityChart from '../components/analytics/StudyActivityChart.jsx';
import BurnDownChart from '../components/analytics/BurnDownChart.jsx';
import PaceForecast from '../components/analytics/PaceForecast.jsx';
import CoverageCard from '../components/analytics/CoverageCard.jsx';
import FocusList from '../components/analytics/FocusList.jsx';
import RhythmCard from '../components/analytics/RhythmCard.jsx';
import ActivityHeatmap from '../components/analytics/ActivityHeatmap.jsx';
import SubjectBreakdown from '../components/analytics/SubjectBreakdown.jsx';
import PlanAdherence from '../components/analytics/PlanAdherence.jsx';
import EstimateAccuracy from '../components/analytics/EstimateAccuracy.jsx';
import AnalyticsSkeleton from '../components/analytics/AnalyticsSkeleton.jsx';
import { Segmented } from '../components/analytics/chartKit.jsx';
import './Analytics.css';
import Select from '../components/Select.jsx';


const RANGES = [
  { value: 7, label: '7D' },
  { value: 30, label: '30D' },
  { value: 90, label: '90D' },
  { value: 365, label: '1Y' },
];

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'all-goals';

// Client-side export of exactly what the daily chart shows.
function downloadCsv(data, goalLabel) {
  const rows = ['date,minutes,sessions', ...data.daily.map((d) => `${d.date},${d.minutes},${d.sessions}`)];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `preplytics-${slug(goalLabel)}-${data.range.from}-to-${data.range.to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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
    fetchGoals().then((g) => setGoals(Array.isArray(g) ? g : [])).catch(() => setGoals([]));
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
  const goalLabel = singleGoal ? goals.find((g) => g._id === goalId)?.title ?? 'goal' : 'All goals';
  const hasBurndown = Boolean(data?.burndown?.available);

  return (
    <div className="ax-page">
      <header className="ax-header">
        <div className="ax-header-text">
          <h1 className="ax-title">Analytics</h1>
          <p className="ax-subtitle">
            A clear read on your preparation: how ready you are, whether you are on pace, and where to spend your next hour.
          </p>
        </div>

        <div className="ax-filters">
          <Select className="ui-select--wide" aria-label="Goal" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="all">All goals</option>
              {goals.map((g) => (
                <option key={g._id} value={g._id}>{g.title}</option>
              ))}
            </Select>

          <Segmented label="Date range" options={RANGES} value={range} onChange={setRange} />

          <button
            type="button"
            className="ax-btn"
            disabled={!data}
            onClick={() => data && downloadCsv(data, goalLabel)}
            title="Download the daily numbers as CSV"
          >
            <Download size={15} strokeWidth={2.2} />
            <span>Export</span>
          </button>
        </div>
      </header>

      <div className={`ax-progress ${loading && data ? 'is-on' : ''}`} aria-hidden="true"><i /></div>

      {error && (
        <div className="ax-error" role="alert">
          <CircleAlert size={18} />
          <p>{error}</p>
          <button type="button" className="ax-btn" onClick={() => setReloadKey((k) => k + 1)}>
            <RotateCw size={14} /> Try again
          </button>
        </div>
      )}

      {!data && loading && <AnalyticsSkeleton />}

      {data && (
        <div className={`ax-bento ${loading ? 'is-stale' : ''}`}>
          <div className="ax-cell-hero"><ReadinessHero data={data} /></div>
          <div className="ax-cell-study"><StudyTimeTile data={data} /></div>
          <div className="ax-cell-streak"><StreakTile data={data} /></div>
          <div className="ax-cell-topics"><TopicsTile data={data} /></div>

          {data.insights?.length > 0 && <div className="ax-span-12"><Insights insights={data.insights} /></div>}

          <div className="ax-span-12"><StudyActivityChart daily={data.daily} range={data.range.days} summary={data.summary} /></div>

          <div className={hasBurndown ? 'ax-span-8' : 'ax-span-12'}><BurnDownChart burndown={data.burndown} /></div>
          {hasBurndown && <div className="ax-span-4"><PaceForecast burndown={data.burndown} /></div>}

          {data.coverage && (
            <>
              <div className="ax-span-7"><CoverageCard coverage={data.coverage} showGoal={!singleGoal} /></div>
              <div className="ax-span-5">
                <FocusList coverage={data.coverage} subjects={data.subjects} efficiency={data.efficiency} showGoal={!singleGoal} />
              </div>
            </>
          )}

          {data.rhythm && <div className="ax-span-12"><RhythmCard rhythm={data.rhythm} /></div>}

          <div className="ax-span-6"><ActivityHeatmap daily={data.daily} /></div>
          <div className="ax-span-6"><SubjectBreakdown subjects={data.subjects} showGoal={!singleGoal} /></div>

          <div className="ax-span-5"><PlanAdherence plan={data.plan} /></div>
          <div className="ax-span-7"><EstimateAccuracy efficiency={data.efficiency} singleGoal={singleGoal} /></div>
        </div>
      )}
    </div>
  );
}

export default Analytics;
