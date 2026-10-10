import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchNotes, createNote, updateNote, deleteNote } from '../services/notes.api.js';
import NoteEditor from '../components/NoteEditor.jsx';
import './Notes.css';
import { useAIDrawer } from '../context/AIDrawerContext.jsx';
import FileAttachments from '../components/files/FileAttachments.jsx';


const deriveTitleFromText = (text) => {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';

  const firstWord = cleaned.split(' ')[0];
  return firstWord.length > 30 ? firstWord.slice(0, 30).trim() + '…' : firstWord;
};

function Notes() {
  const [notes, setNotes] = useState(null);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [title, setTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const { setDrawerContext, clearDrawerContext } = useAIDrawer();

  // Tracks whether the CURRENT note's title is still auto-derived from
  // content, vs. having been manually set by the user. This is the
  // actual fix: we no longer compare title text to decide whether to
  // keep auto-naming — a dedicated flag can't accidentally "break" after
  // the first keystroke the way a string comparison did.
  const isTitleAutoRef = useRef(true);

  const pendingRef = useRef(null);

  const loadNotes = () => fetchNotes().then(setNotes).catch(() => setNotes([]));

  useEffect(() => {
    loadNotes();
  }, []);

  const activeNote = notes?.find((n) => n._id === activeNoteId) || null;

  const patchLocalNote = useCallback((noteId, payload) => {
    setNotes((prev) => prev?.map((n) => (n._id === noteId ? { ...n, ...payload } : n)) ?? prev);
  }, []);

  const scheduleSave = useCallback(
    (noteId, payload) => {
      if (pendingRef.current?.timeoutId) clearTimeout(pendingRef.current.timeoutId);

      const merged = {
        ...(pendingRef.current?.noteId === noteId ? pendingRef.current.payload : {}),
        ...payload,
      };

      patchLocalNote(noteId, payload);

      const timeoutId = setTimeout(async () => {
        setSaveStatus('saving');
        await updateNote(noteId, merged);
        pendingRef.current = null;
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(''), 1500);
      }, 1200);

      pendingRef.current = { noteId, payload: merged, timeoutId };
    },
    [patchLocalNote]
  );

  const flushPending = useCallback(async () => {
    if (!pendingRef.current) return;
    const { noteId, payload, timeoutId } = pendingRef.current;
    clearTimeout(timeoutId);
    pendingRef.current = null;
    await updateNote(noteId, payload);
  }, []);

  useEffect(() => {
    return () => {
      flushPending();
    };
  }, [flushPending]);

  const handleSelectNote = async (note) => {
    await flushPending();
    setActiveNoteId(note._id);
    setTitle(note.title);
    setDrawerContext('note', note._id, `Note: ${note.title}`);
    // A note we're newly opening is only in "auto" mode if it still has
    // the default title — otherwise the user (or a prior session) set
    // something real, and we must never overwrite that automatically.
    isTitleAutoRef.current = !note.title || note.title === 'Untitled Note';
  };

  const handleCreateNote = async () => {
    await flushPending();
    const note = await createNote({ title: 'Untitled Note' });
    await loadNotes();
    setActiveNoteId(note._id);
    setTitle(note.title);
    isTitleAutoRef.current = true;
  };

 

  const handleDeleteNote = async (noteId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this note?')) return;
    await deleteNote(noteId);
    if (activeNoteId === noteId) {
      setActiveNoteId(null);
      clearDrawerContext();
    }
    loadNotes();
  };

  const handleContentChange = useCallback(
    ({ json, text }) => {
      if (!activeNoteId) return;

      const payload = { contentJSON: json, contentText: text };

      if (isTitleAutoRef.current) {
        const derived = deriveTitleFromText(text);
        // Only update the title when there's actually something to
        // derive — if content is cleared back to empty, we leave the
        // existing (auto) title alone rather than blanking it, but
        // isTitleAutoRef stays true, so new typing will re-derive a
        // fresh title from whatever the user writes next.
        if (derived) {
          payload.title = derived;
          setTitle(derived);
        }
      }

      scheduleSave(activeNoteId, payload);
    },
    [activeNoteId, scheduleSave]
  );

  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    // Any manual edit — even clearing it back to empty — permanently
    // turns off auto-naming for this note. The user has taken over.
    isTitleAutoRef.current = false;
    if (activeNoteId) scheduleSave(activeNoteId, { title: newTitle });
  };

  return (
    <div className="notes-page">
      <div className="notes-sidebar surface">
        <button className="btn btn-primary" style={{ width: '100%', marginBottom: 'var(--space-3)' }} onClick={handleCreateNote}>
          + New note
        </button>

        {notes === null && <div className="skeleton" style={{ height: 40, marginBottom: 8 }} />}
        {notes?.length === 0 && <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>No notes yet.</p>}

        <div className="notes-list">
          {notes?.map((note) => (
            <div
              key={note._id}
              className={`notes-list-item ${activeNoteId === note._id ? 'notes-list-item-active' : ''}`}
              onClick={() => handleSelectNote(note)}
            >
              <span className="notes-list-color" style={{ background: note.color }} />
              <span className="notes-list-title">{note.title}</span>
              <button className="notes-list-delete" onClick={(e) => handleDeleteNote(note._id, e)}>✕</button>
            </div>
          ))}
        </div>
      </div>

      <div className="notes-main surface">
        {activeNote ? (
          <>
            <div className="notes-main-header">
              <input
                className="notes-title-input"
                value={title}
                onChange={handleTitleChange}
                placeholder="Untitled Note"
              />
              <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : ''}
              </span>
            </div>
            <FileAttachments key={`att-${activeNote._id}`} noteId={activeNote._id} title="Attachments" compact />
            <NoteEditor key={activeNote._id} content={activeNote.contentJSON} onChange={handleContentChange} />
          </>
        ) : (
          <div className="notes-empty">
            <p className="text-muted">Select a note or create a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Notes;