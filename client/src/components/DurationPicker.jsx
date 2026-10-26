import './DurationPicker.css';
import Select from './Select.jsx';

const HOUR_OPTIONS = Array.from({ length: 13 }, (_, i) => i); // 0–12
const MINUTE_OPTIONS = [0, 15, 30, 45];

function DurationPicker({ totalMinutes, onChange }) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const handleHoursChange = (e) => {
    onChange(Number(e.target.value) * 60 + minutes);
  };

  const handleMinutesChange = (e) => {
    onChange(hours * 60 + Number(e.target.value));
  };

  return (
    <div className="duration-picker">
      <div className="duration-field">
        <Select variant="inline" value={hours} onChange={handleHoursChange}>
          {HOUR_OPTIONS.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </Select>
        <span className="duration-unit">hr</span>
      </div>

      <div className="duration-field">
        <Select variant="inline" value={minutes} onChange={handleMinutesChange}>
          {MINUTE_OPTIONS.map((m) => (
            <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
          ))}
        </Select>
        <span className="duration-unit">min</span>
      </div>

      <span className="duration-summary text-muted">
        {hours > 0 && `${hours}h `}{minutes > 0 && `${minutes}m`}{totalMinutes === 0 && 'No time set'} / day
      </span>
    </div>
  );
}

export default DurationPicker;