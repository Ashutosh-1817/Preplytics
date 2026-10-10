// src/components/KpiCard.jsx

import './KpiCard.css';

function KpiCard({ icon, label, value, trend }) {
  return (
    <div className="card kpi-card">
      <div className="kpi-icon">{icon}</div>
      <div className="text-stat kpi-value">{value}</div>
      <div className="kpi-label text-muted">{label}</div>
      {trend !== undefined && trend !== null && (
        <div className={`kpi-trend ${trend >= 0 ? 'status-complete' : 'status-missed'}`}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% from last week
        </div>
      )}
    </div>
  );
}

export default KpiCard;