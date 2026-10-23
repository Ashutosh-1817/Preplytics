import './CalendarGrid.css';
import { isPastKey, displayStatus } from '../utils/calendarDays.js';


const STATUS_DOT = {
  completed: 'status-complete',
  missed: 'status-missed',
  pushed: 'status-behind',
  planned: '',
};

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function CalendarGrid({ year, month, tasksByDate, onDayClick, selectedDate }) {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sunday
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const todayKey = toDateKey(new Date());

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(Date.UTC(year, month, d)));

  return (
    <div className="calendar-grid">
      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
        <div key={d} className="calendar-weekday">{d}</div>
      ))}

      {cells.map((date, i) => {
        if (!date) return <div key={`empty-${i}`} className="calendar-cell calendar-cell-empty" />;

        const key = toDateKey(date);
        const dayTasks = tasksByDate[key] || [];
        const isToday = key === todayKey;
        const isSelected = key === selectedDate;
        const isPast = isPastKey(key);
        const allCompleted = dayTasks.length > 0 && dayTasks.every((t) => t.status === 'completed');

        return (
          <div
            key={key}
            className={`calendar-cell ${isToday ? 'calendar-cell-today' : ''} ${isSelected ? 'calendar-cell-selected' : ''} ${allCompleted ? 'calendar-cell-done' : ''} ${isPast ? 'calendar-cell-past' : ''}`}
            title={isPast ? 'Past day: view only' : undefined}
            onClick={() => onDayClick(key, dayTasks)}
          >
            <span className="calendar-date">{allCompleted ? '✓' : date.getUTCDate()}</span>
            {dayTasks.length > 0 && (
              <div className="calendar-dots">
                {dayTasks.slice(0, 4).map((t) => (
                  <span key={t._id} className={`calendar-dot ${STATUS_DOT[displayStatus(t, key)]}`} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default CalendarGrid;