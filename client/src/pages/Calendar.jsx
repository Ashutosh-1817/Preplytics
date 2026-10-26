import { useEffect, useState } from 'react';
import { fetchGoals } from '../services/goals.api.js';
import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { fetchCalendar, updateTaskStatus, fetchCatchUp } from '../services/calendar.api.js';
import { isPastKey, displayStatus, dayLabel } from '../utils/calendarDays.js';
import CatchUpDialog from '../components/CatchUpDialog.jsx';
import CalendarGrid from '../components/CalendarGrid.jsx';
import TaskListView from '../components/TaskListView.jsx';
import './Calendar.css';
import Select from '../components/Select.jsx';

function startOfMonthRange(year, month) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function CalendarPage() {
  const [goals, setGoals] = useState([]);
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [cursor, setCursor] = useState(new Date());
  const [tasksByDate, setTasksByDate] = useState({});
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDayTasks, setSelectedDayTasks] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState('calendar'); // 'calendar' | 'list'
  const [catchUp, setCatchUp] = useState(null); // preview of missed past topics
  const [catchUpOpen, setCatchUpOpen] = useState(false);

  useEffect(() => {
    fetchGoals().then((g) => {
      setGoals(g);
      if (g.length > 0) setSelectedGoalId(g[0]._id);
    });
  }, []);

  const loadMonth = async () => {
    if (!selectedGoalId) return;
    setLoadError('');
    try {
      const { startDate, endDate } = startOfMonthRange(cursor.getUTCFullYear(), cursor.getUTCMonth());
      const tasks = await fetchCalendar(selectedGoalId, startDate, endDate);

      const grouped = {};
      tasks.forEach((t) => {
        const key = new Date(t.scheduledDate).toISOString().slice(0, 10);
        grouped[key] = grouped[key] || [];
        grouped[key].push(t);
      });
      setTasksByDate(grouped);
    } catch (err) {
      setLoadError(err.response?.data?.error?.message || 'Could not load calendar.');
      setTasksByDate({});
    }
  };

  const loadCatchUp = async () => {
    if (!selectedGoalId) return;
    try {
      setCatchUp(await fetchCatchUp(selectedGoalId));
    } catch {
      setCatchUp(null); // the banner is a convenience; the calendar still works without it
    }
  };

  useEffect(() => {
    loadMonth();
  }, [selectedGoalId, cursor]);

  useEffect(() => {
    if (!selectedGoalId) return;
    fetchCatchUp(selectedGoalId).then(setCatchUp).catch(() => setCatchUp(null));
  }, [selectedGoalId]);

  const handleCatchUpDone = async () => {
    setCatchUpOpen(false);
    setSelectedDay(null);
    setSelectedDayTasks([]);
    await Promise.all([loadMonth(), loadCatchUp()]);
  };

  const handleDayClick = (key, dayTasks) => {
    setSelectedDay(key);
    setSelectedDayTasks(dayTasks);
  };

  const handleToggle = async (taskId, currentStatus) => {
    const day = Object.keys(tasksByDate).find((k) => tasksByDate[k].some((t) => t._id === taskId));
    if (day && isPastKey(day)) return; // past days are view-only
    const newStatus = currentStatus === 'completed' ? 'planned' : 'completed';
    await updateTaskStatus(taskId, newStatus);
    await Promise.all([loadMonth(), loadCatchUp()]);
    setSelectedDayTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, status: newStatus } : t)));
  };

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <h1 className="text-stat" style={{ fontSize: 'var(--text-2xl)' }}>Calendar</h1>

        <div className="calendar-header-controls">
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${view === 'calendar' ? 'view-toggle-active' : ''}`}
              onClick={() => setView('calendar')}
            >
              📅 Calendar
            </button>
            <button
              className={`view-toggle-btn ${view === 'list' ? 'view-toggle-active' : ''}`}
              onClick={() => setView('list')}
            >
              ☰ List
            </button>
          </div>

          {goals.length > 0 && (
            <Select className="ui-select--wide" aria-label="Goal" value={selectedGoalId} onChange={(e) => setSelectedGoalId(e.target.value)}>
              {goals.map((g) => (
                <option key={g._id} value={g._id}>{g.title}</option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {catchUp?.missedCount > 0 && (
        <div className="catchup-banner">
          <CalendarClock size={18} />
          <span>
            <strong>{catchUp.missedCount} {catchUp.missedCount === 1 ? 'topic' : 'topics'}</strong> from past days {catchUp.missedCount === 1 ? "wasn't" : "weren't"} completed. Past days can't be changed, but you can reschedule them.
          </span>
          <button type="button" className="btn btn-primary" onClick={() => setCatchUpOpen(true)}>Catch up</button>
        </div>
      )}

      {goals.length === 0 ? (
        <p className="text-muted">Create a goal first, then generate its schedule to see it here.</p>
      ) : (
        <div className="calendar-body">
          <div className="surface calendar-panel">
            {view === 'calendar' && (
              <div className="calendar-nav">
                <button className="btn btn-ghost" onClick={() => setCursor(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1)))}>‹</button>
                <span style={{ fontWeight: 600 }}>{monthLabel}</span>
                <button className="btn btn-ghost" onClick={() => setCursor(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)))}>›</button>
              </div>
            )}

            {loadError && <p className="auth-error" style={{ margin: 'var(--space-4)' }}>{loadError}</p>}

            {view === 'calendar' ? (
              <div style={{ padding: 'var(--space-4)' }}>
                <CalendarGrid
                  year={cursor.getUTCFullYear()}
                  month={cursor.getUTCMonth()}
                  tasksByDate={tasksByDate}
                  onDayClick={handleDayClick}
                  selectedDate={selectedDay}
                />
              </div>
            ) : (
              <TaskListView tasksByDate={tasksByDate} onToggle={handleToggle} />
            )}
          </div>

          {view === 'calendar' && (
            <div className="surface calendar-day-panel">
              {selectedDay ? (
                <>
                  <div className="panel-header">
                    <h3 className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>{dayLabel(selectedDay)}</h3>
                    {selectedDayTasks.length > 0 && (
                      <span className="pill" style={{ background: 'color-mix(in srgb, var(--signal) 15%, transparent)', color: 'var(--signal)' }}>
                        {selectedDayTasks.filter((t) => t.status === 'completed').length}/{selectedDayTasks.length} done
                      </span>
                    )}
                  </div>

                  {selectedDayTasks.length === 0 && <p className="text-muted">Nothing scheduled.</p>}
                  {isPastKey(selectedDay) && (
                    <p className="past-note">Past day, view only. Finish anything not done from its topic page, or use Catch up to reschedule it.</p>
                  )}

                  <div className="task-interactive-list">
                    {selectedDayTasks.map((t) => {
                      const past = isPastKey(selectedDay);
                      const shown = displayStatus(t, selectedDay);
                      return (
                        <label key={t._id} className={`task-card-item ${t.status === 'completed' ? 'completed' : ''} ${past ? 'task-card-past' : ''}`}>
                          <input type="checkbox" checked={t.status === 'completed'} disabled={past} onChange={() => handleToggle(t._id, t.status)} />
                          <div className="task-info">
                            <span className="task-title">{t.nodeId?.title || 'Untitled task'}</span>
                            <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                              {[t.subjectTitle, t.chapterTitle].filter(Boolean).join(' › ')}
                            </span>
                          </div>
                          {past && shown === 'missed' && <span className="pill status-missed">Not done</span>}
                          {past && shown === 'missed' && t.nodeId?._id && (
                            <Link to={`/prephub/${t.nodeId._id}`} className="past-link" onClick={(e) => e.stopPropagation()}>Study now</Link>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-muted">Click a day to see its tasks.</p>
              )}
            </div>
          )}
        </div>
      )}
      {catchUpOpen && catchUp && (
        <CatchUpDialog goalId={selectedGoalId} preview={catchUp} onClose={() => setCatchUpOpen(false)} onDone={handleCatchUpDone} />
      )}
    </div>
  );
}

export default CalendarPage;