import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Check, Loader2, AlertCircle } from 'lucide-react';
import { timeAgo } from '../../utils/timeAgo.js';
import PrepNoteEditor from './PrepNoteEditor.jsx';
import useNoteAutosave from './useNoteAutosave.js';
import '../ConfirmDialog.css';

const DEFAULT_TITLES = new Set(['', 'Untitled note', 'Untitled Note']);

const deriveTitle = (text) => {
  const line = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return line.length > 60 ? `${line.slice(0, 60).trim()}…` : line;
};

function SaveChip({ status, onRetry }) {
  if (status === 'saving' || status === 'dirty') {
    return (
      <span className="ph-save ph-save-busy">
        <Loader2 size={13} className="ph-spin" /> {status === 'saving' ? 'Saving…' : 'Unsaved changes'}
      </span>
    );
  }
  if (status === 'error') {
    return (
      <button type="button" className="ph-save ph-save-error" onClick={onRetry}>
        <AlertCircle size={13} /> Couldn't save · Retry
      </button>
    );
  }
  if (status === 'conflict') {
    return (
      <span className="ph-save ph-save-error">
        <AlertCircle size={13} /> Needs your decision
      </span>
    );
  }
  return (
    <span className="ph-save ph-save-ok">
      <Check size={13} /> Saved
    </span>
  );
}

// `note` comes from the parent's list, which is patched on every keystroke so a
// remount (switching tabs and back) always shows the latest text.
function NotePane({ note, onPatch, onSaved, onDelete }) {
  const [title, setTitle] = useState(note.title);
  const [initialContent, setInitialContent] = useState(note.contentJSON);
  const [version, setVersion] = useState(0); // bumping it reloads the editor with fresh content
  const titleAutoRef = useRef(DEFAULT_TITLES.has(note.title));

  const { status, schedule, keepMine, loadLatest, retry } = useNoteAutosave({
    noteId: note._id,
    updatedAt: note.updatedAt,
    onSaved,
  });

  const handleContent = useCallback(
    ({ json, text }) => {
      const patch = { contentJSON: json, contentText: text };
      const payload = { contentJSON: json, contentText: text };

      // While the title is still the default, name the note after its first line
      if (titleAutoRef.current) {
        const derived = deriveTitle(text);
        if (derived) {
          patch.title = derived;
          payload.title = derived;
          setTitle(derived);
        }
      }

      onPatch(note._id, patch);
      schedule(payload);
    },
    [note._id, onPatch, schedule]
  );

  const handleTitle = (e) => {
    const value = e.target.value;
    setTitle(value);
    titleAutoRef.current = false;
    onPatch(note._id, { title: value });
    schedule({ title: value.trim() || 'Untitled note' });
  };

  const handleLoadLatest = async () => {
    try {
      const fresh = await loadLatest();
      onPatch(note._id, fresh);
      setTitle(fresh.title);
      setInitialContent(fresh.contentJSON);
      titleAutoRef.current = DEFAULT_TITLES.has(fresh.title);
      setVersion((v) => v + 1);
    } catch {
      // the dialog stays open so they can try again
    }
  };

  const words = useMemo(() => (note.contentText || '').trim().split(/\s+/).filter(Boolean).length, [note.contentText]);

  return (
    <div className="ph-note">
      <div className="ph-note-head">
        <input
          className="ph-note-title"
          value={title}
          maxLength={150}
          placeholder="Untitled note"
          aria-label="Note title"
          onChange={handleTitle}
          onBlur={() => {
            if (!title.trim()) setTitle('Untitled note');
          }}
        />
        <SaveChip status={status} onRetry={retry} />
        <button type="button" className="ph-icon-btn ph-icon-btn-danger" onClick={() => onDelete(note)} aria-label="Delete note" title="Delete note">
          <Trash2 size={15} />
        </button>
      </div>

      <PrepNoteEditor key={`${note._id}-${version}`} content={initialContent} onChange={handleContent} />

      <div className="ph-note-foot">
        <span>{words} {words === 1 ? 'word' : 'words'}</span>
        <span>Updated {timeAgo(note.updatedAt)}</span>
      </div>

      {status === 'conflict' &&
        createPortal(
          <div className="confirm-backdrop">
            <div className="confirm-panel" role="alertdialog" aria-modal="true" aria-label="Note changed elsewhere">
              <h3 className="confirm-title">This note changed somewhere else</h3>
              <p className="confirm-message">
                It was edited in another tab or on another device after you opened it. Load the latest version (your
                unsaved edits here are lost), or keep your version and overwrite it?
              </p>
              <div className="confirm-actions">
                <button type="button" className="btn btn-ghost" onClick={handleLoadLatest}>
                  Load the latest
                </button>
                <button type="button" className="btn btn-primary" onClick={keepMine}>
                  Keep my version
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default NotePane;