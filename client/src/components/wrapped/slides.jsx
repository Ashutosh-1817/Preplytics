import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Award, Flag, Lightbulb, BarChart3, Play, Flame, ArrowUp, ArrowDown, Minus, Check, TrendingUp, RefreshCw,
  Loader2, Download, Share2, RotateCcw, AlertCircle,
} from 'lucide-react';
import { formatDuration } from '../../utils/formatDuration.js';
import AnimatedNumber from '../motion/AnimatedNumber.jsx';
import { EASE_OUT, fadeUp, pop, staggerParent } from '../motion/motionPresets.js';
import ShareCard from './ShareCard.jsx';
import { CARD_W, CARD_H, renderCardBlob, downloadBlob, canShareFiles } from './exportCard.js';

// ---------- shared pieces ----------

function Stage({ children }) {
  return (
    <motion.div className="wr-body" variants={staggerParent} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

function Item({ children, className = '', variants = fadeUp }) {
  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
}

// Portrait: both are display:contents (a plain vertical stack).
// Landscape: Split becomes a two-column grid and each Col a column.
function Split({ ratio = 'even', children }) {
  return <div className={`wr-split wr-split-${ratio}`}>{children}</div>;
}

function Col({ children, className = '' }) {
  return <div className={`wr-col ${className}`}>{children}</div>;
}

const scopeLabel = (d) => d.scope.goalTitle ?? 'All your goals';

// Scales a fixed-size element down to fit the stage (width AND height)
function FitBox({ width, height, children }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const stage = el.closest('.wr-stage');

    const measure = () => {
      let next = Math.min(1, el.clientWidth / width);
      if (stage) {
        const landscape = stage.clientWidth > stage.clientHeight;
        next = Math.min(next, (stage.clientHeight * (landscape ? 0.74 : 0.62)) / height);
      }
      setScale(Math.max(0.2, next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (stage) observer.observe(stage);
    return () => observer.disconnect();
  }, [width, height]);

  return (
    <div ref={wrapRef} className="wr-fit">
      <div style={{ width: width * scale, height: height * scale }}>
        <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
      </div>
    </div>
  );
}

// ---------- 1. Intro ----------

export function IntroSlide({ d, onPlay }) {
  return (
    <Stage>
      <Split ratio="left">
        <Col>
          <Item>
            <span className="wr-kicker">
              <Award size={14} /> Preplytics Wrapped
            </span>
          </Item>
          <Item>
            <h1 className="wr-hero">
              Your {d.period.days} days,
              <br />
              <span className="wr-grad-text">wrapped.</span>
            </h1>
          </Item>
          <Item>
            <p className="wr-lead">{scopeLabel(d)}</p>
          </Item>
        </Col>
        <Col className="wr-col-end">
          <Item variants={pop}>
            <motion.button
              type="button"
              className="wr-play"
              onClick={onPlay}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Play size={18} fill="currentColor" /> Play my Wrapped
            </motion.button>
          </Item>
          <Item>
            <p className="wr-hint">Tap the right side to continue · hold to pause · arrow keys work too</p>
          </Item>
        </Col>
      </Split>
    </Stage>
  );
}

// ---------- 2. Time ----------

function MiniDaily({ daily }) {
  const max = Math.max(...daily.map((x) => x.minutes), 1);
  const step = Math.min(0.03, 0.7 / Math.max(daily.length, 1));

  return (
    <div className="wr-mini" aria-hidden="true">
      {daily.map((x, i) => (
        <motion.span
          key={x.date}
          className={`wr-mini-bar ${x.minutes > 0 ? 'wr-mini-on' : ''}`}
          style={{ height: `${x.minutes > 0 ? Math.max(8, (x.minutes / max) * 100) : 4}%`, originY: 1 }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: 0.5 + i * step, duration: 0.5, ease: EASE_OUT }}
        />
      ))}
    </div>
  );
}

export function TimeSlide({ d }) {
  const t = d.totals;
  let chip;
  if (t.deltaPercent === null) chip = { Icon: Flag, text: 'First tracked period', tone: 'neutral' };
  else if (t.deltaPercent > 0) chip = { Icon: ArrowUp, text: `${t.deltaPercent}% more than the previous ${d.period.days} days`, tone: 'up' };
  else if (t.deltaPercent < 0) chip = { Icon: ArrowDown, text: `${Math.abs(t.deltaPercent)}% less than the previous ${d.period.days} days`, tone: 'down' };
  else chip = { Icon: Minus, text: `Same as the previous ${d.period.days} days`, tone: 'neutral' };

  return (
    <Stage>
      <Split>
        <Col>
          <Item><p className="wr-label">You studied for</p></Item>
          <Item className="wr-big">
            <AnimatedNumber value={t.minutes} format={formatDuration} duration={1.7} delay={0.35} />
          </Item>
          <Item variants={pop}>
            <span className={`wr-chip wr-chip-${chip.tone}`}>
              <chip.Icon size={14} /> {chip.text}
            </span>
          </Item>
        </Col>
        <Col>
          <Item>
            <MiniDaily daily={d.daily} />
          </Item>
          <Item>
            <p className="wr-meta">
              {t.sessions} session{t.sessions === 1 ? '' : 's'} across {t.activeDays} day{t.activeDays === 1 ? '' : 's'}
              {t.avgSessionMinutes > 0 ? ` · ${formatDuration(t.avgSessionMinutes)} per session` : ''}
            </p>
          </Item>
        </Col>
      </Split>
    </Stage>
  );
}

// ---------- 3. Rhythm ----------

const HOUR_TICKS = [0, 6, 12, 18];
const tickLabel = (h) => (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`);

export function RhythmSlide({ d }) {
  const r = d.rhythm;
  const max = Math.max(...r.hours, 1);
  const hasHours = r.peakHour !== null;

  return (
    <Stage>
      <Split>
        <Col>
          <Item><p className="wr-label">{hasHours ? 'You focus best around' : 'Your favourite day'}</p></Item>
          <Item className="wr-big">{hasHours ? r.peakHourLabel : r.peakWeekdayName}</Item>
          <Item>
            <ul className="wr-facts">
              {hasHours && r.peakWeekdayName && <li>Favourite day: <strong>{r.peakWeekdayName}</strong></li>}
              {r.longestSession && <li>Longest session: <strong>{formatDuration(r.longestSession.minutes)}</strong></li>}
              {d.totals.bestDay && <li>Best day: <strong>{formatDuration(d.totals.bestDay.minutes)}</strong></li>}
            </ul>
          </Item>
        </Col>

        {hasHours && (
          <Col>
            <Item>
              <div className="wr-bars" aria-hidden="true">
                {r.hours.map((m, h) => (
                  <motion.span
                    key={h}
                    className={`wr-bar ${h === r.peakHour ? 'wr-bar-peak' : ''}`}
                    style={{ height: `${Math.max(5, (m / max) * 100)}%`, originY: 1 }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.5 + h * 0.025, duration: 0.55, ease: EASE_OUT }}
                  />
                ))}
              </div>
              <div className="wr-bar-ticks">
                {HOUR_TICKS.map((h) => (
                  <span key={h}>{tickLabel(h)}</span>
                ))}
              </div>
            </Item>
          </Col>
        )}
      </Split>
    </Stage>
  );
}

// ---------- 4. Streak ----------

function ActivityDots({ daily }) {
  const days = daily.slice(-28);

  return (
    <div>
      <div className="wr-dots">
        {days.map((x, i) => (
          <motion.span
            key={x.date}
            className={`wr-dot ${x.minutes > 0 ? 'wr-dot-on' : ''}`}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 + i * 0.025, type: 'spring', stiffness: 300, damping: 18 }}
          />
        ))}
      </div>
      <p className="wr-hint wr-dots-cap">Last {days.length} days · lit = you studied</p>
    </div>
  );
}

export function StreakSlide({ d }) {
  const { current, longest } = d.streak;

  return (
    <Stage>
      <Split>
        <Col>
          <Item variants={pop}>
            <motion.div
              className="wr-flame"
              animate={{ scale: [1, 1.1, 1], rotate: [0, -4, 3, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Flame size={64} strokeWidth={1.6} />
            </motion.div>
          </Item>
          <Item className="wr-big">
            <AnimatedNumber value={current} duration={1.2} delay={0.4} />
          </Item>
          <Item><p className="wr-label">day streak right now</p></Item>
          <Item>
            <p className="wr-meta">
              {current === 0
                ? longest > 0
                  ? `Your best was ${longest} days. One short session today starts a new one.`
                  : 'Log a session today to start your first streak.'
                : `Your best ever is ${longest} day${longest === 1 ? '' : 's'}.`}
            </p>
          </Item>
        </Col>
        <Col>
          <Item>
            <ActivityDots daily={d.daily} />
          </Item>
        </Col>
      </Split>
    </Stage>
  );
}

// ---------- 5. Subjects ----------

export function SubjectsSlide({ d }) {
  const { top, count } = d.subjects;

  return (
    <Stage>
      <Split>
        <Col>
          <Item><p className="wr-label">Where your time went</p></Item>
          <Item className="wr-title">{top[0].title}</Item>
          <Item>
            <p className="wr-meta">was your top subject, with {top[0].share}% of your study time.</p>
          </Item>
        </Col>
        <Col>
          <div className="wr-rows">
            {top.map((s, i) => (
              <Item key={s.title} className="wr-row">
                <div className="wr-row-head">
                  <span className="wr-row-name">{s.title}</span>
                  <span>{formatDuration(s.minutes)}</span>
                </div>
                <div className="wr-track">
                  <motion.div
                    className="wr-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(3, s.share)}%` }}
                    transition={{ delay: 0.6 + i * 0.15, duration: 0.9, ease: EASE_OUT }}
                  />
                </div>
              </Item>
            ))}
          </div>
          {count > top.length && (
            <Item><p className="wr-hint">+ {count - top.length} more subject{count - top.length === 1 ? '' : 's'}</p></Item>
          )}
        </Col>
      </Split>
    </Stage>
  );
}

