

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, AlertTriangle } from 'lucide-react';
import { fetchGoals, deleteGoal } from '../services/goals.api.js';
import CreateGoalModal from '../components/CreateGoalModal.jsx';
import './Goals.css';

function Goals() {
  const navigate = useNavigate();
  const [goals, setGoals] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const loadGoals = () => fetchGoals().then(setGoals).catch(() => setGoals([]));

  useEffect(() => {
    loadGoals();
  }, []);

  const handleCreated = (goal) => {
    setShowModal(false);
    navigate(`/goals/${goal._id}`);
  };

  const handleDeleteGoal = async (goalId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this goal and everything in it — roadmap, notes, files, schedule? This cannot be undone.')) return;

    try {
      await deleteGoal(goalId);
      await loadGoals();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Could not delete this goal. Check the console for details.');
      console.error('Goal delete failed:', err);
    }
  };

  return (
    <div className="goals-page">
      <div className="goals-header">
        <h1 className="text-stat" style={{ fontSize: 'var(--text-2xl)' }}>Goals</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New goal</button>
      </div>

      {goals === null && <div className="skeleton" style={{ height: 120, marginTop: 'var(--space-6)' }} />}

      {goals?.length === 0 && (
        <div className="surface goals-empty">
          <p>No goals yet — create your first one to start building a roadmap.</p>
        </div>
      )}

      <div className="goals-grid">
        {goals?.map((goal) => (
          <div
            key={goal._id}
            className="card goal-card"
            style={{ '--goal-accent': goal.color }}
            onClick={() => navigate(`/goals/${goal._id}`)}
          >
            <button className="goal-card-delete" onClick={(e) => handleDeleteGoal(goal._id, e)} title="Delete goal">
              <Trash2 size={16} />
            </button>

            <span className="goal-dot" style={{ background: goal.color }} />
            <h3 className="goal-card-title">{goal.title}</h3>
            {goal.description && <p className="goal-card-desc">{goal.description}</p>}
            <div className="goal-card-meta">
              <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                {goal.targetDate ? `Due ${new Date(goal.targetDate).toLocaleDateString()}` : 'Open-ended'}
              </span>
              {goal.isOverloaded && <span className="goal-overload-badge"><AlertTriangle size={12} /> Overloaded</span>}
            </div>
          </div>
        ))}
      </div>

      {showModal && <CreateGoalModal onClose={() => setShowModal(false)} onCreated={handleCreated} />}
    </div>
  );
}

export default Goals;