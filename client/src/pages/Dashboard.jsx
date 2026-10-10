import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Clock, Target } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchOverview, fetchStreak, fetchHeatmap, fetchTodayTasks } from '../services/dashboard.api.js';
import { startSession } from '../services/sessions.api.js';
import { readActiveSession, writeActiveSession } from '../utils/activeSessionStorage.js';
import { KpiCard, Sparkline, GoalProgressWidget, WeeklyChart, TodayTaskCard } from '../components/DashboardWidgets.jsx';
import Heatmap from '../components/Heatmap.jsx';
import './Dashboard.css';

function computeWeeklyTrend(heatmapData) {
  if (!heatmapData || heatmapData.length < 14) return null;
  const last7 = heatmapData.slice(-7).reduce((sum, d) => sum + d.minutes, 0);
  const prev7 = heatmapData.slice(-14, -7).reduce((sum, d) => sum + d.minutes, 0);
  if (prev7 === 0) return last7 > 0 ? 100 : null;
  return Math.round(((last7 - prev7) / prev7) * 100);
}

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [overview, setOverview] = useState(null);
  const [streak, setStreak] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [goalFilter, setGoalFilter] = useState('all');
  const [startingId, setStartingId] = useState(null);
  const [startError, setStartError] = useState('');

  useEffect(() => {
    fetchOverview().then(setOverview).catch(() => setOverview({ goals: [] }));
    fetchStreak().then(setStreak).catch(() => setStreak({ currentStreak: 0, longestStreak: 0 }));
    fetchHeatmap().then(setHeatmap).catch(() => setHeatmap([]));
    fetchTodayTasks().then(setTasks).catch(() => setTasks([]));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const totalMinutes = heatmap?.reduce((sum, d) => sum + d.minutes, 0) ?? 0;
  const totalHours = (totalMinutes / 60).toFixed(1);
  const weeklyTrend = heatmap ? computeWeeklyTrend(heatmap) : null;
  const last7Minutes = heatmap ? heatmap.slice(-7).map((d) => d.minutes) : [];

  const goals = overview?.goals ?? [];
  const goalsWithRoadmap = goals.filter((g) => g.completionPercent !== null);
  const avgCompletion = goalsWithRoadmap.length
    ? Math.round(goalsWithRoadmap.reduce((sum, g) => sum + g.completionPercent, 0) / goalsWithRoadmap.length)
    : null;

  const taskGoals = useMemo(() => {
    const map = new Map();
    tasks?.forEach((t) => {
      if (t.goalId?._id) map.set(t.goalId._id, t.goalId);
    });
    return [...map.values()];
  }, [tasks]);

  const visibleTasks = tasks
    ? goalFilter === 'all'
      ? tasks
      : tasks.filter((t) => t.goalId?._id === goalFilter)
    : null;

  const doneCount = visibleTasks?.filter((t) => t.status === 'completed').length ?? 0;

  const handleStart = async (task) => {
    setStartError('');
    setStartingId(task._id);

    const nodeId = task.nodeId?._id;
    const goalId = task.goalId?._id;

    try {
      const session = await startSession(nodeId);
      writeActiveSession(session._id, nodeId, session.startedAt);
      navigate(`/goals/${goalId}?node=${nodeId}`);
    } catch (err) {
      const stored = readActiveSession();
      if (stored?.nodeId === nodeId) {
        // Already running on this exact topic — just resume it
        navigate(`/goals/${goalId}?node=${nodeId}`);
      } else {
        setStartError(err.response?.data?.error?.message || 'Could not start the timer.');
        setStartingId(null);
      }
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="text-stat dashboard-greeting">
          {greeting}{user?.name ? `, ${user.name}` : ''}
        </h1>
        <p className="dashboard-subtitle">Your goals, your pace, our support.</p>
      </div>

      <div className="kpi-row">
        {streak ? (
          <KpiCard
            icon={Flame}
            tone="warm"
            label="Current streak"
            value={streak.currentStreak}
            unit={streak.currentStreak === 1 ? 'day' : 'days'}
            sub={`Best: ${streak.longestStreak} ${streak.longestStreak === 1 ? 'day' : 'days'}`}
          />
        ) : (
          <div className="card skeleton kpi-skeleton" />
        )}

        {heatmap ? (
          <KpiCard icon={Clock} tone="signal" label="Total study time" value={totalHours} unit="h" trend={weeklyTrend} sub="Last 365 days">
            <Sparkline values={last7Minutes} />
          </KpiCard>
        ) : (
          <div className="card skeleton kpi-skeleton" />
        )}

        {overview ? (
          <KpiCard
            icon={Target}
            tone="highlight"
            label="Goals in progress"
            value={goals.length}
            unit={goals.length === 1 ? 'goal' : 'goals'}
            sub={avgCompletion !== null ? `${avgCompletion}% average completion` : 'Build a roadmap to track progress'}
          />
        ) : (
          <div className="card skeleton kpi-skeleton" />
        )}
      </div>

      <section className="dashboard-section">
        <div className="section-header">
          <h2 className="section-title">Active goals</h2>
        </div>

        {overview === null && <div className="card skeleton" style={{ height: 150 }} />}
        {overview && goals.length === 0 && (
          <div className="empty-state">No active goals yet. Create one from the Goals page to get started.</div>
        )}
        <div className="goals-widget-grid">
          {goals.map((goal) => (
            <GoalProgressWidget key={goal.goalId} goal={goal} />
          ))}
        </div>
      </section>

      <div className="dashboard-split">
        <section>
          <div className="section-header">
            <div>
              <h2 className="section-title">Today's plan</h2>
              {visibleTasks && visibleTasks.length > 0 && (
                <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                  {doneCount} of {visibleTasks.length} done
                </span>
              )}
            </div>

            {taskGoals.length > 1 && (
              <div className="filter-pills">
                <button
                  className={`filter-pill ${goalFilter === 'all' ? 'filter-pill-active' : ''}`}
                  onClick={() => setGoalFilter('all')}
                >
                  All goals
                </button>
                {taskGoals.map((g) => (
                  <button
                    key={g._id}
                    className={`filter-pill ${goalFilter === g._id ? 'filter-pill-active' : ''}`}
                    onClick={() => setGoalFilter(g._id)}
                  >
                    {g.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          {startError && <p className="auth-error" style={{ marginBottom: 'var(--space-3)' }}>{startError}</p>}

          {visibleTasks === null && <div className="card skeleton" style={{ height: 90 }} />}
          {visibleTasks?.length === 0 && <div className="empty-state">Nothing scheduled for today.</div>}

          <div className="task-list">
            {visibleTasks?.map((task) => (
              <TodayTaskCard
                key={task._id}
                task={task}
                onStart={handleStart}
                isStarting={startingId === task._id}
                showGoal={taskGoals.length > 1 && goalFilter === 'all'}
              />
            ))}
          </div>
        </section>

        <section>
          {heatmap ? <WeeklyChart data={heatmap} /> : <div className="card skeleton" style={{ height: 260 }} />}
        </section>
      </div>

      <section className="dashboard-section">
        {heatmap && heatmap.length > 0 && <Heatmap data={heatmap} />}
      </section>
    </div>
  );
}

export default Dashboard;