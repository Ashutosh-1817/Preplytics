

import { useState } from 'react';
import { updateGoal } from '../services/goals.api.js';
import DurationPicker from './DurationPicker.jsx';
import './CreateGoalModal.css';

const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

function EditGoalModal({ goal, onClose, onSaved }) {
  const [title, setTitle] = useState(goal.title);
  const [targetDate, setTargetDate] = useState(toDateInput(goal.targetDate));
  const [dailyMinutes, setDailyMinutes] = useState(goal.dailyAvailableMinutes ?? 120);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');
    setIsSubmitting(true);

    try {
      await updateGoal(goal._id, {
        title: title.trim(),
        targetDate: targetDate ? new Date(targetDate).toISOString() : null,
        dailyAvailableMinutes: dailyMinutes,
      });
      onSaved();
    } catch (err) {
      const details = err.response?.data?.error?.details;
      setError(details?.[0]?.message || err.response?.data?.error?.message || 'Could not update the goal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-panel surface" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2 className="text-stat" style={{ fontSize: 'var(--text-lg)' }}>Edit goal</h2>

        {error && <p className="auth-error">{error}</p>}

        <label className="auth-label">
          Title
          <input className="auth-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>

        <label className="auth-label">
          Target date <span className="text-muted">(clear for open-ended)</span>
          <input type="date" className="auth-input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </label>

        <label className="auth-label">
          Daily time you can give
          <DurationPicker totalMinutes={dailyMinutes} onChange={setDailyMinutes} />
        </label>

        <p className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
          After saving, use Regenerate to apply the new deadline or daily time to your schedule.
        </p>

        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ flex: 1 }}>
            {isSubmitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default EditGoalModal;