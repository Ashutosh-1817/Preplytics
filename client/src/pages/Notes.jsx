import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Plus, Search, Trash2, FileText, PenLine } from 'lucide-react';
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

const timeAgo = (value) => {
  if (!value) return '';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

function Notes() {
  const [notes, setNotes] = useState(null);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [title, setTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [query, setQuery] = useState('');
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

  const visibleNotes = useMemo(() => {
    if (!notes) return null;
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => `${n.title} ${n.contentText || ''}`.toLowerCase().includes(q));
  }, [notes, query]);

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
        <div className="notes-side-head">
          <span className="notes-side-title">
            Notes
            {notes && notes.length > 0 && <span className="notes-count">{notes.length}</span>}
          </span>
          <button className="btn btn-primary notes-new" onClick={handleCreateNote}>
            <Plus size={15} /> New
          </button>
        </div>

        <label className="notes-search">
          <Search size={15} />
          <input
            type="search"
            placeholder="Search notes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search notes"
          />
        </label>

        {notes === null && <div className="skeleton" style={{ height: 56, marginBottom: 8 }} />}
        {notes?.length === 0 && <p className="notes-none">No notes yet. Create your first one.</p>}
        {notes?.length > 0 && visibleNotes?.length === 0 && <p className="notes-none">Nothing matches “{query}”.</p>}

        <div className="notes-list">
          {visibleNotes?.map((note) => (
            <div
              key={note._id}
              className={`notes-list-item ${activeNoteId === note._id ? 'notes-list-item-active' : ''}`}
              onClick={() => handleSelectNote(note)}
            >
              <span className="notes-list-color" style={{ background: note.color }} />
              <div className="notes-list-body">
                <span className="notes-list-title">{note.title || 'Untitled Note'}</span>
                {note.contentText && <span className="notes-list-snippet">{note.contentText}</span>}
                <span className="notes-list-time">{timeAgo(note.updatedAt)}</span>
              </div>
              <button className="notes-list-delete" onClick={(e) => handleDeleteNote(note._id, e)} aria-label="Delete note" title="Delete note">
                <Trash2 size={14} />
              </button>
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
              <span className={`notes-status ${saveStatus === 'saved' ? 'is-saved' : ''}`}>
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : <><PenLine size={13} /> Auto-saves</>}
              </span>
            </div>
            <FileAttachments key={`att-${activeNote._id}`} noteId={activeNote._id} title="Attachments" compact />
            <NoteEditor key={activeNote._id} content={activeNote.contentJSON} onChange={handleContentChange} />
          </>
        ) : (
          <div className="notes-empty">
            <span className="notes-empty-icon"><FileText size={26} /></span>
            <strong>Select a note or start a new one</strong>
            <span className="text-muted">Notes save as you type and PrepBot can read them when you ask.</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default Notes;