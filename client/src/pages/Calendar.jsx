import { useEffect, useState } from 'react';
import { fetchGoals } from '../services/goals.api.js';
import { fetchCalendar, updateTaskStatus } from '../services/calendar.api.js';
import CalendarGrid from '../components/CalendarGrid.jsx';
import TaskListView from '../components/TaskListView.jsx';
import './Calendar.css';

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

  useEffect(() => {
    loadMonth();
  }, [selectedGoalId, cursor]);

  const handleDayClick = (key, dayTasks) => {
    setSelectedDay(key);
    setSelectedDayTasks(dayTasks);
  };

  const handleToggle = async (taskId, currentStatus) => {
    const newStatus = currentStatus === 'completed' ? 'planned' : 'completed';
    await updateTaskStatus(taskId, newStatus);
    await loadMonth();
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
            <select className="auth-input goal-select" value={selectedGoalId} onChange={(e) => setSelectedGoalId(e.target.value)}>
              {goals.map((g) => (
                <option key={g._id} value={g._id}>{g.title}</option>
              ))}
            </select>
          )}
        </div>
      </div>

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
                    <h3 className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>{selectedDay}</h3>
                    {selectedDayTasks.length > 0 && (
                      <span className="pill" style={{ background: 'color-mix(in srgb, var(--signal) 15%, transparent)', color: 'var(--signal)' }}>
                        {selectedDayTasks.filter((t) => t.status === 'completed').length}/{selectedDayTasks.length} done
                      </span>
                    )}
                  </div>

                  {selectedDayTasks.length === 0 && <p className="text-muted">Nothing scheduled.</p>}

                  <div className="task-interactive-list">
                    {selectedDayTasks.map((t) => (
                      <label key={t._id} className={`task-card-item ${t.status === 'completed' ? 'completed' : ''}`}>
                        <input type="checkbox" checked={t.status === 'completed'} onChange={() => handleToggle(t._id, t.status)} />
                        <div className="task-info">
                          <span className="task-title">{t.nodeId?.title || 'Untitled task'}</span>
                          <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                            {[t.subjectTitle, t.chapterTitle].filter(Boolean).join(' › ')}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-muted">Click a day to see its tasks.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CalendarPage;