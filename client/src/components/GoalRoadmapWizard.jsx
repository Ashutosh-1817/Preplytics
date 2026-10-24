import { useEffect, useRef, useState } from 'react';
import { Route, Loader2, AlertCircle, RefreshCw, Trash2, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { generateSubjects, expandSubject, bulkInsertGoalSyllabus } from '../services/aiSyllabus.api.js';
import useRoadmapEstimate from '../hooks/useRoadmapEstimate.js';
import { LevelPills, LevelSelect, FitModeToggle, PlanBanner, TopicRow, FailedBanner } from './roadmap/RoadmapPlanParts.jsx';
import {
  DEFAULT_LEVEL,
  LIMITS,
  chapterFromAi,
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
import './SyllabusPreviewModal.css'; // reuses the syllabus-* and capacity-* styles

const STAGE = { LOADING: 'loading', FAILED: 'failed', PREVIEW: 'preview', SAVING: 'saving' };
const EXPAND_CONCURRENCY = 3;

let uidCounter = 0;
const nextUid = () => `sj-${Date.now()}-${uidCounter++}`;

const errorMessage = (err, fallback) => {
  if (err.code === 'ECONNABORTED') return 'This took too long. Please try again.';
  return err.response?.data?.error?.message || fallback;
};

const topicsOf = (subject) => subject.chapters.flatMap((c) => c.subtopics);

function GoalRoadmapWizard({ goalId, goalTitle, onClose, onSaved }) {
  const [stage, setStage] = useState(STAGE.LOADING);
  // { uid, title, level|null, status, error, open, chapters: [{ uid, title, level|null, subtopics: [topic] }] }
  const [subjects, setSubjects] = useState([]);
  const [error, setError] = useState('');
  const [defaultLevel, setDefaultLevel] = useState(DEFAULT_LEVEL);
  const [mode, setMode] = useState('fit'); // 'fit' = shorten to the deadline, 'comfortable' = keep full time

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
        open: true,
        chapters: result.chapters.map(chapterFromAi),
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
        level: null,
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

  const readySubjects = subjects.filter((s) => s.status === 'ready');
  const totalTopics = countTopics(readySubjects);

  // Personalised time from the server (no AI call). Every topic is included, always.
  const estimate = useRoadmapEstimate({
    goalId,
    subjects,
    defaultLevel,
    enabled: stage === STAGE.PREVIEW || stage === STAGE.SAVING,
  });
  const indexed = estimate.data;

  // "Keep full time" only means something while the deadline is actually tight
  const fitChoice = Boolean(indexed && needsFitChoice(indexed.summary));
  const effectiveMode = fitChoice ? mode : 'fit';
  const view = indexed ? planView(indexed.summary, effectiveMode) : null;

  const plannedMinutes = readySubjects.reduce((sum, s) => sum + sumMinutes(topicsOf(s), indexed, effectiveMode), 0);
  const hasInvalid = hasInvalidDraft(readySubjects);
  const blocked = view?.kind === 'blocked';

  const savePayload = estimate.fresh ? buildSavePayload(readySubjects, indexed, effectiveMode) : null;
  const canSave =
    stage === STAGE.PREVIEW &&
    subjects.length > 0 &&
    loadingCount === 0 &&
    errorCount === 0 &&
    totalTopics > 0 &&
    !hasInvalid &&
    Boolean(savePayload && savePayload.length > 0) &&
    !blocked;

  // ---------- Editing ----------

  const patchChapter = (subjectUid, chapterUid, fn) =>
    patchSubject(subjectUid, (s) => ({ ...s, chapters: s.chapters.map((c) => (c.uid === chapterUid ? fn(c) : c)) }));

  const patchTopic = (subjectUid, chapterUid, topicUid, patch) =>
    patchChapter(subjectUid, chapterUid, (c) => ({
      ...c,
      subtopics: c.subtopics.map((t) => (t.uid === topicUid ? { ...t, ...patch } : t)),
    }));

  const toggleOpen = (uid) => patchSubject(uid, (s) => ({ ...s, open: !s.open }));

  const removeTopic = (subjectUid, chapterUid, topicUid) =>
    patchChapter(subjectUid, chapterUid, (c) => ({ ...c, subtopics: c.subtopics.filter((t) => t.uid !== topicUid) }));

  const addTopic = (subjectUid, chapterUid) =>
    patchChapter(subjectUid, chapterUid, (c) =>
      c.subtopics.length >= LIMITS.subtopics ? c : { ...c, subtopics: [...c.subtopics, newTopic()] }
    );

  const removeChapter = (subjectUid, chapterUid) =>
    patchSubject(subjectUid, (s) => ({ ...s, chapters: s.chapters.filter((c) => c.uid !== chapterUid) }));

  const deleteSubject = (uid) => setSubjects((prev) => prev.filter((s) => s.uid !== uid));

  const handleRetrySubject = (subject) =>
    expandOne(subject.uid, subject.title, subjects.map((s) => s.title), runIdRef.current);


   const failures = subjects.filter((s) => s.status === 'error').map((s) => ({ key: s.uid, label: s.title, message: s.error }));
   const retryByUid = (uid) => {
     const subject = subjects.find((s) => s.uid === uid);
     if (subject) handleRetrySubject(subject);
   };
   const retryAllFailed = () => subjects.filter((s) => s.status === 'error').forEach(handleRetrySubject);
   const setAllOpen = (open) => setSubjects((prev) => prev.map((s) => (s.status === 'ready' ? { ...s, open } : s)));

  const handleConfirm = async () => {
    if (!savePayload) return;
    setError('');
    setStage(STAGE.SAVING);
    try {
      const result = await bulkInsertGoalSyllabus(goalId, savePayload);
      onSaved(result);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the roadmap.'));
      setStage(STAGE.PREVIEW);
    }
  };

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

  // ---------- Render ----------

  return (
    <div className="modal-backdrop">
        <div className={`modal-panel syllabus-modal ${stage === STAGE.PREVIEW || stage === STAGE.SAVING ? 'syllabus-modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        {stage === STAGE.LOADING && (
          <div className="syllabus-loading">
            <h2 className="text-stat syllabus-title"><Route size={20} /> Building your roadmap</h2>
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
                  : `${totalTopics} topics · ${formatDuration(plannedMinutes)} planned`}
              </p>
              {loadingCount > 0 && (
                <div className="syllabus-progress">
                  <div
                    className="syllabus-progress-fill"
                    style={{ width: `${subjects.length ? (readyCount / subjects.length) * 100 : 0}%` }}
                  />
                </div>
              )}
                <FailedBanner failures={failures} kind="subject" onRetry={retryByUid} onRemove={deleteSubject} onRetryAll={retryAllFailed} />
            </div>

            <LevelPills value={defaultLevel} onChange={setDefaultLevel} title="How well do you already know this material overall?" />

            {fitChoice && loadingCount === 0 && <FitModeToggle mode={mode} onChange={setMode} />}

            <PlanBanner view={view} status={estimate.status} error={estimate.error} onRetry={estimate.retry} waiting={loadingCount > 0} />

            {error && <p className="auth-error">{error}</p>}

               {readyCount > 1 && (
                <div className="rp-expand-tools">
                  <button type="button" onClick={() => setAllOpen(true)}>Expand all</button>
                  <button type="button" onClick={() => setAllOpen(false)}>Collapse all</button>
                </div>
              )}

            <div className={`syllabus-chapters ${estimate.fresh ? '' : 'rp-stale'}`}>
              {subjects.map((subject) => (
                <div key={subject.uid} className="syllabus-chapter">
                  <div className="syllabus-chapter-header">
                    <button type="button" className="syllabus-delete" onClick={() => toggleOpen(subject.uid)} aria-label="Expand or collapse">
                      {subject.open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>

                    <input
                      className="syllabus-chapter-title"
                      value={subject.title}
                      aria-label="Subject title"
                      onChange={(e) => patchSubject(subject.uid, (s) => ({ ...s, title: e.target.value }))}
                    />

                    {subject.status === 'ready' && (
                      <LevelSelect
                        value={subject.level}
                        inheritLabel="Same as overall"
                        ariaLabel={`How well you know ${subject.title}`}
                        onChange={(level) => patchSubject(subject.uid, (s) => ({ ...s, level }))}
                      />
                    )}

                    {subject.status === 'ready' && (
                      <span className="syllabus-chapter-total">{formatDuration(sumMinutes(topicsOf(subject), indexed, effectiveMode))}</span>
                    )}

                    <button type="button" className="syllabus-delete" title="Remove subject" aria-label="Remove subject" onClick={() => deleteSubject(subject.uid)}>
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
                      {subject.chapters.map((chapter) => (
                        <div key={chapter.uid}>
                          <div className="syllabus-chapter-header">
                            <input
                              className="syllabus-chapter-title"
                              value={chapter.title}
                              aria-label="Chapter title"
                              onChange={(e) => patchChapter(subject.uid, chapter.uid, (c) => ({ ...c, title: e.target.value }))}
                            />
                            <LevelSelect
                              value={chapter.level}
                              inheritLabel="Same as subject"
                              ariaLabel={`How well you know ${chapter.title}`}
                              onChange={(level) => patchChapter(subject.uid, chapter.uid, (c) => ({ ...c, level }))}
                            />
                            <span className="syllabus-chapter-total">{formatDuration(sumMinutes(chapter.subtopics, indexed, effectiveMode))}</span>
                            <button type="button" className="syllabus-delete" title="Remove chapter" aria-label="Remove chapter" onClick={() => removeChapter(subject.uid, chapter.uid)}>
                              <Trash2 size={14} />
                            </button>
                          </div>

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
                              onTitle={(title) => patchTopic(subject.uid, chapter.uid, topic.uid, { title })}
                              onMinutes={(minutes) => patchTopic(subject.uid, chapter.uid, topic.uid, { lockedMinutes: minutes })}
                              onUnlock={() => patchTopic(subject.uid, chapter.uid, topic.uid, { lockedMinutes: null })}
                              onKind={(kind) => patchTopic(subject.uid, chapter.uid, topic.uid, { kind })}
                              onPriority={(priority) => patchTopic(subject.uid, chapter.uid, topic.uid, { priority })}
                              onRemove={() => removeTopic(subject.uid, chapter.uid, topic.uid)}
                            />
                          ))}

                          <button
                            type="button"
                            className="syllabus-add-subtopic"
                            onClick={() => addTopic(subject.uid, chapter.uid)}
                            disabled={chapter.subtopics.length >= LIMITS.subtopics}
                          >
                            <Plus size={13} /> Add topic
                          </button>
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