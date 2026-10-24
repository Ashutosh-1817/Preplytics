import { useEffect, useRef, useState } from 'react';
import { ListChecks, ChevronUp, ChevronDown, Plus, X, RefreshCw, AlertCircle } from 'lucide-react';
import { generateSubjects, saveSubjectList } from '../services/aiSyllabus.api.js';
import './SyllabusPreviewModal.css';

const STAGE = { LOADING: 'loading', FAILED: 'failed', REVIEW: 'review', SAVING: 'saving' };
const MAX_SUBJECTS = 12; // must match the backend validator

let uidCounter = 0;
const nextUid = () => `sj-${Date.now()}-${uidCounter++}`;

const errorMessage = (err, fallback) => {
  if (err.code === 'ECONNABORTED') return 'This took too long. Please try again.';
  return err.response?.data?.error?.message || fallback;
};

function GoalSubjectsModal({ goalId, goalTitle, onClose, onSaved }) {
  const [stage, setStage] = useState(STAGE.LOADING);
  const [subjects, setSubjects] = useState([]); // { uid, title, included }
  const [error, setError] = useState('');

  const aliveRef = useRef(true);
  const startedRef = useRef(false); // StrictMode mounts twice in dev: keep it to one AI call

  const generate = async () => {
    setError('');
    setStage(STAGE.LOADING);
    try {
      const result = await generateSubjects(goalId);
      if (!aliveRef.current) return;
      setSubjects(result.subjects.map((s) => ({ uid: nextUid(), title: s.title, included: true })));
      setStage(STAGE.REVIEW);
    } catch (err) {
      if (!aliveRef.current) return;
      setError(errorMessage(err, 'Could not generate subjects. Please try again.'));
      setStage(STAGE.FAILED);
    }
  };

  useEffect(() => {
    aliveRef.current = true;
    if (!startedRef.current) {
      startedRef.current = true;
      generate();
    }
    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Editing ----------

  const patch = (uid, change) => setSubjects((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...change } : s)));
  const remove = (uid) => setSubjects((prev) => prev.filter((s) => s.uid !== uid));
  const add = () =>
    setSubjects((prev) => [...prev, { uid: nextUid(), title: 'New subject', included: true }]);

  const move = (uid, dir) => {
    setSubjects((prev) => {
      const from = prev.findIndex((s) => s.uid === uid);
      const to = from + dir;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  const handleRegenerate = () => {
    if (!confirm('Replace this list with a fresh AI draft? Your edits will be lost. This uses one AI request.')) return;
    generate();
  };

  // ---------- Save ----------

  const included = subjects.filter((s) => s.included);
  const hasEmptyTitle = included.some((s) => !s.title.trim());
  const canSave = stage === STAGE.REVIEW && included.length > 0 && !hasEmptyTitle;

  const handleSave = async () => {
    setError('');
    setStage(STAGE.SAVING);
    try {
      const result = await saveSubjectList(
        goalId,
        included.map((s) => ({ title: s.title.trim() }))
      );
      onSaved(result);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the subjects.'));
      setStage(STAGE.REVIEW);
    }
  };

  return (
    <div className="modal-backdrop" onClick={stage === STAGE.FAILED ? onClose : undefined}>
      <div className="modal-panel syllabus-modal" onClick={(e) => e.stopPropagation()}>
        {stage === STAGE.LOADING && (
          <div className="syllabus-loading">
            <h2 className="text-stat syllabus-title">
              <ListChecks size={20} /> Finding your subjects
            </h2>
            <div className="skeleton" style={{ height: 16, width: '90%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 16, width: '80%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 16, width: '85%' }} />
            <p className="text-muted" style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
              Drafting the main subjects for “{goalTitle}”…
            </p>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ width: '100%', marginTop: 'var(--space-4)' }}>
              Cancel
            </button>
          </div>
        )}

        {stage === STAGE.FAILED && (
          <div>
            <h2 className="text-stat syllabus-title">
              <AlertCircle size={20} /> Couldn't build the list
            </h2>
            <p className="auth-error">{error}</p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>
                Close
              </button>
              <button type="button" className="btn btn-primary" onClick={generate} style={{ flex: 1 }}>
                <RefreshCw size={15} /> Try again
              </button>
            </div>
          </div>
        )}

        {(stage === STAGE.REVIEW || stage === STAGE.SAVING) && (
          <>
            <div className="syllabus-preview-header">
              <h2 className="text-stat syllabus-title">Review your subjects</h2>
              <p className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                {included.length} of {subjects.length} selected. Uncheck, rename, reorder or add subjects. You'll plan
                each subject's chapters and topics one at a time afterwards.
              </p>
            </div>

            {error && <p className="auth-error">{error}</p>}
            {hasEmptyTitle && <p className="syllabus-hint">Every selected subject needs a name.</p>}

            <div className="syllabus-chapters">
              <div className="syllabus-chapter">
                <div className="syllabus-subtopics">
                  {subjects.map((s, i) => (
                    <div key={s.uid} className={`syllabus-subtopic-row ${s.included ? '' : 'syllabus-subtopic-row-off'}`}>
                      <div className="syllabus-reorder">
                        <button type="button" aria-label="Move up" onClick={() => move(s.uid, -1)} disabled={i === 0}>
                          <ChevronUp size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label="Move down"
                          onClick={() => move(s.uid, 1)}
                          disabled={i === subjects.length - 1}
                        >
                          <ChevronDown size={13} />
                        </button>
                      </div>
                      <input
                        type="checkbox"
                        className="syllabus-check"
                        title={s.included ? 'Uncheck to leave this subject out' : 'Include this subject'}
                        checked={s.included}
                        onChange={() => patch(s.uid, { included: !s.included })}
                      />
                      <input
                        className="syllabus-subtopic-title"
                        value={s.title}
                        maxLength={100}
                        onChange={(e) => patch(s.uid, { title: e.target.value })}
                      />
                      <button type="button" className="syllabus-delete" title="Remove subject" onClick={() => remove(s.uid)}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={add}
                disabled={subjects.length >= MAX_SUBJECTS}
                style={{ width: '100%' }}
              >
                <Plus size={16} /> Add subject
              </button>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={stage === STAGE.SAVING}>
                Cancel
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleRegenerate} disabled={stage === STAGE.SAVING}>
                <RefreshCw size={15} /> Redo
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!canSave || stage === STAGE.SAVING}
                style={{ flex: 1 }}
              >
                {stage === STAGE.SAVING ? 'Saving…' : `Save ${included.length} subject${included.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default GoalSubjectsModal;