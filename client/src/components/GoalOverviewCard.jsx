import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb, ChevronDown, ChevronRight, Loader2, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react';
import { generateOverview } from '../services/goalOverview.api.js';
import './GoalOverviewCard.css';

const WEIGHT_LABEL = { high: 'High weight', medium: 'Medium', low: 'Lower' };

// autoGenerate: right after goal creation. Builds the briefing first, then
// calls onSettled so the parent can open the roadmap wizard.
function GoalOverviewCard({ goalId, initialOverview, autoGenerate = false, onSettled }) {
  const [overview, setOverview] = useState(initialOverview?.status === 'ready' ? initialOverview : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const aliveRef = useRef(true);
  const startedRef = useRef(false); // StrictMode mounts twice in dev: keep it to one AI call
  const onSettledRef = useRef(onSettled);

  useEffect(() => {
    onSettledRef.current = onSettled;
  });

  const run = async (regenerate = false) => {
    setLoading(true);
    setError('');
    try {
      const result = await generateOverview(goalId, regenerate);
      if (!aliveRef.current) return;
      setOverview(result);
      setOpen(true);
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err.response?.data?.error?.message || 'Could not build the briefing.');
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    aliveRef.current = true;

    if (autoGenerate && !startedRef.current) {
      startedRef.current = true;
      (async () => {
        if (!overview) await run(false);
        if (aliveRef.current) onSettledRef.current?.();
      })();
    }

    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegenerate = () => {
    if (!confirm('Write a fresh briefing? This uses one AI request.')) return;
    run(true);
  };

  // ---------- No briefing yet ----------

  if (!overview) {
    return (
      <section className="surface goal-overview">
        <div className="goal-overview-head">
          <span className="goal-overview-title"><Lightbulb size={17} /> Know Your Goal</span>
        </div>

        {loading ? (
          <div className="goal-overview-body">
            <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
              <Loader2 size={14} className="goal-overview-spin" /> Preparing your briefing…
            </p>
            <div className="skeleton" style={{ height: 14, width: '92%', marginTop: 10 }} />
            <div className="skeleton" style={{ height: 14, width: '78%', marginTop: 8 }} />
          </div>
        ) : (
          <div className="goal-overview-body">
            <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
              New to this? Get a quick briefing: pattern, eligibility, high-weight topics and strategy.
            </p>
            {error && <p className="auth-error" style={{ marginBottom: 'var(--space-3)' }}>{error}</p>}
            <button type="button" className="btn btn-ghost" onClick={() => run(false)}>
              <Lightbulb size={15} /> Get my briefing
            </button>
          </div>
        )}
      </section>
    );
  }

  // ---------- Briefing ready ----------

  const d = overview.data;
  const generated = overview.generatedAt
    ? new Date(overview.generatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <section className="surface goal-overview">
      <button type="button" className="goal-overview-head goal-overview-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="goal-overview-title"><Lightbulb size={17} /> Know Your Goal</span>
        <span className="goal-overview-peek">{open ? '' : d.summary}</span>
        {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
      </button>

      {open && (
        <div className="goal-overview-body">
          <p className="goal-overview-summary">{d.summary}</p>

          {d.certainty === 'low' && (
            <p className="goal-overview-warn">
              <AlertCircle size={14} /> The AI isn't very familiar with this goal. Treat this as general guidance.
            </p>
          )}

          <div className="goal-overview-grid">
            {d.examPattern.length > 0 && (
              <div>
                <h4>Exam pattern</h4>
                <ul>{d.examPattern.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
            )}
            {d.eligibility.length > 0 && (
              <div>
                <h4>Eligibility &amp; prerequisites</h4>
                <ul>{d.eligibility.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
            )}
          </div>

          <h4>Key topics</h4>
          <ul className="goal-overview-topics">
            {d.keyTopics.map((t, i) => (
              <li key={i}>
                <span className={`goal-overview-weight goal-overview-weight-${t.weight}`}>{WEIGHT_LABEL[t.weight]}</span>
                <span><strong>{t.topic}</strong>{t.note ? ` · ${t.note}` : ''}</span>
              </li>
            ))}
          </ul>

          <h4>Strategy tips</h4>
          <ul>{d.strategyTips.map((p, i) => <li key={i}>{p}</li>)}</ul>

          <div className="goal-overview-foot">
            <span className="goal-overview-disclaimer">
              <ShieldAlert size={13} /> AI-written from general knowledge{generated ? ` on ${generated}` : ''}. Confirm dates,
              eligibility and pattern on the official source.{' '}
              <Link to="/research">Verify in Research →</Link>
            </span>
            <button type="button" className="goal-overview-refresh" onClick={handleRegenerate} disabled={loading}>
              {loading ? <Loader2 size={13} className="goal-overview-spin" /> : <RefreshCw size={13} />} Regenerate
            </button>
          </div>

          {error && <p className="auth-error" style={{ marginTop: 'var(--space-3)' }}>{error}</p>}
        </div>
      )}
    </section>
  );
}

export default GoalOverviewCard;