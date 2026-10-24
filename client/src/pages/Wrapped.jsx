import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Award , Smartphone, Monitor  } from 'lucide-react';
import { fetchGoals } from '../services/goals.api.js';
import { fetchWrapped, generateWrappedNarrative } from '../services/wrapped.api.js';
import StoryPlayer from '../components/wrapped/StoryPlayer.jsx';
import {
  IntroSlide, TimeSlide, RhythmSlide, StreakSlide, SubjectsSlide,
  EstimatesSlide, ProgressSlide, VerdictSlide, SummarySlide,
} from '../components/wrapped/slides.jsx';
import { SPRING_SNAPPY } from '../components/motion/motionPresets.js';
import './Wrapped.css';

const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

function Wrapped() {
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);

  const [goals, setGoals] = useState([]);
  const [goalId, setGoalId] = useState('all');
  const [range, setRange] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [aiState, setAiState] = useState('idle'); // idle | loading | done | limit | failed
  const [replayKey, setReplayKey] = useState(0);
  const [layout, setLayout] = useState(() => {
    try {
      const saved = localStorage.getItem('wrapped-layout');
      if (saved === 'portrait' || saved === 'landscape') return saved;
    } catch {
      /* storage unavailable: fall through to the default */
    }
    return typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches ? 'landscape' : 'portrait';
  });

  const chooseLayout = (value) => {
    setLayout(value);
    try {
      localStorage.setItem('wrapped-layout', value);
    } catch {
      /* ignore */
    }
  };

  const loadId = useRef(0);
  const requested = useRef(new Set());

  useEffect(() => {
    fetchGoals().then(setGoals).catch(() => setGoals([]));
  }, []);

  useEffect(() => {
    const myLoad = ++loadId.current; // a stale response must never overwrite a newer one
    setLoading(true);
    setError('');

    fetchWrapped({ goalId: goalId === 'all' ? undefined : goalId, range, tz })
      .then((result) => {
        if (loadId.current !== myLoad) return;
        setData(result);
        setAiState(result.narrative.source === 'ai' ? 'done' : 'idle');
      })
      .catch((err) => {
        if (loadId.current !== myLoad) return;
        setError(err.response?.data?.error?.message || 'Could not load your Wrapped.');
      })
      .finally(() => {
        if (loadId.current === myLoad) setLoading(false);
      });
  }, [goalId, range, tz, reloadKey]);

  // One AI request per scope/range/day, started when the viewer leaves the intro
  const runNarrative = useCallback(
    async (force) => {
      if (!data) return;
      const key = `${goalId}|${range}|${data.period.to}`;
      if (!force && requested.current.has(key)) return;
      requested.current.add(key);

      const myLoad = loadId.current;
      setAiState('loading');

      try {
        const res = await generateWrappedNarrative({
          goalId: goalId === 'all' ? undefined : goalId,
          range,
          tz,
          force,
        });
        if (loadId.current !== myLoad) return;
        setData((prev) => (prev ? { ...prev, narrative: res.narrative } : prev));
        if (res.aiStatus === 'limit') setAiState('limit');
        else if (res.aiStatus === 'failed') setAiState('failed');
        else setAiState('done');
      } catch {
        if (loadId.current === myLoad) setAiState('failed');
      }
    },
    [data, goalId, range, tz]
  );

  const handleIndexChange = useCallback(
    (i) => {
      if (i > 0 && aiState === 'idle') runNarrative(false);
    },
    [aiState, runNarrative]
  );

  const slides = useMemo(() => {
    if (!data?.hasData) return [];
    const list = [
      { id: 'intro', theme: 0, durationMs: null, render: ({ next }) => <IntroSlide d={data} onPlay={next} /> },
      { id: 'time', theme: 1, durationMs: 7000, render: () => <TimeSlide d={data} /> },
    ];
    if (data.rhythm.peakHour !== null || data.rhythm.peakWeekday !== null) {
      list.push({ id: 'rhythm', theme: 2, durationMs: 8000, render: () => <RhythmSlide d={data} /> });
    }
    list.push({ id: 'streak', theme: 3, durationMs: 6500, render: () => <StreakSlide d={data} /> });
    if (data.subjects.top.length > 0) {
      list.push({ id: 'subjects', theme: 4, durationMs: 8000, render: () => <SubjectsSlide d={data} /> });
    }
    if (data.estimates.nodes > 0 && data.estimates.ratio) {
      list.push({ id: 'estimates', theme: 5, durationMs: 8000, render: () => <EstimatesSlide d={data} /> });
    }
    list.push({ id: 'progress', theme: 6, durationMs: 7000, render: () => <ProgressSlide d={data} /> });
    list.push({
      id: 'verdict',
      theme: 7,
      durationMs: null,
      render: () => <VerdictSlide d={data} aiState={aiState} onRegenerate={() => runNarrative(true)} />,
    });
    list.push({
      id: 'summary',
      theme: 0,
      durationMs: null,
      render: () => <SummarySlide d={data} onReplay={() => setReplayKey((k) => k + 1)} />,
    });
    return list;
  }, [data, aiState, runNarrative]);

  return (
    <div className={`wrapped-page ${layout === 'landscape' ? 'wrapped-landscape' : ''}`}>
      <div className="wrapped-header">
        <div>
          <h1 className="text-stat wrapped-title">
            <Award size={22} /> Wrapped
          </h1>
          <p className="text-muted wrapped-sub">Your study story, built from real sessions · {tz}</p>
        </div>

        <div className="wrapped-filters">
          <select className="wr-select" value={goalId} onChange={(e) => setGoalId(e.target.value)} aria-label="Goal">
            <option value="all">All goals</option>
            {goals.map((g) => (
              <option key={g._id} value={g._id}>
                {g.title}
              </option>
            ))}
          </select>

          <div className="wr-range" role="group" aria-label="Period">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                className={`wr-range-btn ${range === r.value ? 'wr-range-btn-active' : ''}`}
                onClick={() => setRange(r.value)}
              >
                {range === r.value && (
                  <motion.span layoutId="wr-range-pill" className="wr-range-pill" transition={SPRING_SNAPPY} />
                )}
                <span className="wr-range-label">{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="wr-range wr-layout" role="group" aria-label="Layout">
            {[
              { value: 'landscape', label: 'Desktop', Icon: Monitor },
              { value: 'portrait', label: 'Phone', Icon: Smartphone },
            ].map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                className={`wr-range-btn ${layout === value ? 'wr-range-btn-active' : ''}`}
                onClick={() => chooseLayout(value)}
              >
                {layout === value && (
                  <motion.span layoutId="wr-layout-pill" className="wr-range-pill" transition={SPRING_SNAPPY} />
                )}
                <span className="wr-range-label wr-layout-label">
                  <Icon size={14} /> {label}
                </span>
              </button>
            ))}
          </div>
      </div>

      {error && (
        <div className="surface wrapped-error">
          <p className="auth-error">{error}</p>
          <button type="button" className="btn btn-ghost" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      )}

      {!data && loading && <div className="wr-stage wr-stage-skeleton skeleton" />}

      {data && !data.hasData && (
        <motion.div className="surface wrapped-empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Award size={28} />
          <h3>Nothing to wrap yet</h3>
          <p className="text-muted">
            Start a study session on any topic, or complete a few topics, and your Wrapped will build itself from
            real data.
          </p>
          <Link to="/goals" className="btn btn-primary">
            Go to goals
          </Link>
        </motion.div>
      )}

      {data?.hasData && slides.length > 0 && (
        <div className={`wrapped-stage-wrap ${loading ? 'wrapped-stale' : ''}`}>
          <StoryPlayer
            key={`${goalId}-${range}-${data.period.to}-${replayKey}`}
            slides={slides}
            onIndexChange={handleIndexChange}
          />
        </div>
      )}
    </div>
  );
}

export default Wrapped;