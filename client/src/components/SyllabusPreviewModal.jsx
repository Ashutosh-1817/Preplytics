import { useState, useRef, useEffect, useMemo } from 'react';
import { ListTree, ChevronUp, ChevronDown, Trash2, Plus, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { generateChapters, expandChapter, bulkInsertSyllabus, saveSubjectRoadmap } from '../services/aiSyllabus.api.js';
import useRoadmapEstimate from '../hooks/useRoadmapEstimate.js';
import { LevelPills, LevelSelect, FitModeToggle, PlanBanner, TopicRow ,FailedBanner} from './roadmap/RoadmapPlanParts.jsx';
import {
  DEFAULT_LEVEL,
  LIMITS,
  topicFromAi,
  makeUid,
  newTopic,
  countTopics,
  hasInvalidDraft,
  sumMinutes,
  buildSavePayload,
  planView,
  needsFitChoice,
  displayMinutes,
  isLocked,
} from '../utils/roadmapDraft.js';
import { formatDuration } from '../utils/formatDuration.js';
import './SyllabusPreviewModal.css';

const STAGE = { INPUT: 'input', LOADING: 'loading', PREVIEW: 'preview', SAVING: 'saving' };
const EXPAND_CONCURRENCY = 3;
const SUBJECT_UID = 'subject';

const errorMessage = (err, fallback) => {
  if (err.code === 'ECONNABORTED') return 'This took too long. Please try again.';
  return err.response?.data?.error?.message || fallback;
};

function SyllabusPreviewModal({ goalId, subjectNode = null, onClose, onSaved }) {
  const [stage, setStage] = useState(STAGE.INPUT);
  const [subject, setSubject] = useState(subjectNode?.title ?? '');
  const [context, setContext] = useState('');
  // { uid, title, level|null, subtopics: [topic], status, error }
  const [chapters, setChapters] = useState([]);
  const [error, setError] = useState('');
  const [defaultLevel, setDefaultLevel] = useState(DEFAULT_LEVEL);
  const [mode, setMode] = useState('fit'); // 'fit' = shorten to the deadline, 'comfortable' = keep full time

  const aliveRef = useRef(true);
  const runIdRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const isStale = (runId) => !aliveRef.current || runIdRef.current !== runId;

  const patchChapter = (uid, patch) =>
    setChapters((prev) => prev.map((c) => (c.uid === uid ? { ...c, ...patch } : c)));

  const updateTopics = (uid, fn) =>
    setChapters((prev) => prev.map((c) => (c.uid === uid ? { ...c, subtopics: fn(c.subtopics) } : c)));

  const patchTopic = (uid, topicUid, patch) =>
    updateTopics(uid, (topics) => topics.map((t) => (t.uid === topicUid ? { ...t, ...patch } : t)));

  // ---------- Derived state ----------

  const readyCount = chapters.filter((c) => c.status === 'ready').length;
  const loadingCount = chapters.filter((c) => c.status === 'loading').length;
  const errorCount = chapters.filter((c) => c.status === 'error').length;

  // The one subject, in the shape the shared helpers expect
  const draft = useMemo(
    () => [{ uid: SUBJECT_UID, title: subject, level: null, status: 'ready', chapters }],
    [subject, chapters]
  );
  const totalTopics = countTopics(draft);

  // Personalised time from the server (no AI call). Every topic is included, always.
  const estimate = useRoadmapEstimate({
    goalId,
    subjects: draft,
    defaultLevel,
    subjectNodeId: subjectNode?._id ?? null,
    enabled: stage === STAGE.PREVIEW || stage === STAGE.SAVING,
  });
  const indexed = estimate.data;

  // "Keep full time" only means something while the deadline is actually tight
  const fitChoice = Boolean(indexed && needsFitChoice(indexed.summary));
  const effectiveMode = fitChoice ? mode : 'fit';
  const view = indexed ? planView(indexed.summary, effectiveMode) : null;

  const plannedMinutes = sumMinutes(chapters.flatMap((c) => c.subtopics), indexed, effectiveMode);
  const hasInvalid = hasInvalidDraft(draft);
  const blocked = view?.kind === 'blocked';

  const savePayload = estimate.fresh ? buildSavePayload(draft, indexed, effectiveMode) : null;
  const savedChapters = savePayload?.[0]?.chapters ?? [];

  const canSave =
    stage === STAGE.PREVIEW &&
    chapters.length > 0 &&
    chapters.every((c) => c.status === 'ready') &&
    totalTopics > 0 &&
    !hasInvalid &&
    savedChapters.length > 0 &&
    !blocked;

 const confirmLabel =
    stage === STAGE.SAVING
      ? 'Saving…'
      : loadingCount > 0
        ? `Waiting for ${loadingCount}…`
        : errorCount > 0
          ? `Retry or remove ${errorCount} failed`
          : blocked
            ? 'Extend the deadline or remove topics'
            : !estimate.fresh && estimate.status !== 'error' && totalTopics > 0
              ? 'Calculating…'
              : 'Confirm & Save';

  // ---------- Generation ----------

  const expandOne = async (uid, title, siblingTitles, runId) => {
    patchChapter(uid, { status: 'loading', error: '' });
    try {
      const result = await expandChapter(goalId, {
        subject: subject.trim(),
        chapterTitle: title,
        siblingChapters: siblingTitles,
        context: context.trim(),
      });
      if (isStale(runId)) return;
      patchChapter(uid, { status: 'ready', subtopics: result.subtopics.map(topicFromAi) });
    } catch (err) {
      if (isStale(runId)) return;
      patchChapter(uid, { status: 'error', error: errorMessage(err, 'Could not load topics for this chapter.') });
    }
  };

  const expandAll = async (list, runId) => {
    const queue = [...list];
    const siblingTitles = list.map((c) => c.title);

    const worker = async () => {
      while (queue.length > 0) {
        if (isStale(runId)) return;
        const chapter = queue.shift();
        await expandOne(chapter.uid, chapter.title, siblingTitles, runId);
      }
    };

    await Promise.all(Array.from({ length: Math.min(EXPAND_CONCURRENCY, list.length) }, worker));
  };

  const handleGenerate = async (e) => {
    e?.preventDefault();
    setError('');
    setStage(STAGE.LOADING);
    const runId = ++runIdRef.current;

    try {
      const result = await generateChapters(goalId, subject.trim(), context.trim());
      if (isStale(runId)) return;

      const list = result.chapters.map((c) => ({
        uid: makeUid('ch'),
        title: c.title,
        level: null,
        subtopics: [],
        status: 'loading',
        error: '',
      }));

      setChapters(list);
      setStage(STAGE.PREVIEW);
      expandAll(list, runId);
    } catch (err) {
      if (isStale(runId)) return;
      setError(errorMessage(err, 'Could not generate a syllabus. Try again.'));
      setStage(STAGE.INPUT);
    }
  };

  const handleRetryChapter = (chapter) => {
    expandOne(chapter.uid, chapter.title, chapters.map((c) => c.title), runIdRef.current);
  };

  const handleRegenerateChapter = (chapter) => {
    if (!confirm("Replace this chapter's topics with a fresh AI draft? Your edits to it will be lost.")) return;
    handleRetryChapter(chapter);
  };

  const handleConfirm = async () => {
    if (savedChapters.length === 0) return;
    setError('');
    setStage(STAGE.SAVING);
    try {
      const result = subjectNode
        ? await saveSubjectRoadmap(goalId, subjectNode._id, savedChapters)
        : await bulkInsertSyllabus(goalId, subject.trim(), savedChapters);
      onSaved(result);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the syllabus.'));
      setStage(STAGE.PREVIEW);
    }
  };

  // ---------- Editing helpers (keyed by uid) ----------

  const deleteChapter = (uid) => setChapters((prev) => prev.filter((c) => c.uid !== uid));

  const moveChapter = (uid, dir) => {
    setChapters((prev) => {
      const from = prev.findIndex((c) => c.uid === uid);
      const to = from + dir;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  const addChapter = () => {
    setChapters((prev) =>
      prev.length >= LIMITS.chapters
        ? prev
        : [
            ...prev,
            { uid: makeUid('ch'), title: 'New chapter', level: null, subtopics: [newTopic()], status: 'ready', error: '' },
          ]
    );
  };

  const addSubtopic = (uid) =>
    updateTopics(uid, (topics) => (topics.length >= LIMITS.subtopics ? topics : [...topics, newTopic()]));

  const removeSubtopic = (uid, topicUid) => updateTopics(uid, (topics) => topics.filter((t) => t.uid !== topicUid));

  return (
    <div className="modal-backdrop" onClick={stage === STAGE.INPUT ? onClose : undefined}>
      <div className={`modal-panel syllabus-modal ${stage === STAGE.PREVIEW || stage === STAGE.SAVING ? 'syllabus-modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        {stage === STAGE.INPUT && (
          <form onSubmit={handleGenerate}>
            <h2 className="text-stat syllabus-title">
              <ListTree size={20} /> AI Generate Roadmap
            </h2>
            <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
              Enter a subject and we'll draft chapters first, then fill in each chapter's topics. You can edit
              everything before saving, and tell us how well you already know it.
            </p>

            {error && <p className="auth-error">{error}</p>}

            <label className="auth-label">
              Subject
              <input
                className="auth-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Computer Networks"
                required
                autoFocus
                readOnly={Boolean(subjectNode)}
              />
            </label>

            <label className="auth-label" style={{ marginTop: 'var(--space-3)' }}>
              Context <span className="text-muted">(optional)</span>
              <input
                className="auth-input"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="e.g. focus on memory management, I'm weak there"
              />
            </label>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                Generate
              </button>
            </div>
          </form>
        )}

        {stage === STAGE.LOADING && (
          <div className="syllabus-loading">
            <div className="skeleton" style={{ height: 24, width: '60%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 16, width: '90%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 16, width: '80%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 16, width: '85%' }} />
            <p className="text-muted" style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
              Outlining your chapters…
            </p>
          </div>
        )}

        {(stage === STAGE.PREVIEW || stage === STAGE.SAVING) && (
          <>
            <div className="syllabus-preview-header">
              <h2 className="text-stat syllabus-title">Review your syllabus</h2>
              <p className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                {loadingCount > 0
                  ? `Writing topics… ${readyCount} of ${chapters.length} chapters ready`
                  : `${totalTopics} topics · ${formatDuration(plannedMinutes)} planned`}
              </p>
              {loadingCount > 0 && (
                <div className="syllabus-progress">
                  <div
                    className="syllabus-progress-fill"
                    style={{ width: `${chapters.length ? (readyCount / chapters.length) * 100 : 0}%` }}
                  />
                </div>
              )}
                 <FailedBanner
                  failures={chapters.filter((c) => c.status === 'error').map((c) => ({ key: c.uid, label: c.title, message: c.error }))}
                  kind="chapter"
                  onRetry={(uid) => {
                    const c = chapters.find((x) => x.uid === uid);
                    if (c) handleRetryChapter(c);
                  }}
                  onRemove={deleteChapter}
                  onRetryAll={() => chapters.filter((c) => c.status === 'error').forEach(handleRetryChapter)}
                />
            </div>

            <LevelPills value={defaultLevel} onChange={setDefaultLevel} title={`How well do you already know ${subject.trim() || 'this subject'}?`} />

            {fitChoice && loadingCount === 0 && <FitModeToggle mode={mode} onChange={setMode} />}

            <PlanBanner view={view} status={estimate.status} error={estimate.error} onRetry={estimate.retry} waiting={loadingCount > 0} />

            {error && <p className="auth-error">{error}</p>}

            <div className={`syllabus-chapters ${estimate.fresh ? '' : 'rp-stale'}`}>
              {chapters.map((chapter, ci) => (
                <div key={chapter.uid} className="syllabus-chapter">
                  <div className="syllabus-chapter-header">
                    <div className="syllabus-reorder">
                      <button type="button" aria-label="Move up" onClick={() => moveChapter(chapter.uid, -1)} disabled={ci === 0}>
                        <ChevronUp size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        onClick={() => moveChapter(chapter.uid, 1)}
                        disabled={ci === chapters.length - 1}
                      >
                        <ChevronDown size={13} />
                      </button>
                    </div>

                    <input
                      className="syllabus-chapter-title"
                      value={chapter.title}
                      aria-label="Chapter title"
                      onChange={(e) => patchChapter(chapter.uid, { title: e.target.value })}
                    />

                    {chapter.status === 'ready' && (
                      <LevelSelect
                        value={chapter.level}
                        inheritLabel="Same as overall"
                        ariaLabel={`How well you know ${chapter.title}`}
                        onChange={(level) => patchChapter(chapter.uid, { level })}
                      />
                    )}

                    {chapter.status === 'ready' && (
                      <span className="syllabus-chapter-total">{formatDuration(sumMinutes(chapter.subtopics, indexed, effectiveMode))}</span>
                    )}

                    {chapter.status === 'ready' && (
                      <button
                        type="button"
                        className="syllabus-delete"
                        title="Regenerate topics"
                        aria-label="Regenerate topics"
                        onClick={() => handleRegenerateChapter(chapter)}
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}
                    <button type="button" className="syllabus-delete" title="Remove chapter" aria-label="Remove chapter" onClick={() => deleteChapter(chapter.uid)}>
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {chapter.status === 'loading' && (
                    <div className="syllabus-subtopics">
                      <div className="syllabus-chapter-state">
                        <Loader2 size={14} className="syllabus-spin" /> Writing topics…
                      </div>
                      <div className="skeleton" style={{ height: 14, width: '85%' }} />
                      <div className="skeleton" style={{ height: 14, width: '70%' }} />
                    </div>
                  )}

                  {chapter.status === 'error' && (
                    <div className="syllabus-subtopics">
                      <div className="syllabus-chapter-state syllabus-chapter-error">
                        <AlertCircle size={14} /> {chapter.error}
                      </div>
                      <button type="button" className="syllabus-retry-btn" onClick={() => handleRetryChapter(chapter)}>
                        <RefreshCw size={13} /> Retry
                      </button>
                    </div>
                  )}

                  {chapter.status === 'ready' && (
                    <div className="syllabus-subtopics">
                      {chapter.subtopics.length === 0 && (
                        <p className="rp-empty-chapter">No topics left. This chapter will not be saved unless you add one.</p>
                      )}

                      {chapter.subtopics.map((topic) => (
                        <TopicRow
                          key={topic.uid}
                          topic={topic}
                          minutes={displayMinutes(topic, indexed, effectiveMode)}
                          info={indexed?.topics[topic.uid]}
                          mode={effectiveMode}
                          locked={isLocked(topic)}
                          onTitle={(title) => patchTopic(chapter.uid, topic.uid, { title })}
                          onMinutes={(minutes) => patchTopic(chapter.uid, topic.uid, { lockedMinutes: minutes })}
                          onUnlock={() => patchTopic(chapter.uid, topic.uid, { lockedMinutes: null })}
                          onKind={(kind) => patchTopic(chapter.uid, topic.uid, { kind })}
                          onPriority={(priority) => patchTopic(chapter.uid, topic.uid, { priority })}
                          onRemove={() => removeSubtopic(chapter.uid, topic.uid)}
                        />
                      ))}

                      <button
                        type="button"
                        className="syllabus-add-subtopic"
                        onClick={() => addSubtopic(chapter.uid)}
                        disabled={chapter.subtopics.length >= LIMITS.subtopics}
                      >
                        <Plus size={13} /> Add topic
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <button
                type="button"
                className="btn btn-ghost"
                onClick={addChapter}
                disabled={chapters.length >= LIMITS.chapters}
                style={{ width: '100%' }}
              >
                <Plus size={16} /> Add chapter
              </button>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={stage === STAGE.SAVING} style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirm}
                disabled={!canSave || stage === STAGE.SAVING}
                style={{ flex: 1 }}
              >
                {confirmLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SyllabusPreviewModal;