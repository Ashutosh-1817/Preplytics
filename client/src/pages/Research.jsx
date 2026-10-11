
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Globe, Search, Sparkles, Copy, Check, FilePlus2, RefreshCw, AlertCircle, AlertTriangle,
  Clock, Trash2, Newspaper, Zap, Loader2,
} from 'lucide-react';
import { fetchGoals } from '../services/goals.api.js';
import { saveAiResultAsNote } from '../services/ai.api.js';
import { getErrorMessage } from '../services/files.api.js';
import {
  fetchSearchUsage, runSearch, summarizeSearch, fetchSearchHistory, fetchSearch, deleteSearch,
} from '../services/search.api.js';
import { textToTiptapDoc } from '../utils/textToTiptapDoc.js';
import { timeAgo } from '../utils/timeAgo.js';
import ResearchAnswer from '../components/research/ResearchAnswer.jsx';
import SourceCard from '../components/research/SourceCard.jsx';
import '../components/research/research.css';

const TIME_RANGES = [
  { value: 'any', label: 'Any time' },
  { value: 'day', label: 'Past day' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
  { value: 'year', label: 'Past year' },
];

// Plain-text sources only: the note editor has no link mark, so URLs stay as text
const buildNoteMarkdown = (entry) => {
  const sources = entry.sources.map((s, i) => `${i + 1}. ${s.title} (${s.domain}) - ${s.url}`).join('\n');
  return `${entry.answer ? `${entry.answer}\n\n` : ''}## Sources\n${sources}`;
};

function Research() {
  const [form, setForm] = useState({ query: '', topic: 'general', timeRange: 'any', depth: 'basic', goalId: '' });
  const [goals, setGoals] = useState([]);
  const [usage, setUsage] = useState(null);
  const [history, setHistory] = useState(null);

  const [entry, setEntry] = useState(null);
  const [cached, setCached] = useState(false);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'searching' | 'ready'
  const [error, setError] = useState('');

  const [summaryState, setSummaryState] = useState('idle'); // 'idle' | 'loading' | 'error'
  const [summaryError, setSummaryError] = useState('');

  const [highlight, setHighlight] = useState(null);
  const [copied, setCopied] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const activeIdRef = useRef(null); // ignores late responses from a result you've moved on from

  const patchForm = (changes) => setForm((f) => ({ ...f, ...changes }));

  const refreshUsage = useCallback(() => fetchSearchUsage().then(setUsage).catch(() => {}), []);
  const refreshHistory = useCallback(
    () => fetchSearchHistory().then(setHistory).catch(() => setHistory((prev) => prev ?? [])),
    []
  );

  useEffect(() => {
    refreshUsage();
    refreshHistory();
    fetchGoals()
      .then((list) => setGoals(list.filter((g) => g.status === 'active')))
      .catch(() => setGoals([]));
  }, [refreshUsage, refreshHistory]);

  const loadSummary = useCallback(async (id, regenerate = false) => {
    setSummaryState('loading');
    setSummaryError('');

    try {
      const updated = await summarizeSearch(id, regenerate);
      if (activeIdRef.current !== id) return;
      setEntry(updated);
      setSummaryState('idle');
      setNoteSaved(false);
    } catch (err) {
      if (activeIdRef.current !== id) return;
      setSummaryState('error');
      setSummaryError(getErrorMessage(err, 'Could not write the summary.'));
    }
  }, []);

  const runQuery = async (rawQuery, { fresh = false } = {}) => {
    const query = rawQuery.trim();
    if (query.length < 2) return;

    setError('');
    setPhase('searching');
    setSummaryState('idle');
    setSummaryError('');
    setNoteSaved(false);
    setCopied(false);

    try {
      const { search, cached: wasCached } = await runSearch({
        query,
        topic: form.topic,
        timeRange: form.timeRange,
        depth: form.depth,
        goalId: form.goalId || null,
        fresh,
      });

      activeIdRef.current = search._id;
      setEntry(search);
      setCached(wasCached);
      setPhase('ready');
      refreshUsage();
      refreshHistory();

      if (search._id && search.summaryStatus !== 'ok') loadSummary(search._id);
    } catch (err) {
      setError(getErrorMessage(err, 'Search failed. Please try again.'));
      setPhase(entry ? 'ready' : 'idle');
      refreshUsage();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runQuery(form.query);
  };

  const handleSuggestion = (text) => {
    patchForm({ query: text });
    runQuery(text);
  };

  const openHistoryItem = async (item) => {
    setError('');
    setPhase('searching');
    setSummaryState('idle');
    setSummaryError('');

    try {
      const search = await fetchSearch(item._id);
      activeIdRef.current = search._id;

      setEntry(search);
      setCached(true);
      setPhase('ready');
      setNoteSaved(false);
      setForm((f) => ({
        ...f,
        query: search.query,
        topic: search.topic,
        timeRange: search.timeRange,
        depth: search.depth,
        goalId: goals.some((g) => g._id === search.goalId) ? search.goalId : '',
      }));

      if (search.summaryStatus !== 'ok') loadSummary(search._id);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not open that search.'));
      setPhase(entry ? 'ready' : 'idle');
    }
  };

  const removeHistoryItem = async (e, item) => {
    e.stopPropagation();
    try {
      await deleteSearch(item._id);
      setHistory((prev) => prev?.filter((h) => h._id !== item._id));
      if (entry?._id === item._id) {
        activeIdRef.current = null;
        setEntry(null);
        setPhase('idle');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not remove that search.'));
    }
  };

  const handleCite = (n) => {
    setHighlight(n);
    document.getElementById(`source-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setHighlight(null), 1800);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(entry.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy to the clipboard.');
    }
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      const content = buildNoteMarkdown(entry);
      await saveAiResultAsNote({
        content,
        contentJSON: textToTiptapDoc(content),
        title: `Research: ${entry.query}`.slice(0, 150),
        goalId: form.goalId || null,
        nodeId: null,
      });
      setNoteSaved(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save this as a note.'));
    } finally {
      setSavingNote(false);
    }
  };

  // ---------- Derived state ----------

  const goalTitle = goals.find((g) => g._id === form.goalId)?.title;
  const suggestions = goalTitle
    ? [
        `Latest updates on ${goalTitle}`,
        `${goalTitle} syllabus or pattern changes`,
        `Important dates for ${goalTitle}`,
        `How to prepare for ${goalTitle}`,
      ]
    : [];

  const cost = form.depth === 'advanced' ? 2 : 1;
  const blocked = !usage
    ? ''
    : !usage.configured
      ? 'not-configured'
      : usage.daily.remaining < cost
        ? 'daily'
        : usage.monthly.remaining < cost
          ? 'monthly'
          : '';

  const canSearch = form.query.trim().length >= 2 && phase !== 'searching' && !blocked;
  const isSummaryLoading = summaryState === 'loading' || (entry?.summaryStatus === 'pending' && summaryState !== 'error');
  const showSummaryError = summaryState === 'error' || entry?.summaryStatus === 'unavailable';
  const hasResults = entry && entry.sources.length > 0;

  return (
    <div className="research-page">
      <header className="research-header">
        <div className="research-title-badge"><Globe size={24} /></div>
        <div className="research-header-text">
          <h1 className="text-stat" style={{ fontSize: 'var(--text-2xl)' }}>Research</h1>
          <p>Search the live web. Every answer is written from the sources shown, with citations.</p>
        </div>

        {usage?.configured && (
          <span className={`usage-pill ${usage.daily.remaining <= 3 ? 'usage-pill-low' : ''}`}>
            <Zap size={13} /> {usage.daily.remaining} of {usage.daily.limit} searches left today
          </span>
        )}
      </header>

      {usage && !usage.configured && (
        <div className="setup-notice">
          <AlertTriangle size={20} />
          <div>
            <strong>Live search isn't set up yet</strong>
            <p>
              Get a free key at app.tavily.com (no card needed), add <code>TAVILY_API_KEY=…</code> to{' '}
              <code>server/.env</code>, then restart the backend.
            </p>
          </div>
        </div>
      )}

      <div className="research-layout">
        <main className="research-main">
          <form className="search-card" onSubmit={handleSubmit}>
            <div className="search-input-row">
              <Search size={20} className="search-input-icon" />
              <input
                className="search-input"
                value={form.query}
                onChange={(e) => patchForm({ query: e.target.value })}
                placeholder="Ask anything, e.g. what changed in the latest exam pattern?"
                maxLength={300}
                aria-label="Search the web"
              />
              <button type="submit" className="btn btn-primary search-submit" disabled={!canSearch}>
                {phase === 'searching' ? <Loader2 size={16} className="research-spin" /> : <Search size={16} />}
                Search
              </button>
            </div>

            <div className="search-options">
              <div className="segmented" role="group" aria-label="Search type">
                <button type="button" className={`segmented-btn ${form.topic === 'general' ? 'segmented-btn-active' : ''}`} onClick={() => patchForm({ topic: 'general' })}>
                  <Globe size={14} /> Web
                </button>
                <button type="button" className={`segmented-btn ${form.topic === 'news' ? 'segmented-btn-active' : ''}`} onClick={() => patchForm({ topic: 'news' })}>
                  <Newspaper size={14} /> News
                </button>
              </div>

              <select className="research-select" value={form.timeRange} onChange={(e) => patchForm({ timeRange: e.target.value })} aria-label="Time range">
                {TIME_RANGES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>

              {goals.length > 0 && (
                <select className="research-select" value={form.goalId} onChange={(e) => patchForm({ goalId: e.target.value })} aria-label="Tailor to goal">
                  <option value="">No goal</option>
                  {goals.map((g) => (
                    <option key={g._id} value={g._id}>Tailor to: {g.title}</option>
                  ))}
                </select>
              )}

              <button
                type="button"
                role="switch"
                aria-checked={form.depth === 'advanced'}
                className={`deep-toggle ${form.depth === 'advanced' ? 'deep-toggle-on' : ''}`}
                onClick={() => patchForm({ depth: form.depth === 'advanced' ? 'basic' : 'advanced' })}
                title="Deep search digs further for more relevant passages. It counts as 2 searches."
              >
                <Zap size={14} /> Deep search <span>counts as 2</span>
              </button>
            </div>

            {suggestions.length > 0 && phase === 'idle' && (
              <div className="search-suggestions">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="suggestion-chip" onClick={() => handleSuggestion(s)} disabled={!!blocked}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </form>

          {blocked === 'daily' && (
            <p className="auth-error">You've used today's search credits. They reset tomorrow.</p>
          )}
          {blocked === 'monthly' && (
            <p className="auth-error">The shared monthly search quota is used up. Search is paused until next month.</p>
          )}
          {error && <p className="auth-error">{error}</p>}

          {phase === 'idle' && !entry && (
            <div className="research-empty">
              <div className="research-empty-icon"><Globe size={28} /></div>
              <h3>What do you want to look up?</h3>
              <p>
                Use this for things that change: exam dates, pattern updates, new resources, recent developments. The
                answer cites every source, and nothing is made up from memory.
              </p>
            </div>
          )}

          {phase === 'searching' && (
            <div className="results">
              <div className="answer-card">
                <div className="answer-skeleton">
                  <div className="skeleton" style={{ height: 18, width: '40%' }} />
                  <div className="skeleton" style={{ height: 14, width: '95%' }} />
                  <div className="skeleton" style={{ height: 14, width: '88%' }} />
                  <div className="skeleton" style={{ height: 14, width: '70%' }} />
                </div>
              </div>
              <div className="sources-grid">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 150, borderRadius: 'var(--radius-md)' }} />
                ))}
              </div>
            </div>
          )}

          {phase === 'ready' && entry && !hasResults && (
            <div className="research-empty">
              <div className="research-empty-icon"><Search size={28} /></div>
              <h3>No results found</h3>
              <p>Try different words, a wider time range, or switch between Web and News.</p>
            </div>
          )}

          {phase === 'ready' && hasResults && (
            <div className="results">
              <div className="answer-card">
                <div className="answer-head">
                  <span className="answer-badge"><Sparkles size={15} /> Answer</span>
                  <span className="answer-meta">
                    {entry.sources.length} sources · {cached ? `saved ${timeAgo(entry.createdAt)}` : 'just now'}
                  </span>

                  <div className="answer-actions">
                    {cached && (
                      <button type="button" className="answer-btn" onClick={() => runQuery(form.query, { fresh: true })} disabled={!canSearch} title="Search again for fresh results">
                        <RefreshCw size={14} /> Refresh
                      </button>
                    )}
                    {entry.answer && (
                      <button type="button" className="answer-btn" onClick={handleCopy}>
                        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                      </button>
                    )}
                    <button type="button" className="answer-btn answer-btn-primary" onClick={handleSaveNote} disabled={savingNote || noteSaved}>
                      {noteSaved ? <Check size={14} /> : savingNote ? <Loader2 size={14} className="research-spin" /> : <FilePlus2 size={14} />}
                      {noteSaved ? 'Saved to notes' : 'Save as note'}
                    </button>
                  </div>
                </div>

                {isSummaryLoading && (
                  <div className="answer-skeleton">
                    <span className="answer-writing"><Loader2 size={14} className="research-spin" /> Writing a cited summary…</span>
                    <div className="skeleton" style={{ height: 14, width: '95%' }} />
                    <div className="skeleton" style={{ height: 14, width: '90%' }} />
                    <div className="skeleton" style={{ height: 14, width: '60%' }} />
                  </div>
                )}

                {!isSummaryLoading && showSummaryError && (
                  <div className="answer-warn">
                    <AlertCircle size={18} />
                    <div>
                      <strong>The summary isn't available right now</strong>
                      <p>{summaryError || 'The sources below are still good. Retrying costs no search credit.'}</p>
                      <button type="button" className="answer-btn" onClick={() => loadSummary(entry._id, true)}>
                        <RefreshCw size={14} /> Retry summary
                      </button>
                    </div>
                  </div>
                )}

                {!isSummaryLoading && !showSummaryError && entry.answer && (
                  <>
                    <ResearchAnswer markdown={entry.answer} onCite={handleCite} />
                    <button type="button" className="answer-regenerate" onClick={() => loadSummary(entry._id, true)}>
                      <RefreshCw size={12} /> Rewrite summary
                    </button>
                  </>
                )}
              </div>

              <h3 className="sources-title">Sources</h3>
              <div className="sources-grid">
                {entry.sources.map((source, i) => (
                  <SourceCard key={source.url} source={source} index={i} highlighted={highlight === i + 1} />
                ))}
              </div>
            </div>
          )}
        </main>

        <aside className="research-history">
          <h3 className="history-head"><Clock size={15} /> Recent searches</h3>

          {history === null && <div className="skeleton" style={{ height: 56 }} />}
          {history?.length === 0 && <p className="history-empty">Your searches are saved here, so you can reopen them without spending credits.</p>}

          <ul className="history-list">
            {history?.map((item) => (
              <li key={item._id}>
                <div
                  className={`history-item ${entry?._id === item._id ? 'history-item-active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openHistoryItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openHistoryItem(item);
                    }
                  }}
                >
                  <span className="history-main">
                    <span className="history-query">{item.query}</span>
                    <span className="history-meta">
                      {item.topic === 'news' ? 'News' : 'Web'} · {timeAgo(item.createdAt)}
                      {item.goalId?.title ? ` · ${item.goalId.title}` : ''}
                    </span>
                  </span>
                  <button type="button" className="history-del" aria-label="Remove search" onClick={(e) => removeHistoryItem(e, item)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

export default Research;