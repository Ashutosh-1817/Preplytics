import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, Loader2, AlertCircle, RefreshCw, Trash2, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, Ban,
} from 'lucide-react';
import { generateSubjects, expandSubject, bulkInsertGoalSyllabus, fetchCapacity } from '../services/aiSyllabus.api.js';
import { formatDuration } from '../utils/formatDuration.js';
import './SyllabusPreviewModal.css'; // reuses the syllabus-* and capacity-* styles

const STAGE = { LOADING: 'loading', FAILED: 'failed', PREVIEW: 'preview', SAVING: 'saving' };
const EXPAND_CONCURRENCY = 3;

let uidCounter = 0;
const nextUid = () => `sj-${Date.now()}-${uidCounter++}`;

const errorMessage = (err, fallback) => {
  if (err.code === 'ECONNABORTED') return 'This took too long. Please try again.';
  return err.response?.data?.error?.message || fallback;
};

const includedChaptersOf = (subject) =>
  subject.chapters
    .map((c) => ({ ...c, subtopics: c.subtopics.filter((t) => t.included) }))
    .filter((c) => c.subtopics.length > 0);

const minutesOfChapters = (chapters) =>
  chapters.reduce((sum, c) => sum + c.subtopics.reduce((m, t) => m + (Number(t.estimatedMinutes) || 0), 0), 0);

const allIncluded = (subject) =>
  subject.chapters.length > 0 && subject.chapters.every((c) => c.subtopics.every((t) => t.included));

