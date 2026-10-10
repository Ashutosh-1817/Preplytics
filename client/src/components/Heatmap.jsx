// src/components/Heatmap.jsx — full rewrite: 3-month navigable window over real session data

import { useState, useMemo } from 'react';
import './Heatmap.css';

const getIntensityLevel = (minutes) => {
  if (minutes === 0) return 0;
  if (minutes < 20) return 1;
  if (minutes < 45) return 2;
  if (minutes < 90) return 3;
  return 4;
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Heatmap({ data }) {
  const [monthOffset, setMonthOffset] = useState(0); // 0 = most recent 3 months (ending this month)

  // Index the real 365-day dataset by "YYYY-MM-DD" for fast lookup
  const minutesByDate = useMemo(() => {
    const map = new Map();
    data.forEach((d) => map.set(d.date, d.minutes));
    return map;
  }, [data]);

  const today = new Date();
  const earliestDate = data[0] ? new Date(data[0].date) : today;

  // anchorMonth = the LAST (rightmost) month shown, offset back from the current month
  const anchor = new Date(Date.UTC(today.getFullYear(), today.getMonth() + monthOffset, 1));

  const visibleMonths = [-2, -1, 0].map((delta) => {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + delta, 1));
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return {
      name: MONTH_NAMES[d.getUTCMonth()],
      year: d.getUTCFullYear(),
      monthIndex: d.getUTCMonth(),
      daysInMonth,
      firstWeekday: d.getUTCDay(),
    };
  });

  // Can't go forward past the current real month — no future session data exists
  const canGoNext = monthOffset < 0;
  // Can't go back further than the real data we have
  const earliestVisibleMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 2, 1));
  const canGoPrev = earliestVisibleMonth > earliestDate;

  return (
    <div className="card heatmap-card">
      <div className="heatmap-header">
        <h3 className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          Time spent — {visibleMonths[0].name} {visibleMonths[0].year} to {visibleMonths[2].name} {visibleMonths[2].year}
        </h3>
        <div className="heatmap-nav">
          {monthOffset !== 0 && (
            <button type="button" className="btn-today" onClick={() => setMonthOffset(0)}>Today</button>
          )}
          <button type="button" className="btn-nav" disabled={!canGoPrev} onClick={() => setMonthOffset((o) => o - 1)}>‹</button>
          <button type="button" className="btn-nav" disabled={!canGoNext} onClick={() => setMonthOffset((o) => o + 1)}>›</button>
        </div>
      </div>

      <div className="months-container">
        {visibleMonths.map((m) => (
          <div key={`${m.year}-${m.monthIndex}`} className="month-block">
            <div className="month-name">{m.name} {m.year}</div>
            <div className="month-days-grid">
              {Array.from({ length: m.firstWeekday }).map((_, i) => (
                <div key={`pad-${i}`} className="day-cell pad" />
              ))}
              {Array.from({ length: m.daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateKey = `${m.year}-${String(m.monthIndex + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const minutes = minutesByDate.get(dateKey) ?? 0;
                const isFuture = new Date(dateKey) > today;

                return (
                  <div
                    key={dayNum}
                    className={`day-cell ${isFuture ? 'day-cell-future' : `heatmap-level-${getIntensityLevel(minutes)}`}`}
                    title={isFuture ? dateKey : `${dateKey}: ${minutes} min`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="heatmap-legend">
        <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div key={level} className={`day-cell heatmap-level-${level}`} />
        ))}
        <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>More</span>
      </div>
    </div>
  );
}

export default Heatmap;