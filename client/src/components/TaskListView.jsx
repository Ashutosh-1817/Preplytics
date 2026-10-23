import { Link } from 'react-router-dom';
import { isPastKey, displayStatus } from '../utils/calendarDays.js';
import './TaskListView.css';

const STATUS_PILL = {
  completed: { label: 'Completed', className: 'status-complete' },
  missed: { label: 'Missed', className: 'status-missed' },
  pushed: { label: 'Pushed', className: 'status-behind' },
  planned: { label: 'Planned', className: '' },
};

function TaskListView({ tasksByDate, onToggle }) {
  const sortedDates = Object.keys(tasksByDate).sort();

  if (sortedDates.length === 0) {
    return <p className="text-muted" style={{ padding: 'var(--space-6)' }}>No tasks scheduled this month.</p>;
  }

  return (
    <div className="task-list-view">
      {sortedDates.map((date) => {
        const past = isPastKey(date);
        return (
        <div key={date} className={`task-list-group ${past ? 'task-list-past' : ''}`}>
          <h4 className="task-list-date text-muted">
            {new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
            {past && <span className="past-tag">Past day · view only</span>}
          </h4>
          {tasksByDate[date].map((task) => {
            const status = STATUS_PILL[displayStatus(task, date)] || STATUS_PILL.planned;
            return (
              <label key={task._id} className="task-list-row">
                <input
                  type="checkbox"
                  checked={task.status === 'completed'}
                  disabled={past}
                  onChange={() => onToggle(task._id, task.status)}
                />
                <div className="task-list-info">
                  <span className="task-list-title">{task.nodeId?.title || 'Untitled task'}</span>
                  <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                    {[task.subjectTitle, task.chapterTitle].filter(Boolean).join(' › ')}
                  </span>
                </div>
                {past && task.status !== 'completed' && task.nodeId?._id && (
                  <Link to={`/prephub/${task.nodeId._id}`} className="past-link" onClick={(e) => e.stopPropagation()}>Study now</Link>
                )}
                <span className={`pill ${status.className}`} style={{ background: 'var(--surface-raised)' }}>
                  {status.label}
                </span>
              </label>
            );
          })}
        </div>
        );
      })}
    </div>
  );
}

export default TaskListView;