function GoalRoadmapWizard({ goalId, goalTitle, onClose, onSaved }) {
  const [stage, setStage] = useState(STAGE.LOADING);
  const [subjects, setSubjects] = useState([]); // { uid, title, status, error, open, chapters: [{ title, subtopics: [{ title, estimatedMinutes, included }] }] }
  const [error, setError] = useState('');
  const [capacity, setCapacity] = useState(null);

  const aliveRef = useRef(true);
  const runIdRef = useRef(0);
  const startedRef = useRef(false); // StrictMode mounts twice in dev; this keeps it to one set of AI calls

  const isStale = (runId) => !aliveRef.current || runIdRef.current !== runId;

  // ---------- Generation ----------

  const patchSubject = (uid, fn) => setSubjects((prev) => prev.map((s) => (s.uid === uid ? fn(s) : s)));

  const expandOne = async (uid, title, siblingTitles, runId) => {
    patchSubject(uid, (s) => ({ ...s, status: 'loading', error: '' }));
    try {
      const result = await expandSubject(goalId, { subject: title, siblingSubjects: siblingTitles, context: '' });
      if (isStale(runId)) return;
      patchSubject(uid, (s) => ({
        ...s,
        status: 'ready',
        open: false,
        chapters: result.chapters.map((c) => ({
          title: c.title,
          subtopics: c.subtopics.map((t) => ({ ...t, included: true })),
        })),
      }));
    } catch (err) {
      if (isStale(runId)) return;
      patchSubject(uid, (s) => ({ ...s, status: 'error', error: errorMessage(err, 'Could not load topics for this subject.') }));
    }
  };

  const expandAll = async (list, runId) => {
    const queue = [...list];
    const siblingTitles = list.map((s) => s.title);

    const worker = async () => {
      while (queue.length > 0) {
        if (isStale(runId)) return;
        const subject = queue.shift();
        await expandOne(subject.uid, subject.title, siblingTitles, runId);
      }
    };

    await Promise.all(Array.from({ length: Math.min(EXPAND_CONCURRENCY, list.length) }, worker));
  };

  const runGeneration = async () => {
    const runId = ++runIdRef.current;
    setError('');
    setSubjects([]);
    setStage(STAGE.LOADING);

    try {
      const result = await generateSubjects(goalId);
      if (isStale(runId)) return;

      const list = result.subjects.map((s) => ({
        uid: nextUid(),
        title: s.title,
        status: 'loading',
        error: '',
        open: false,
        chapters: [],
      }));

      setSubjects(list);
      setStage(STAGE.PREVIEW);
      expandAll(list, runId);
    } catch (err) {
      if (isStale(runId)) return;
      setError(errorMessage(err, 'Could not generate a roadmap. Try again.'));
      setStage(STAGE.FAILED);
    }
  };

  useEffect(() => {
    aliveRef.current = true;

    if (!startedRef.current) {
      startedRef.current = true;
      runGeneration();
      fetchCapacity(goalId)
        .then((data) => {
          if (aliveRef.current) setCapacity(data);
        })
        .catch(() => {
          // Non-blocking: the backend still enforces the limit on save
        });
    }

    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Derived state ----------

  const loadingCount = subjects.filter((s) => s.status === 'loading').length;
  const readyCount = subjects.filter((s) => s.status === 'ready').length;
  const errorCount = subjects.filter((s) => s.status === 'error').length;

  const included = subjects
    .map((s) => ({ ...s, chapters: includedChaptersOf(s) }))
    .filter((s) => s.chapters.length > 0);

  const selectedMinutes = included.reduce((sum, s) => sum + minutesOfChapters(s.chapters), 0);
  const selectedCount = included.reduce((sum, s) => sum + s.chapters.reduce((n, c) => n + c.subtopics.length, 0), 0);

  const hasInvalid = included.some(
    (s) =>
      !s.title.trim() ||
      s.chapters.some((c) => !c.title.trim() || c.subtopics.some((t) => !t.title.trim() || !(Number(t.estimatedMinutes) > 0)))
  );

  // Mirrors the backend rules exactly, so the live check and the server agree
  const capacityView = (() => {
    if (!capacity || !capacity.hasDeadline || loadingCount > 0) return null;

    const total = selectedMinutes + capacity.existingRemainingMinutes;
    const availableMinutes = capacity.days * capacity.dailyCapacityMinutes;
    const requiredDaily = Math.ceil(total / capacity.days);
    const isBlocked = requiredDaily > capacity.maxDailyMinutes;

    return {
      kind: isBlocked ? 'blocked' : total > availableMinutes ? 'over' : 'ok',
      total,
      availableMinutes,
      requiredDaily,
      overBy: Math.max(0, total - availableMinutes),
      hardLimitOverBy: Math.max(0, total - capacity.maxDailyMinutes * capacity.days),
    };
  })();

  const blocked = capacityView?.kind === 'blocked';
  const canSave =
    subjects.length > 0 &&
    subjects.every((s) => s.status === 'ready') &&
    included.length > 0 &&
    !hasInvalid &&
    !blocked;

  // ---------- Editing ----------

  const patchChapter = (uid, ci, fn) =>
    patchSubject(uid, (s) => ({ ...s, chapters: s.chapters.map((c, i) => (i === ci ? fn(c) : c)) }));

  const toggleOpen = (uid) => patchSubject(uid, (s) => ({ ...s, open: !s.open }));

  const toggleSubject = (uid) =>
    patchSubject(uid, (s) => {
      const on = !allIncluded(s);
      return { ...s, chapters: s.chapters.map((c) => ({ ...c, subtopics: c.subtopics.map((t) => ({ ...t, included: on })) })) };
    });

  const toggleChapter = (uid, ci) =>
    patchChapter(uid, ci, (c) => {
      const on = !c.subtopics.every((t) => t.included);
      return { ...c, subtopics: c.subtopics.map((t) => ({ ...t, included: on })) };
    });

  const updateSubtopic = (uid, ci, ti, field, value) =>
    patchChapter(uid, ci, (c) => ({
      ...c,
      subtopics: c.subtopics.map((t, j) => (j === ti ? { ...t, [field]: value } : t)),
    }));

  const deleteSubject = (uid) => setSubjects((prev) => prev.filter((s) => s.uid !== uid));

  const handleRetrySubject = (subject) =>
    expandOne(subject.uid, subject.title, subjects.map((s) => s.title), runIdRef.current);

  const handleConfirm = async () => {
    setError('');
    setStage(STAGE.SAVING);
    try {
      const payload = included.map((s) => ({
        title: s.title.trim(),
        chapters: s.chapters.map((c) => ({
          title: c.title.trim(),
          subtopics: c.subtopics.map((t) => ({ title: t.title.trim(), estimatedMinutes: Number(t.estimatedMinutes) })),
        })),
      }));
      const result = await bulkInsertGoalSyllabus(goalId, payload);
      onSaved(result);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the roadmap.'));
      setStage(STAGE.PREVIEW);
    }
  };

  const dueLabel = capacity?.hasDeadline
    ? new Date(capacity.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '';

  const confirmLabel =
    stage === STAGE.SAVING ? 'Saving…' : loadingCount > 0 ? `Waiting for ${loadingCount}…` : blocked ? 'Trim topics to save' : 'Confirm & Save';

  // ---------- Render ----------

  return (
    <div className="modal-backdrop">
      <div className="modal-panel syllabus-modal" onClick={(e) => e.stopPropagation()}>
        {stage === STAGE.LOADING && (
          <div className="syllabus-loading">
            <h2 className="text-stat syllabus-title"><Sparkles size={20} /> Building your roadmap</h2>
            <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
              Outlining the core subjects for “{goalTitle}”…
            </p>
            <div className="skeleton" style={{ height: 16, width: '90%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 16, width: '80%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 16, width: '85%' }} />
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ marginTop: 'var(--space-5)', width: '100%' }}>
              Skip, I'll build it myself
            </button>
          </div>
        )}

        {stage === STAGE.FAILED && (
          <div>
            <h2 className="text-stat syllabus-title"><AlertCircle size={20} /> Couldn't build the roadmap</h2>
            <p className="auth-error">{error}</p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Skip for now</button>
              <button type="button" className="btn btn-primary" onClick={runGeneration} style={{ flex: 1 }}>Try again</button>
            </div>
          </div>
        )}

        {(stage === STAGE.PREVIEW || stage === STAGE.SAVING) && (
          <>
            <div className="syllabus-preview-header">
              <h2 className="text-stat syllabus-title">Review your roadmap</h2>
              <p className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                {loadingCount > 0
                  ? `Writing topics… ${readyCount} of ${subjects.length} subjects ready`
                  : `${selectedCount} topics selected · ${formatDuration(selectedMinutes)}. Uncheck anything you already know`}
              </p>
              {loadingCount > 0 && (
                <div className="syllabus-progress">
                  <div
                    className="syllabus-progress-fill"
                    style={{ width: `${subjects.length ? (readyCount / subjects.length) * 100 : 0}%` }}
                  />
                </div>
              )}
              {errorCount > 0 && (
                <p className="syllabus-hint">
                  {errorCount} subject{errorCount > 1 ? 's' : ''} failed. Retry or remove them to continue.
                </p>
              )}
            </div>

            {capacity && !capacity.hasDeadline && (
              <p className="text-muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>
                This goal has no deadline, so there's no capacity limit.
              </p>
            )}

            {capacityView && (
              <div className={`capacity-banner capacity-${capacityView.kind}`}>
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
                        <span className="capacity-strong">Warning:</span> this needs {formatDuration(capacityView.total)}, but only{' '}
                        {formatDuration(capacityView.availableMinutes)} is available until {dueLabel}.
                      </span>
                      <span>
                        Raise your daily time to <span className="capacity-strong">{formatDuration(capacityView.requiredDaily)}</span>,
                        or uncheck about {formatDuration(capacityView.overBy)} of topics you already know.
                      </span>
                    </div>
                  </div>
                )}
                {capacityView.kind === 'blocked' && (
                  <div className="capacity-row">
                    <Ban size={15} />
                    <div className="capacity-lines">
                      <span>
                        <span className="capacity-strong">Too much for this deadline.</span> It would take{' '}
                        {formatDuration(capacityView.requiredDaily)} every day, over the {capacity.maxDailyMinutes / 60}-hour daily limit.
                      </span>
                      <span className="capacity-note">
                        Uncheck at least {formatDuration(capacityView.hardLimitOverBy)} of topics, or extend the deadline with Edit goal.
                      </span>
                    </div>
                  </div>
                )}
                <div className="capacity-meter">
                  <div
                    className="capacity-meter-fill"
                    style={{ width: `${Math.min(100, (capacityView.total / Math.max(1, capacityView.availableMinutes)) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {error && <p className="auth-error">{error}</p>}

            <div className="syllabus-chapters">
              {subjects.map((subject) => (
                <div key={subject.uid} className="syllabus-chapter">
                  <div className="syllabus-chapter-header">
                    <button type="button" className="syllabus-delete" onClick={() => toggleOpen(subject.uid)} aria-label="Expand or collapse">
                      {subject.open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>

                    <input
                      type="checkbox"
                      className="syllabus-check"
                      title="Include or skip this whole subject"
                      checked={allIncluded(subject)}
                      onChange={() => toggleSubject(subject.uid)}
                      disabled={subject.status !== 'ready'}
                    />

                    <input
                      className="syllabus-chapter-title"
                      value={subject.title}
                      onChange={(e) => patchSubject(subject.uid, (s) => ({ ...s, title: e.target.value }))}
                    />

                    {subject.status === 'ready' && (
                      <span className="syllabus-chapter-total">{formatDuration(minutesOfChapters(includedChaptersOf(subject)))}</span>
                    )}

                    <button type="button" className="syllabus-delete" title="Remove subject" onClick={() => deleteSubject(subject.uid)}>
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {subject.status === 'loading' && (
                    <div className="syllabus-subtopics">
                      <div className="syllabus-chapter-state"><Loader2 size={14} className="syllabus-spin" /> Writing chapters and topics…</div>
                      <div className="skeleton" style={{ height: 14, width: '85%' }} />
                    </div>
                  )}

                  {subject.status === 'error' && (
                    <div className="syllabus-subtopics">
                      <div className="syllabus-chapter-state syllabus-chapter-error"><AlertCircle size={14} /> {subject.error}</div>
                      <button type="button" className="syllabus-retry-btn" onClick={() => handleRetrySubject(subject)}>
                        <RefreshCw size={13} /> Retry
                      </button>
                    </div>
                  )}

                  {subject.status === 'ready' && subject.open && (
                    <div className="syllabus-subtopics">
                      {subject.chapters.map((chapter, ci) => (
                        <div key={ci}>
                          <div className="syllabus-chapter-header">
                            <input
                              type="checkbox"
                              className="syllabus-check"
                              checked={chapter.subtopics.every((t) => t.included)}
                              onChange={() => toggleChapter(subject.uid, ci)}
                            />
                            <input
                              className="syllabus-chapter-title"
                              value={chapter.title}
                              onChange={(e) => patchChapter(subject.uid, ci, (c) => ({ ...c, title: e.target.value }))}
                            />
                          </div>

                          {chapter.subtopics.map((topic, ti) => (
                            <div key={ti} className={`syllabus-subtopic-row ${topic.included ? '' : 'syllabus-subtopic-row-off'}`}>
                              <input
                                type="checkbox"
                                className="syllabus-check"
                                checked={topic.included}
                                onChange={() => updateSubtopic(subject.uid, ci, ti, 'included', !topic.included)}
                              />
                              <input
                                className="syllabus-subtopic-title"
                                value={topic.title}
                                onChange={(e) => updateSubtopic(subject.uid, ci, ti, 'title', e.target.value)}
                              />
                              <input
                                type="number"
                                min="5"
                                step="5"
                                className="syllabus-subtopic-minutes"
                                value={topic.estimatedMinutes}
                                onChange={(e) => updateSubtopic(subject.uid, ci, ti, 'estimatedMinutes', Number(e.target.value))}
                              />
                              <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>min</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={stage === STAGE.SAVING} style={{ flex: 1 }}>
                Skip for now
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

export default GoalRoadmapWizard;