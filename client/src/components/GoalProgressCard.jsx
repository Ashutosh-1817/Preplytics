import { Link } from 'react-router-dom';
import './GoalProgressCard.css';

function GoalProgressCard({ goal }) {
  const percent = goal.completionPercent ?? 0;
  const isEmpty = goal.completionPercent === null;

  return (
    <Link to={`/goals/${goal.goalId}`} className="goal-progress-card">
      <div className="goal-progress-header">
        <span className="goal-dot" style={{ background: goal.color }} />
        <span style={{ fontWeight: 500 }}>{goal.title}</span>
        {goal.isOverloaded && <span className="status-behind" style={{ fontSize: 'var(--text-xs)' }}>⚠ behind pace</span>}
      </div>

      {isEmpty ? (
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>No roadmap yet</p>
      ) : (
        <>
          <div className="goal-progress-track">
            <div className="goal-progress-fill" style={{ width: `${percent}%`, background: goal.color }} />
          </div>
          <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>{percent}% complete</span>
        </>
      )}
    </Link>
  );
}

export default GoalProgressCard;