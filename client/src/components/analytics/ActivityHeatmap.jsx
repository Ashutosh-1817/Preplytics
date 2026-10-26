import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Card, EmptyState, dayLabelLong, fmtMin } from './chartKit.jsx';

const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CELL = 12;
const GAP = 3;
const CALENDAR_MAX_DAYS = 31;

const utc = (key) => new Date(`${key}T00:00:00Z`);

// Level 1-4 by quartile of the non-zero days, so a quiet user still sees contrast.
function levelFn(daily) {
  const vals = daily.map((d) => d.minutes).filter((m) => m > 0).sort((a, b) => a - b);
  if (vals.length === 0) return () => 0;
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  const [a, b, c] = [q(0.25), q(0.5), q(0.75)];
  return (m) => (m <= 0 ? 0 : m <= a ? 1 : m <= b ? 2 : m <= c ? 3 : 4);
}

const tipOf = (d) =>
  `${dayLabelLong(d.date)} · ${d.minutes > 0 ? `${fmtMin(d.minutes)}, ${d.sessions} session${d.sessions === 1 ? '' : 's'}` : 'no study'}`;

// Monday-first columns of 7 (null = padding before the first day).
function toWeeks(daily) {
  const lead = (utc(daily[0].date).getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...daily];
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function CalendarTiles({ daily, level, todayKey }) {
  const cells = toWeeks(daily).flat();
  return (
    <div>
      <div className="ax-cal-head" aria-hidden="true">{WEEKDAYS_SHORT.map((d) => <span key={d}>{d.slice(0, 3)}</span>)}</div>
      <div className="ax-cal" role="img" aria-label="Calendar of study activity">
        {cells.map((d, i) =>
          d ? (
            <div
              key={d.date}
              className={`ax-cell ax-tile-day lv-${level(d.minutes)} ${d.date === todayKey ? 'is-today' : ''}`}
              data-tip={tipOf(d)}
            >
              {utc(d.date).getUTCDate()}
            </div>
          ) : (
            <div key={`b${i}`} className="ax-cell ax-tile-day is-blank" />
          ),
        )}
      </div>
    </div>
  );
}

function GridHeatmap({ daily, level }) {
  const [hot, setHot] = useState(null);
  const weeks = useMemo(() => toWeeks(daily), [daily]);

  const W = weeks.length * (CELL + GAP) - GAP;
  const H = 7 * (CELL + GAP) - GAP;

  const months = useMemo(() => {
    const out = [];
    let last = -1;
    weeks.forEach((w, wi) => {
      const first = w.find(Boolean);
      if (!first) return;
      const m = utc(first.date).getUTCMonth();
      if (m !== last) {
        last = m;
        // skip a label that would collide with the previous one
        if (!out.length || wi - out[out.length - 1].wi >= 3) {
          out.push({ wi, label: utc(first.date).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }) });
        }
      }
    });
    return out;
  }, [weeks]);

  return (
    <div className="ax-heat">
      <div className="ax-heat-days" aria-hidden="true">
        {WEEKDAYS_SHORT.map((d, i) => <span key={d}>{i % 2 === 0 ? d : ''}</span>)}
      </div>
      <div className="ax-heat-main" onMouseLeave={() => setHot(null)}>
        <div className="ax-heat-months" aria-hidden="true">
          {months.map((m) => (
            <span key={m.wi} style={{ left: `${(m.wi * (CELL + GAP)) / W * 100}%` }}>{m.label}</span>
          ))}
        </div>

        <div className="ax-heat-plot">
        <svg className="ax-heat-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Activity heatmap" preserveAspectRatio="xMinYMin meet">
          {weeks.map((w, wi) =>
            w.map((d, di) =>
              d ? (
                <rect
                  key={d.date}
                  x={wi * (CELL + GAP)}
                  y={di * (CELL + GAP)}
                  width={CELL}
                  height={CELL}
                  rx={3}
                  className={`lv-${level(d.minutes)} ${hot?.date === d.date ? 'is-hot' : ''}`}
                  onMouseEnter={() => setHot({ ...d, wi, di })}
                />
              ) : null,
            ),
          )}
        </svg>

        {hot && (
          <div
            className="ax-heat-tip"
            style={{
              left: `${((hot.wi * (CELL + GAP) + CELL / 2) / W) * 100}%`,
              top: `${((hot.di * (CELL + GAP)) / H) * 100}%`,
            }}
          >
            {tipOf(hot)}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

export default function ActivityHeatmap({ daily }) {
  const level = useMemo(() => levelFn(daily), [daily]);
  const active = daily.filter((d) => d.minutes > 0).length;
  const todayKey = daily[daily.length - 1]?.date;
  const calendar = daily.length <= CALENDAR_MAX_DAYS;

  return (
    <Card
      icon={CalendarDays} title="Consistency"
      sub={active > 0 ? `${active} active day${active === 1 ? '' : 's'} · darker means more time` : 'Each square is one day'}
    >
      {active === 0 ? (
        <EmptyState icon={CalendarDays} title="No activity yet">Days you study will light up here.</EmptyState>
      ) : calendar ? (
        <CalendarTiles daily={daily} level={level} todayKey={todayKey} />
      ) : (
        <GridHeatmap daily={daily} level={level} />
      )}

      <div className="ax-heat-legend" aria-hidden="true">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`ax-cell lv-${l}`} />)}
        <span>More</span>
      </div>
    </Card>
  );
}