// ---------- 6. Estimates ----------

const RATIO_MIN = 0.33;
const RATIO_MAX = 2.0;

export function EstimatesSlide({ d }) {
  const e = d.estimates;
  const verdict = e.ratio >= 1.05 ? 'faster than planned' : e.ratio <= 0.95 ? 'slower than planned' : 'right on plan';
  const position = Math.min(1, Math.max(0, (e.ratio - RATIO_MIN) / (RATIO_MAX - RATIO_MIN))) * 100;
  const onePosition = ((1 - RATIO_MIN) / (RATIO_MAX - RATIO_MIN)) * 100;

  return (
    <Stage>
      <Split>
        <Col>
          <Item><p className="wr-label">You finish topics</p></Item>
          <Item className="wr-big">
            <AnimatedNumber value={e.ratio} format={(n) => `${n.toFixed(2)}×`} duration={1.5} delay={0.35} />
          </Item>
          <Item><p className="wr-lead">{verdict}</p></Item>
          <Item>
            <p className="wr-meta">
              Estimated ÷ actual time across {e.nodes} completed topic{e.nodes === 1 ? '' : 's'}.
              {e.lowConfidence ? ' Early signal: fewer than 3 topics.' : ''}
            </p>
          </Item>
        </Col>
        <Col>
          <Item>
            <div className="wr-meter" aria-hidden="true">
              <span className="wr-meter-one" style={{ left: `${onePosition}%` }} />
              <motion.span
                className="wr-meter-marker"
                initial={{ left: '0%' }}
                animate={{ left: `${position}%` }}
                transition={{ delay: 0.7, duration: 1.1, ease: EASE_OUT }}
              />
            </div>
            <div className="wr-meter-scale">
              <span>Slower</span>
              <span>1.0× = on estimate</span>
              <span>Faster</span>
            </div>
          </Item>
          <Item>
            <div className="wr-chips">
              {e.mostOver && (
                <span className="wr-chip wr-chip-down">
                  <ArrowUp size={14} /> {e.mostOver.title}: +{e.mostOver.deviationPercent}% over
                </span>
              )}
              {e.mostUnder && (
                <span className="wr-chip wr-chip-up">
                  <ArrowDown size={14} /> {e.mostUnder.title}: {e.mostUnder.deviationPercent}% under
                </span>
              )}
            </div>
          </Item>
        </Col>
      </Split>
    </Stage>
  );
}

