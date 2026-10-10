import { useState } from 'react';
import { createGoal } from '../services/goals.api.js';
import './CreateGoalModal.css';
import DurationPicker from './DurationPicker.jsx';

const PRESET_COLORS = ['#1F8A82', '#D79A3C', '#7C6FD6', '#4C8BD6', '#C1503F', '#3FA66B'];

function CreateGoalModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [dailyMinutes, setDailyMinutes] = useState(120);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const goal = await createGoal({
        title,
        description,
        targetDate: targetDate ? new Date(targetDate).toISOString() : null,
        color,
        dailyAvailableMinutes: Number(dailyMinutes),
      });
      onCreated(goal);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not create goal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-panel surface" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2 className="text-stat" style={{ fontSize: 'var(--text-lg)' }}>New goal</h2>

        {error && <p className="auth-error">{error}</p>}

        <label className="auth-label">
          Title
          <input className="auth-input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. GATE 2027" />
        </label>

        <label className="auth-label">
          Description <span className="text-muted">(optional)</span>
          <input className="auth-input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <label className="auth-label">
          Target date <span className="text-muted">(optional — leave blank for open-ended)</span>
          <input type="date" className="auth-input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </label>

        <label className="auth-label">
          Daily time you can give
            <DurationPicker totalMinutes={dailyMinutes} onChange={setDailyMinutes} />
        </label>

        <div className="auth-label">
          Color
          <div className="color-picker">
            {PRESET_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`color-swatch ${color === c ? 'color-swatch-active' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ flex: 1 }}>
            {isSubmitting ? 'Creating…' : 'Create goal'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateGoalModal;