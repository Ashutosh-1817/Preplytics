import { useEffect, useRef, useState } from 'react';
import './StreakBadge.css';

function StreakBadge({ currentStreak, longestStreak }) {
  const [pulse, setPulse] = useState(false);
  const prevStreak = useRef(currentStreak);

  useEffect(() => {
    if (prevStreak.current !== null && currentStreak > prevStreak.current) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 450);
      return () => clearTimeout(timer);
    }
    prevStreak.current = currentStreak;
  }, [currentStreak]);

  return (
    <div className="card streak-badge">
      <span className={`streak-number text-stat ${pulse ? 'streak-pulse' : ''}`}>
        🔥 {currentStreak}
      </span>
      <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
        day streak · best {longestStreak}
      </span>
    </div>
  );
}

export default StreakBadge;