// ---------- 7. Progress ----------

const BURN_COPY = {
  ahead: 'Ahead of pace',
  on_track: 'On track for your deadline',
  behind: 'Behind your ideal pace',
  overdue: 'Past your deadline',
  complete: 'Roadmap complete',
};

function Ring({ value }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="wr-ring-wrap">
      <svg viewBox="0 0 120 120" className="wr-ring" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} className="wr-ring-bg" />
        <motion.circle
          cx="60"
          cy="60"
          r={radius}
          className="wr-ring-fg"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - value) }}
          transition={{ delay: 0.5, duration: 1.4, ease: EASE_OUT }}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="wr-ring-center">
        <AnimatedNumber value={Math.round(value * 100)} format={(n) => `${Math.round(n)}%`} duration={1.4} delay={0.5} />
        <span>on plan</span>
      </div>
    </div>
  );
}

export function ProgressSlide({ d }) {
  const adherence = d.progress.adherenceRate;
  const burn = d.progress.burndown;
  const topics = d.totals.completedTopics;
  const hasRight = adherence !== null || burn;

  return (
    <Stage>
      <Split>
        <Col>
          <Item><p className="wr-label">You completed</p></Item>
          <Item className="wr-big">
            <AnimatedNumber value={topics} duration={1.2} delay={0.35} />
          </Item>
          <Item><p className="wr-lead">topic{topics === 1 ? '' : 's'} this period</p></Item>
        </Col>
        {hasRight && (
          <Col className="wr-col-end">
            {adherence !== null && (
              <Item variants={pop}>
                <Ring value={adherence} />
              </Item>
            )}
            {burn && (
              <Item variants={pop}>
                <span className={`wr-chip ${['behind', 'overdue'].includes(burn.status) ? 'wr-chip-down' : 'wr-chip-up'}`}>
                  <TrendingUp size={14} /> {BURN_COPY[burn.status]}
                </span>
              </Item>
            )}
          </Col>
        )}
      </Split>
    </Stage>
  );
}

