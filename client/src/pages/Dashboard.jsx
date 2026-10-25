import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Flame, Clock, Target, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchOverview, fetchStreak, fetchHeatmap, fetchTodayTasks } from '../services/dashboard.api.js';
import { startSession, getSessionConflict } from '../services/sessions.api.js';
import { writeActiveSession } from '../utils/activeSessionStorage.js';
import SessionConflictDialog from '../components/SessionConflictDialog.jsx';
import {
  KpiCard, Sparkline, GoalProgressWidget, WeeklyChart, TodayTaskCard, formatMinutes, getDisplayStatus,
} from '../components/DashboardWidgets.jsx';
import Heatmap from '../components/Heatmap.jsx';
import './Dashboard.css';

function computeWeeklyTrend(heatmapData) {
  if (!heatmapData || heatmapData.length < 14) return null;
  const last7 = heatmapData.slice(-7).reduce((sum, d) => sum + d.minutes, 0);
  const prev7 = heatmapData.slice(-14, -7).reduce((sum, d) => sum + d.minutes, 0);
  if (prev7 === 0) return last7 > 0 ? 100 : null;
  return Math.round(((last7 - prev7) / prev7) * 100);
}

const WEEKDAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// The top of the dashboard answers one question: what is left to study today?
// Topics sit in a swipeable row; the arrows move through them one at a time.
function TodayHero({ tasks, week, onStart, startingId }) {
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);

  if (tasks === null) return <div className="hero-today skeleton" />;

  // Tasks whose topic was deleted cannot be started, so they stay out of the row.
  const usable = tasks.filter((t) => t.nodeId);
  const pending = usable.filter((t) => ['planned', 'in_progress'].includes(getDisplayStatus(t)));
  const done = usable.filter((t) => getDisplayStatus(t) === 'completed').length;
  const plannedMinutes = pending.reduce((sum, t) => sum + (t.nodeId?.estimatedMinutes || 0), 0);
  const maxMinutes = Math.max(...week.map((d) => d.minutes), 1);

  let title;
  let count = pending.length;
  if (usable.length === 0) {
    count = 0;
    title = 'Nothing scheduled today';
  } else if (pending.length === 0) {
    count = done;
    title = done === 1 ? 'topic finished today' : 'topics finished today';
  } else {
    title = pending.length === 1 ? 'topic left today' : 'topics left today';
  }

  const goTo = (i) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  const handleScroll = (e) => {
    const el = e.currentTarget;
    if (el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="hero-today">
      <div className="hero-top">
        <span className="hero-count">{count}</span>
        <div className="hero-count-label">
          <span className="hero-title">{title}</span>
          {usable.length > 0 && (
            <div className="hero-meta">
              {plannedMinutes > 0 && <span>{formatMinutes(plannedMinutes)} planned</span>}
              <span>{done} done</span>
            </div>
          )}
        </div>
      </div>

      {pending.length > 0 ? (
        <div className="hero-carousel">
          <div className="hero-track" ref={trackRef} onScroll={handleScroll}>
            {pending.map((task, i) => {
              const crumb = [task.subjectTitle, task.chapterTitle].filter(Boolean).join(' › ');
              const minutes = formatMinutes(task.nodeId?.estimatedMinutes);
              return (
                <div className="hero-slide" key={task._id}>
                  <div className="hero-slide-text">
                    <span className="hero-slide-label">
                      {i === 0 ? 'Next up' : `Topic ${i + 1}`}
                      {task.goalId?.title ? ` · ${task.goalId.title}` : ''}
                      {minutes ? ` · ${minutes}` : ''}
                    </span>
                    <span className="hero-slide-title">{task.nodeId.title || 'Untitled topic'}</span>
                    {crumb && <span className="hero-slide-crumb">{crumb}</span>}
                  </div>
                  <button type="button" className="hero-start" onClick={() => onStart(task)} disabled={startingId === task._id}>
                    <Play size={14} fill="currentColor" />
                    {startingId === task._id ? 'Starting…' : 'Start'}
                  </button>
                </div>
              );
            })}
          </div>
          {pending.length > 1 && (
            <div className="hero-nav">
              <span className="hero-nav-count">{Math.min(index + 1, pending.length)} of {pending.length}</span>
              <div className="hero-nav-btns">
                <button type="button" className="hero-nav-btn" aria-label="Previous topic" onClick={() => goTo(index - 1)} disabled={index <= 0}>
                  <ChevronLeft size={16} />
                </button>
                <button type="button" className="hero-nav-btn" aria-label="Next topic" onClick={() => goTo(index + 1)} disabled={index >= pending.length - 1}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="hero-empty">
          <span>{usable.length === 0 ? 'Add topics to your calendar to see them here.' : 'Everything planned for today is done.'}</span>
          <Link to="/calendar" className="hero-link">Open calendar</Link>
        </div>
      )}

      <div className="hero-week" aria-label="Study time over the last 7 days">
        {week.map((d) => {
          const empty = d.minutes === 0;
          const opacity = empty ? 1 : 0.3 + 0.7 * (d.minutes / maxMinutes);
          return (
            <div className="hero-week-day" key={d.date} title={`${d.date}: ${d.minutes} min`}>
              <span className={`hero-week-cell ${empty ? 'is-empty' : ''}`} style={empty ? undefined : { opacity }} />
              <span>{WEEKDAY_INITIAL[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}</span>
            </div>
          );
        })}
        <span className="hero-week-note">Last 7 days</span>
      </div>
    </div>
  );
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
  const [conflict, setConflict] = useState(null); 

  useEffect(() => {
    fetchOverview().then(setOverview).catch(() => setOverview({ goals: [] }));
    fetchStreak().then(setStreak).catch(() => setStreak({ currentStreak: 0, longestStreak: 0 }));
    fetchHeatmap().then(setHeatmap).catch(() => setHeatmap([]));
    fetchTodayTasks().then(setTasks).catch(() => setTasks([]));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name ? user.name.trim().split(/\s+/)[0] : '';
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

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

  // force = false: the first attempt.
  // force = true: after the user said "Yes, close the other one".
  const attemptStart = async (task, force = false) => {
    setStartError('');
    setStartingId(task._id);

    const nodeId = task.nodeId?._id;
    const goalId = task.goalId?._id;

    try {
      const session = await startSession(nodeId, { force });
      writeActiveSession(session._id, nodeId, session.startedAt);
      setConflict(null);
      navigate(`/goals/${goalId}?node=${nodeId}`);
    } catch (err) {
      const running = getSessionConflict(err);

      if (running && running.nodeId === nodeId) {
        // Already running on this exact topic — just resume it
        writeActiveSession(running.sessionId, nodeId, running.startedAt);
        setConflict(null);
        navigate(`/goals/${goalId}?node=${nodeId}`);
        return;
      }

      if (running) {
        // Running on a different topic: ask before closing it
        setConflict({ running, task });
      } else {
        setConflict(null);
        setStartError(err.response?.data?.error?.message || 'Could not start the timer.');
      }
      setStartingId(null);
    }
  };

  const handleStart = (task) => attemptStart(task, false);

  return (
    <div className="dashboard">
      <header className="dash-head">
        <p className="dash-date">{dateLabel}</p>
        <h1 className="text-stat dashboard-greeting">
          {greeting}{firstName ? `, ${firstName}` : ''}
        </h1>
      </header>

      <div className="dash-top">
        <TodayHero tasks={tasks} week={heatmap ? heatmap.slice(-7) : []} onStart={handleStart} startingId={startingId} />

        <div className="dash-stats">
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
            <div className="skeleton kpi-skeleton" />
          )}

          {heatmap ? (
            <KpiCard icon={Clock} tone="signal" label="Total study time" value={totalHours} unit="h" trend={weeklyTrend} sub="Last 365 days">
              <Sparkline values={last7Minutes} />
            </KpiCard>
          ) : (
            <div className="skeleton kpi-skeleton" />
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
            <div className="skeleton kpi-skeleton" />
          )}
        </div>
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

      {conflict && (
        <SessionConflictDialog
          conflict={conflict.running}
          onConfirm={() => attemptStart(conflict.task, true)}
          onCancel={() => setConflict(null)}
        />
      )}
    </div>
  );
}

export default Dashboard;