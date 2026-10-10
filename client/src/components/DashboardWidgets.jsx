import { useId } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, CalendarDays, Clock, BookOpen,
  Play, ArrowRight, CheckCircle2, AlertTriangle,
} from 'lucide-react';

export const formatMinutes = (mins) => {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

/* ---------- KPI card ---------- */

export function KpiCard({ icon: Icon, tone = 'signal', label, value, unit, sub, trend, children }) {
  return (
    <div className={`card kpi-card kpi-tone-${tone}`}>
      <div className="kpi-icon-badge">
        <Icon size={22} strokeWidth={2.1} />
      </div>

      <div className="kpi-body">
        <span className="kpi-label">{label}</span>
        <span className="kpi-value text-stat">
          {value}
          {unit && <span className="kpi-unit">{unit}</span>}
        </span>
        <div className="kpi-footer">
          {trend !== undefined && trend !== null ? (
            <span className={`kpi-trend ${trend >= 0 ? 'kpi-trend-up' : 'kpi-trend-down'}`}>
              {trend >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {Math.abs(trend)}% vs last week
            </span>
          ) : (
            sub && <span className="kpi-sub">{sub}</span>
          )}
        </div>
      </div>

      {children && <div className="kpi-visual">{children}</div>}
    </div>
  );
}

/* ---------- Sparkline (real data, last 7 days) ---------- */

export function Sparkline({ values, width = 104, height = 40 }) {
  const rawId = useId();
  const gradId = `spark-${rawId.replace(/:/g, '')}`;

  if (!values || values.length < 2) return null;

  const pad = 4;
  const max = Math.max(...values, 1);
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => [i * stepX, height - pad - (v / max) * (height - pad * 2)]);
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="3" fill="currentColor" />
    </svg>
  );
}

/* ---------- Goal progress widget ---------- */

export function GoalProgressWidget({ goal }) {
  const percent = goal.completionPercent;
  const hasRoadmap = percent !== null;

  const daysLeft = goal.targetDate
    ? Math.ceil((new Date(goal.targetDate) - new Date()) / 86400000)
    : null;

  const dueLabel = goal.targetDate
    ? new Date(goal.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const daysLabel =
    daysLeft === null ? null
    : daysLeft > 0 ? `${daysLeft} days left`
    : daysLeft === 0 ? 'Due today'
    : `${Math.abs(daysLeft)} days overdue`;

  return (
    <Link to={`/goals/${goal.goalId}`} className="card goal-widget" style={{ '--goal-accent': goal.color }}>
      <div className="goal-widget-head">
        <span className="goal-widget-dot" />
        <h3 className="goal-widget-title">{goal.title}</h3>
        <ArrowRight className="goal-widget-arrow" size={18} />
      </div>

      <div className="goal-widget-stat">
        <span className="goal-widget-percent text-stat">{hasRoadmap ? `${percent}%` : '—'}</span>
        <span className="goal-widget-sub">
          {hasRoadmap ? `${goal.completedActionable} of ${goal.totalActionable} topics done` : 'No roadmap yet'}
        </span>
      </div>

      <div className="goal-bar-track">
        <div className="goal-bar-fill" style={{ width: `${percent || 0}%` }} />
      </div>

      <div className="goal-widget-pills">
        {dueLabel && (
          <span className="pill goal-pill">
            <CalendarDays size={12} /> {dueLabel}
          </span>
        )}
        {daysLabel && (
          <span className={`pill goal-pill ${daysLeft !== null && daysLeft < 30 ? 'goal-pill-warn' : ''}`}>
            {daysLabel}
          </span>
        )}
        {goal.isOverloaded && (
          <span className="pill goal-pill goal-pill-alert">
            <AlertTriangle size={12} /> Behind pace
          </span>
        )}
      </div>
    </Link>
  );
}

/* ---------- Weekly bar chart (real data) ---------- */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function WeeklyChart({ data }) {
  const week = data.slice(-7);
  const total = week.reduce((sum, d) => sum + d.minutes, 0);
  const max = Math.max(...week.map((d) => d.minutes), 30);

  return (
    <div className="card week-card">
      <div className="week-header">
        <div>
          <h3 className="section-title">This week</h3>
          <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
            {total > 0 ? `${formatMinutes(total)} studied in the last 7 days` : 'No study time logged yet'}
          </span>
        </div>
      </div>

      <div className="week-bars">
        {week.map((d, i) => {
          const pct = (d.minutes / max) * 100;
          const isToday = i === week.length - 1;
          return (
            <div key={d.date} className="week-bar-col" title={`${d.date}: ${d.minutes} min`}>
              <div className="week-bar-track">
                <div
                  className={`week-bar ${isToday ? 'week-bar-today' : ''}`}
                  style={{ height: `${d.minutes > 0 ? Math.max(pct, 8) : 0}%`, animationDelay: `${i * 60}ms` }}
                />
              </div>
              <span className={`week-bar-label ${isToday ? 'week-bar-label-today' : ''}`}>
                {DAY_LABELS[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Today's plan task card ---------- */

const STATUS_META = {
  planned: { label: 'Planned', tone: 'planned' },
  in_progress: { label: 'In progress', tone: 'progress' },
  completed: { label: 'Completed', tone: 'done' },
  missed: { label: 'Missed', tone: 'missed' },
  pushed: { label: 'Pushed', tone: 'pushed' },
};

// A task's own status only knows planned/completed/missed/pushed —
// "in progress" lives on the underlying topic, so we derive it here.
export const getDisplayStatus = (task) => {
  if (task.status === 'completed') return 'completed';
  if (task.status === 'missed') return 'missed';
  if (task.status === 'pushed') return 'pushed';
  if (task.nodeId?.status === 'in_progress') return 'in_progress';
  return 'planned';
};

export function TodayTaskCard({ task, onStart, isStarting, showGoal }) {
  const status = getDisplayStatus(task);
  const meta = STATUS_META[status];
  const crumb = [task.subjectTitle, task.chapterTitle].filter(Boolean).join(' › ');
  const estimate = formatMinutes(task.nodeId?.estimatedMinutes);

  return (
    <div className={`task-card task-card-${meta.tone}`}>
      <span className="task-card-bar" />

      <div className="task-card-main">
        <span className="task-card-title">{task.nodeId?.title || 'Untitled task'}</span>
        <div className="task-card-tags">
          {crumb && (
            <span className="task-tag">
              <BookOpen size={12} /> {crumb}
            </span>
          )}
          {estimate && (
            <span className="task-tag">
              <Clock size={12} /> {estimate}
            </span>
          )}
          {showGoal && task.goalId?.title && (
            <span className="task-tag">
              <span className="task-tag-dot" style={{ background: task.goalId.color }} />
              {task.goalId.title}
            </span>
          )}
        </div>
      </div>

      <span className={`task-status-pill task-status-${meta.tone}`}>
        {status === 'completed' && <CheckCircle2 size={13} />}
        {meta.label}
      </span>

      {status !== 'completed' && (
        <button className="task-start-btn" onClick={() => onStart(task)} disabled={isStarting}>
          <Play size={13} fill="currentColor" />
          {isStarting ? 'Starting…' : 'Start'}
        </button>
      )}
    </div>
  );
}