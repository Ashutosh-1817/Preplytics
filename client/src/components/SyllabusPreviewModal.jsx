

import { useState, useRef, useEffect } from 'react';
import {
  Sparkles, ChevronUp, ChevronDown, Trash2, X, Plus, RefreshCw, Loader2,
  AlertCircle, AlertTriangle, CheckCircle2, Ban,
} from 'lucide-react';
import { generateChapters, expandChapter, bulkInsertSyllabus, saveSubjectRoadmap, fetchCapacity } from '../services/aiSyllabus.api.js';
import { formatDuration } from '../utils/formatDuration.js';
import './SyllabusPreviewModal.css';

const STAGE = { INPUT: 'input', LOADING: 'loading', PREVIEW: 'preview', SAVING: 'saving' };
const EXPAND_CONCURRENCY = 3;
const MAX_CHAPTERS = 10; // must match the backend validator
const MAX_SUBTOPICS = 8;

let uidCounter = 0;
const nextUid = () => `ch-${Date.now()}-${uidCounter++}`;

const errorMessage = (err, fallback) => {
  if (err.code === 'ECONNABORTED') return 'This took too long. Please try again.';
  return err.response?.data?.error?.message || fallback;
};

function SyllabusPreviewModal({ goalId, subjectNode = null, onClose, onSaved }) {
  const [stage, setStage] = useState(STAGE.INPUT);
  const [subject, setSubject] = useState(subjectNode?.title ?? '');
  const [context, setContext] = useState('');
  const [chapters, setChapters] = useState([]); // { uid, title, subtopics: [{ title, estimatedMinutes, included }], status, error }
  const [error, setError] = useState('');
  const [capacity, setCapacity] = useState(null);

  const aliveRef = useRef(true);
  const runIdRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    fetchCapacity(goalId)
      .then((data) => {
                if (!aliveRef.current) return;
                  const selfMinutes =
                    subjectNode && subjectNode.isActionable && subjectNode.status !== 'completed'
                    ? subjectNode.estimatedMinutes || 30
                    : 0;
                  setCapacity({ ...data, existingRemainingMinutes: Math.max(0, data.existingRemainingMinutes - selfMinutes) });
      })
      .catch(() => {
        // Non-blocking: the backend still enforces the limit on save
      });
  }, [goalId]);

  const isStale = (runId) => !aliveRef.current || runIdRef.current !== runId;

  const patchChapter = (uid, patch) =>
    setChapters((prev) => prev.map((c) => (c.uid === uid ? { ...c, ...patch } : c)));

  // ---------- Derived state ----------

  const readyCount = chapters.filter((c) => c.status === 'ready').length;
  const loadingCount = chapters.filter((c) => c.status === 'loading').length;
  const errorCount = chapters.filter((c) => c.status === 'error').length;
  const totalSubtopics = chapters.reduce((sum, c) => sum + c.subtopics.length, 0);

  // Only checked subtopics are counted and saved; a chapter with none
  // checked is left out entirely.
  const includedChapters = chapters
    .map((c) => ({ ...c, subtopics: c.subtopics.filter((s) => s.included) }))
    .filter((c) => c.subtopics.length > 0);

  const selectedCount = includedChapters.reduce((sum, c) => sum + c.subtopics.length, 0);
  const selectedMinutes = includedChapters.reduce(
    (sum, c) => sum + c.subtopics.reduce((m, s) => m + (Number(s.estimatedMinutes) || 0), 0),
    0
  );

  const dueLabel = capacity?.hasDeadline
    ? new Date(capacity.targetDate).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';

  // Mirrors the backend rules exactly, so the live check and the server agree
  const capacityView = (() => {
    if (!capacity) return null;
    if (!capacity.hasDeadline) return { kind: 'no-deadline' };
    if (loadingCount > 0) return { kind: 'checking' };

    const total = selectedMinutes + capacity.existingRemainingMinutes;
    const availableMinutes = capacity.days * capacity.dailyCapacityMinutes;
    const requiredDaily = Math.ceil(total / capacity.days);
    const blocked = requiredDaily > capacity.maxDailyMinutes;
    const over = total > availableMinutes;

    return {
      kind: blocked ? 'blocked' : over ? 'over' : 'ok',
      total,
      availableMinutes,
      requiredDaily,
      overBy: Math.max(0, total - availableMinutes),
      hardLimitOverBy: Math.max(0, total - capacity.maxDailyMinutes * capacity.days),
    };
  })();

  const blocked = capacityView?.kind === 'blocked';

  const hasInvalid = includedChapters.some(
    (c) => !c.title.trim() || c.subtopics.some((s) => !s.title.trim() || !(Number(s.estimatedMinutes) > 0))
  );

  const canSave =
    chapters.length > 0 &&
    chapters.every((c) => c.status === 'ready') &&
    includedChapters.length > 0 &&
    !hasInvalid &&
    !blocked;

  const confirmLabel =
    stage === STAGE.SAVING
      ? 'Saving…'
      : loadingCount > 0
        ? `Waiting for ${loadingCount}…`
        : blocked
          ? 'Trim topics to save'
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
      patchChapter(uid, {
        status: 'ready',
        subtopics: result.subtopics.map((s) => ({ ...s, included: true })),
      });
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
        uid: nextUid(),
        title: c.title,
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
    setError('');
    setStage(STAGE.SAVING);
    try {
      const payload = includedChapters.map((c) => ({
        title: c.title.trim(),
        subtopics: c.subtopics.map((s) => ({
          title: s.title.trim(),
          estimatedMinutes: Number(s.estimatedMinutes),
        })),
      }));
        const result = subjectNode
        ? await saveSubjectRoadmap(goalId, subjectNode._id, payload)
        : await bulkInsertSyllabus(goalId, subject.trim(), payload);
      onSaved(result);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the syllabus.'));
      setStage(STAGE.PREVIEW);
    }
  };

  // ---------- Editing helpers (keyed by uid) ----------

  const updateChapterTitle = (uid, title) => patchChapter(uid, { title });

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
    setChapters((prev) => [
      ...prev,
      {
        uid: nextUid(),
        title: 'New chapter',
        subtopics: [{ title: 'New subtopic', estimatedMinutes: 60, included: true }],
        status: 'ready',
        error: '',
      },
    ]);
  };

  const updateSubtopic = (uid, si, field, value) => {
    setChapters((prev) =>
      prev.map((c) =>
        c.uid !== uid
          ? c
          : { ...c, subtopics: c.subtopics.map((s, j) => (j === si ? { ...s, [field]: value } : s)) }
      )
    );
  };

  const toggleSubtopic = (uid, si) => {
    setChapters((prev) =>
      prev.map((c) =>
        c.uid !== uid
          ? c
          : { ...c, subtopics: c.subtopics.map((s, j) => (j === si ? { ...s, included: !s.included } : s)) }
      )
    );
  };

  // Checks everything on, or, if everything is already on, everything off
  const toggleChapter = (uid) => {
    setChapters((prev) =>
      prev.map((c) => {
        if (c.uid !== uid) return c;
        const allOn = c.subtopics.length > 0 && c.subtopics.every((s) => s.included);
        return { ...c, subtopics: c.subtopics.map((s) => ({ ...s, included: !allOn })) };
      })
    );
  };

  const deleteSubtopic = (uid, si) => {
    setChapters((prev) =>
      prev.map((c) => (c.uid !== uid ? c : { ...c, subtopics: c.subtopics.filter((_, j) => j !== si) }))
    );
  };

  const addSubtopic = (uid) => {
    setChapters((prev) =>
      prev.map((c) =>
        c.uid !== uid
          ? c
          : { ...c, subtopics: [...c.subtopics, { title: 'New subtopic', estimatedMinutes: 60, included: true }] }
      )
    );
  };

  return (
    <div className="modal-backdrop" onClick={stage === STAGE.INPUT ? onClose : undefined}>
      <div className="modal-panel syllabus-modal" onClick={(e) => e.stopPropagation()}>
        {stage === STAGE.INPUT && (
          <form onSubmit={handleGenerate}>
            <h2 className="text-stat syllabus-title">
              <Sparkles size={20} /> AI Generate Roadmap
            </h2>
            <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
              Enter a subject and we'll draft chapters first, then fill in each chapter's topics. You can trim
              and edit everything before saving.
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
                  : `${selectedCount} of ${totalSubtopics} subtopics selected · ${formatDuration(selectedMinutes)}. Uncheck anything you already know`}
              </p>
              {loadingCount > 0 && (
                <div className="syllabus-progress">
                  <div
                    className="syllabus-progress-fill"
                    style={{ width: `${chapters.length ? (readyCount / chapters.length) * 100 : 0}%` }}
                  />
                </div>
              )}
              {errorCount > 0 && (
                <p className="syllabus-hint">
                  {errorCount} chapter{errorCount > 1 ? 's' : ''} failed. Retry or remove them to continue.
                </p>
              )}
            </div>

            {capacityView?.kind === 'no-deadline' && (
              <p className="text-muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>
                This goal has no deadline, so there's no capacity limit.
              </p>
            )}

            {capacityView && capacityView.kind !== 'no-deadline' && (
              <div className={`capacity-banner capacity-${capacityView.kind}`}>
                {capacityView.kind === 'checking' && (
                  <div className="capacity-row">
                    <Loader2 size={15} className="syllabus-spin" />
                    <span>Checking capacity once every chapter has loaded…</span>
                  </div>
                )}

                {capacityView.kind === 'ok' && (
                  <div className="capacity-row">
                    <CheckCircle2 size={15} />
                    <span>
                      <span className="capacity-strong">Fits your schedule.</span>{' '}
                      {formatDuration(capacityView.total)} of {formatDuration(capacityView.availableMinutes)} available until {dueLabel}.
                    </span>
                  </div>
                )}

                {capacityView.kind === 'over' && (
                  <div className="capacity-row">
                    <AlertTriangle size={15} />
                    <div className="capacity-lines">
                      <span>
                        <span className="capacity-strong">Warning:</span> This syllabus requires{' '}
                        {formatDuration(capacityView.total)}
                        {capacity.existingRemainingMinutes > 0 &&
                          ` (including ${formatDuration(capacity.existingRemainingMinutes)} already on your roadmap)`}
                        , but you only have {formatDuration(capacityView.availableMinutes)} available until {dueLabel}.
                      </span>
                      <span>
                        To finish all selected topics by {dueLabel}, you must increase your daily study time to{' '}
                        <span className="capacity-strong">{formatDuration(capacityView.requiredDaily)}</span>.
                      </span>
                      <span className="capacity-note">
                        Or uncheck about {formatDuration(capacityView.overBy)} of topics you already know to fit your
                        current {formatDuration(capacity.dailyCapacityMinutes)} a day.
                      </span>
                    </div>
                  </div>
                )}

                {capacityView.kind === 'blocked' && (
                  <div className="capacity-row">
                    <Ban size={15} />
                    <div className="capacity-lines">
                      <span>
                        <span className="capacity-strong">Too much for this deadline.</span> Finishing by {dueLabel} would
                        take {formatDuration(capacityView.requiredDaily)} every day, over the{' '}
                        {capacity.maxDailyMinutes / 60}-hour daily limit, so a schedule can't be built.
                      </span>
                      <span className="capacity-note">
                        Uncheck at least {formatDuration(capacityView.hardLimitOverBy)} of topics, or extend this goal's
                        deadline with Edit goal.
                      </span>
                    </div>
                  </div>
                )}

                {capacityView.kind !== 'checking' && (
                  <>
                    <div className="capacity-stats">
                      <span>Selected <strong>{formatDuration(selectedMinutes)}</strong></span>
                      {capacity.existingRemainingMinutes > 0 && (
                        <span>Already on roadmap <strong>{formatDuration(capacity.existingRemainingMinutes)}</strong></span>
                      )}
                      <span>Available <strong>{formatDuration(capacityView.availableMinutes)}</strong></span>
                    </div>
                    <div className="capacity-meter">
                      <div
                        className="capacity-meter-fill"
                        style={{
                          width: `${Math.min(100, (capacityView.total / Math.max(1, capacityView.availableMinutes)) * 100)}%`,
                        }}
                      />
                    </div>
                    {Math.abs(capacity.efficiencyRatio - 1) > 0.01 && (
                      <span className="capacity-note">Your daily time is adjusted to your measured study pace.</span>
                    )}
                  </>
                )}
              </div>
            )}

            {error && <p className="auth-error">{error}</p>}

            <div className="syllabus-chapters">
              {chapters.map((chapter, ci) => {
                const includedInChapter = chapter.subtopics.filter((s) => s.included).length;
                const allIncluded = chapter.subtopics.length > 0 && includedInChapter === chapter.subtopics.length;
                const someIncluded = includedInChapter > 0;
                const chapterMinutes = chapter.subtopics
                  .filter((s) => s.included)
                  .reduce((m, s) => m + (Number(s.estimatedMinutes) || 0), 0);

                return (
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
                        type="checkbox"
                        className="syllabus-check"
                        title="Include or skip this whole chapter"
                        checked={allIncluded}
                        ref={(el) => {
                          if (el) el.indeterminate = someIncluded && !allIncluded;
                        }}
                        onChange={() => toggleChapter(chapter.uid)}
                        disabled={chapter.status !== 'ready' || chapter.subtopics.length === 0}
                      />

                      <input
                        className="syllabus-chapter-title"
                        value={chapter.title}
                        onChange={(e) => updateChapterTitle(chapter.uid, e.target.value)}
                      />

                      {chapter.status === 'ready' && (
                        <span className="syllabus-chapter-total">{formatDuration(chapterMinutes)}</span>
                      )}

                      {chapter.status === 'ready' && (
                        <button
                          type="button"
                          className="syllabus-delete"
                          title="Regenerate topics"
                          onClick={() => handleRegenerateChapter(chapter)}
                        >
                          <RefreshCw size={14} />
                        </button>
                      )}
                      <button type="button" className="syllabus-delete" title="Remove chapter" onClick={() => deleteChapter(chapter.uid)}>
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
                        {chapter.subtopics.map((sub, si) => (
                          <div key={si} className={`syllabus-subtopic-row ${sub.included ? '' : 'syllabus-subtopic-row-off'}`}>
                            <input
                              type="checkbox"
                              className="syllabus-check"
                              title={sub.included ? 'Uncheck if you already know this' : 'Include this topic'}
                              checked={sub.included}
                              onChange={() => toggleSubtopic(chapter.uid, si)}
                            />
                            <input
                              className="syllabus-subtopic-title"
                              value={sub.title}
                              onChange={(e) => updateSubtopic(chapter.uid, si, 'title', e.target.value)}
                            />
                            <input
                              type="number"
                              min="5"
                              step="5"
                              className="syllabus-subtopic-minutes"
                              value={sub.estimatedMinutes}
                              onChange={(e) => updateSubtopic(chapter.uid, si, 'estimatedMinutes', Number(e.target.value))}
                            />
                            <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>min</span>
                            <button type="button" className="syllabus-delete" title="Remove subtopic" onClick={() => deleteSubtopic(chapter.uid, si)}>
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="syllabus-add-subtopic"
                          onClick={() => addSubtopic(chapter.uid)}
                          disabled={chapter.subtopics.length >= MAX_SUBTOPICS}
                        >
                          <Plus size={13} /> Add subtopic
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                className="btn btn-ghost"
                onClick={addChapter}
                disabled={chapters.length >= MAX_CHAPTERS}
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