// ---------- 8. Verdict (persona + AI pros & cons) ----------

export function VerdictSlide({ d, aiState, onRegenerate }) {
  const n = d.narrative;
  const loading = aiState === 'loading';

  let badge;
  if (loading) badge = { Icon: Loader2, text: 'Writing your insights…', spin: true };
  else if (n.source === 'ai') badge = { Icon: Lightbulb, text: 'AI insights from your stats' };
  else if (aiState === 'limit') badge = { Icon: AlertCircle, text: 'Daily AI limit reached · showing stat-based insights' };
  else if (aiState === 'failed') badge = { Icon: AlertCircle, text: 'AI unavailable · showing stat-based insights' };
  else badge = { Icon: BarChart3, text: 'Based on your stats' };

  const canRetry = !loading && aiState !== 'limit' && (n.source === 'ai' || aiState === 'failed' || aiState === 'idle');

  return (
    <Stage>
      <Split ratio="right">
        <Col>
          <Item className="wr-badge-row">
            <span className="wr-badge">
              <badge.Icon size={13} className={badge.spin ? 'wr-spin' : ''} /> {badge.text}
            </span>
            {canRetry && (
              <motion.button
                type="button"
                className="wr-icon-btn"
                onClick={onRegenerate}
                aria-label={n.source === 'ai' ? 'Regenerate insights' : 'Try AI again'}
                whileHover={{ rotate: 90, scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <RefreshCw size={14} />
              </motion.button>
            )}
          </Item>

          <Item>
            <p className="wr-label">You are</p>
            <AnimatePresence mode="wait">
              <motion.h2
                key={n.persona.title}
                className="wr-persona"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {n.persona.title}
              </motion.h2>
            </AnimatePresence>
            <p className="wr-meta">{n.persona.tagline}</p>
          </Item>
        </Col>

        <Col>
          <motion.div
            key={`${n.source}-${n.generatedAt}`}
            className="wr-lists"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: loading ? 0.55 : 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Item>
              <h4 className="wr-list-title wr-good">Strengths</h4>
              <ul className="wr-list">
                {n.strengths.map((s) => (
                  <li key={s}>
                    <Check size={14} /> <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Item>
            <Item>
              <h4 className="wr-list-title wr-warn">Level up</h4>
              <ul className="wr-list">
                {n.improvements.map((s) => (
                  <li key={s}>
                    <ArrowUp size={14} /> <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Item>
          </motion.div>
        </Col>
      </Split>
    </Stage>
  );
}

// ---------- 9. Summary + PNG export ----------

export function SummarySlide({ d, onReplay }) {
  const cardRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | working | done | error
  const shareable = useMemo(() => canShareFiles(), []);

  const filename = `preplytics-wrapped-${d.period.to}.png`;

  const run = async (mode) => {
    if (status === 'working' || !cardRef.current) return;
    setStatus('working');
    try {
      const blob = await renderCardBlob(cardRef.current);
      if (mode === 'share') {
        const file = new File([blob], filename, { type: 'image/png' });
        try {
          await navigator.share({ files: [file], title: 'My Preplytics Wrapped' });
        } catch (err) {
          if (err?.name !== 'AbortError') throw err;
        }
      } else {
        downloadBlob(blob, filename);
      }
      setStatus('done');
      setTimeout(() => setStatus('idle'), 2200);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3500);
    }
  };

  return (
    <Stage>
      <Split ratio="right">
        <Col>
          <Item variants={pop}>
            <FitBox width={CARD_W} height={CARD_H}>
              <ShareCard ref={cardRef} d={d} />
            </FitBox>
          </Item>
        </Col>

        <Col>
          <Item className="wr-landscape-only">
            <p className="wr-label">That's your Wrapped</p>
            <p className="wr-persona">{d.narrative.persona.title}</p>
            <p className="wr-meta">Download a 1080×1350 image for stories, posts and chats.</p>
          </Item>

          <Item className="wr-actions">
            <motion.button
              type="button"
              className="wr-btn wr-btn-primary"
              onClick={() => run('download')}
              disabled={status === 'working'}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={status}
                  className="wr-btn-inner"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                >
                  {status === 'working' && (<><Loader2 size={16} className="wr-spin" /> Rendering…</>)}
                  {status === 'done' && (<><Check size={16} /> Saved</>)}
                  {status === 'error' && (<><AlertCircle size={16} /> Try again</>)}
                  {status === 'idle' && (<><Download size={16} /> Download PNG</>)}
                </motion.span>
              </AnimatePresence>
            </motion.button>

            {shareable && (
              <motion.button
                type="button"
                className="wr-btn"
                onClick={() => run('share')}
                disabled={status === 'working'}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Share2 size={16} /> Share
              </motion.button>
            )}

            <motion.button type="button" className="wr-btn" onClick={onReplay} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <RotateCcw size={16} /> Replay
            </motion.button>
          </Item>
        </Col>
      </Split>
    </Stage>
  );
}