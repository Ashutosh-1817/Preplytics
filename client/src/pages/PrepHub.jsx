import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, PanelLeft, PanelRight, Maximize2, Minimize2, Upload, BookOpen, AlertCircle } from 'lucide-react';
import { fetchPrepHub } from '../services/prephub.api.js';
import { fetchNotes, createNote, updateNote, deleteNote } from '../services/notes.api.js';
import { fetchFiles, deleteFile, getErrorMessage } from '../services/files.api.js';
import { updateNode } from '../services/goals.api.js';
import useFileUploads from '../hooks/useFileUploads.js';
import usePendingPoll from '../hooks/usePendingPoll.js';
import { useAIDrawer } from '../context/AIDrawerContext.jsx';
import { markSessionHandoff } from '../utils/sessionHandoff.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import PrepHubTimer from '../components/prephub/PrepHubTimer.jsx';
import SourcesPanel from '../components/prephub/SourcesPanel.jsx';
import Workbench from '../components/prephub/Workbench.jsx';
import TopicPanel from '../components/prephub/TopicPanel.jsx';
import useWorkbench from '../components/prephub/useWorkbench.js';
import { NOTE_TEMPLATES } from '../components/prephub/noteTemplates.js';
import { readJson, writeJson } from '../components/prephub/prephubStorage.js';
import './PrepHub.css';
import './PrepHubPolish.css';

const LAYOUT_KEY = 'prephub:layout';
const DEFAULT_LAYOUT = { left: true, right: true, split: false };

function PrepHubInner({ nodeId }) {
  const navigate = useNavigate();
  const { setDrawerContext, clearDrawerContext, openDrawer } = useAIDrawer();

  const [boot, setBoot] = useState(null);
  const [bootState, setBootState] = useState('loading'); // loading | ready | notfound | error
  const [notes, setNotes] = useState(null);
  const [files, setFiles] = useState(null);
  const [layout, setLayout] = useState(() => ({ ...DEFAULT_LAYOUT, ...readJson(LAYOUT_KEY, {}) }));
  const [focusMode, setFocusMode] = useState(false);
  const [mobilePane, setMobilePane] = useState('work');
  const [actionError, setActionError] = useState('');
  const [deleteNoteTarget, setDeleteNoteTarget] = useState(null);
  const [deleteFileTarget, setDeleteFileTarget] = useState(null);
  const [dupPrompt, setDupPrompt] = useState(null);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef(null);

  // ---------- data ----------
  const loadBoot = useCallback(async () => {
    try {
      setBoot(await fetchPrepHub(nodeId));
      setBootState('ready');
    } catch (err) {
      if (err.response?.status === 404) setBootState('notfound');
      else setBootState((prev) => (prev === 'ready' ? prev : 'error')); // never blank a page that already loaded
    }
  }, [nodeId]);

  const loadNotes = useCallback(
    () => fetchNotes({ nodeId }).then(setNotes).catch(() => setNotes((prev) => prev ?? [])),
    [nodeId]
  );
  const loadFiles = useCallback(
    () => fetchFiles({ nodeId }).then(setFiles).catch(() => setFiles((prev) => prev ?? [])),
    [nodeId]
  );

  useEffect(() => {
    loadBoot();
    loadNotes();
    loadFiles();
  }, [loadBoot, loadNotes, loadFiles]);

  usePendingPoll(files, loadFiles);

  const uploads = useFileUploads({ onUploaded: loadFiles });
  const wb = useWorkbench(nodeId, notes, files);

  // ---------- the AI drawer points at this topic ----------
  const topicTitle = boot?.node.title;
  useEffect(() => {
    if (!topicTitle) return undefined;
    setDrawerContext('node', nodeId, `Topic: ${topicTitle}`);
    return () => clearDrawerContext();
  }, [nodeId, topicTitle, setDrawerContext, clearDrawerContext]);

  useEffect(() => {
    if (!topicTitle) return undefined;
    const previous = document.title;
    document.title = `${topicTitle} · PrepHub`;
    return () => {
      document.title = previous;
    };
  }, [topicTitle]);

  const handleAskAi = () => {
    const note = notes?.find((n) => n._id === wb.activeNote);
    const file = files?.find((f) => f._id === wb.activeFile);

    if (wb.focus === 'note' && note) setDrawerContext('note', note._id, `Note: ${note.title}`);
    else if (wb.focus === 'file' && file?.fileType === 'pdf' && file.extractionStatus === 'completed') {
      setDrawerContext('file', file._id, `File: ${file.fileName}`, null); // no page = the whole PDF
    } else setDrawerContext('node', nodeId, `Topic: ${topicTitle}`);

    openDrawer();
  };

  // ---------- layout ----------
  const updateLayout = (patch) =>
    setLayout((prev) => {
      const next = { ...prev, ...patch };
      writeJson(LAYOUT_KEY, next);
      return next;
    });

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'f' || e.key === 'F') setFocusMode((v) => !v);
      else if (e.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- notes ----------
  const patchNote = useCallback((id, changes) => {
    setNotes((prev) => prev?.map((n) => (n._id === id ? { ...n, ...changes } : n)) ?? prev);
  }, []);

  // Only the token: the list already holds the newest text from every keystroke
  const handleNoteSaved = useCallback((saved) => patchNote(saved._id, { updatedAt: saved.updatedAt }), [patchNote]);

  const handleCreateNote = async (templateId = 'blank') => {
    setActionError('');
    const template = NOTE_TEMPLATES.find((t) => t.id === templateId) ?? NOTE_TEMPLATES[0];
    try {
      const note = await createNote({
        nodeId,
        title: template.title,
        ...(template.doc ? { contentJSON: template.doc, contentText: template.text } : {}),
      });
      setNotes((prev) => [note, ...(prev ?? [])]);
      wb.openItem('note', note._id);
      setMobilePane('work');
    } catch (err) {
      setActionError(getErrorMessage(err, 'Could not create the note.'));
    }
  };

  
  useEffect(() => {
    const onSaved = (e) => {
      const saved = e.detail;
      if (!saved?._id || String(saved.nodeId) !== String(nodeId)) return;
      setNotes((prev) => [saved, ...(prev ?? []).filter((n) => n._id !== saved._id)]);
    };
    window.addEventListener('preplytics:note-saved', onSaved);
    return () => window.removeEventListener('preplytics:note-saved', onSaved);
  }, [nodeId]);

  const handleAttachNote = async (note) => {
    setActionError('');
    try {
      const linked = await updateNote(note._id, { nodeId });
      setNotes((prev) => [linked, ...(prev ?? []).filter((n) => n._id !== linked._id)]);
      wb.openItem('note', linked._id);
      setMobilePane('work');
    } catch (err) {
      setActionError(getErrorMessage(err, 'Could not link that note.'));
    }
  };

  const confirmDeleteNote = async () => {
    const target = deleteNoteTarget;
    try {
      await deleteNote(target._id);
      setNotes((prev) => prev?.filter((n) => n._id !== target._id) ?? prev);
      wb.closeTab('note', target._id);
      setDeleteNoteTarget(null);
    } catch (err) {
      setDeleteNoteTarget(null);
      setActionError(getErrorMessage(err, 'Could not delete the note.'));
    }
  };

  // ---------- files ----------
  const handleUploadFiles = (fileList) => {
    const incoming = Array.from(fileList);
    const known = new Set((files ?? []).map((f) => `${f.fileName}|${f.fileSize}`));
    const dups = incoming.filter((f) => known.has(`${f.name}|${f.size}`));
    const fresh = incoming.filter((f) => !known.has(`${f.name}|${f.size}`));

    if (fresh.length) uploads.addFiles(fresh, { nodeId });
    if (dups.length) setDupPrompt(dups); // "upload anyway?"
  };

  const uploadRef = useRef(handleUploadFiles);
  useEffect(() => {
    uploadRef.current = handleUploadFiles;
  });

  const confirmDeleteFile = async () => {
    const target = deleteFileTarget;
    try {
      await deleteFile(target._id);
      setFiles((prev) => prev?.filter((f) => f._id !== target._id) ?? prev);
      wb.closeTab('file', target._id);
      setDeleteFileTarget(null);
    } catch (err) {
      setDeleteFileTarget(null);
      setActionError(getErrorMessage(err, 'Could not delete the file.'));
    }
  };

  // Drop files anywhere on the page
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const enter = (e) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const leave = (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer.files.length) uploadRef.current(e.dataTransfer.files);
    };

    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  // ---------- navigation ----------
  const handleBack = () => {
    markSessionHandoff(nodeId); // a running timer keeps running in the roadmap
    navigate(`/goals/${boot.goal._id}?node=${nodeId}`);
  };

  const handleStatusChange = async (status) => {
    await updateNode(nodeId, { status });
    await loadBoot();
  };

  // ---------- states ----------
  if (bootState === 'loading') {
    return (
      <div className="ph">
        <div className="ph-top"><div className="skeleton" style={{ height: 44, width: '60%' }} /></div>
        <div className="ph-body">
          <div className="skeleton ph-panel" />
          <div className="skeleton ph-panel" />
          <div className="skeleton ph-panel" />
        </div>
      </div>
    );
  }

  if (bootState === 'notfound' || bootState === 'error') {
    return (
      <div className="ph-state-page surface">
        <AlertCircle size={28} />
        <h2>{bootState === 'notfound' ? 'Topic not found' : 'Could not open PrepHub'}</h2>
        <p className="ph-muted">
          {bootState === 'notfound'
            ? 'This topic may have been deleted, or it belongs to another account.'
            : 'Something went wrong while loading this topic.'}
        </p>
        <div className="ph-empty-actions">
          {bootState === 'error' && (
            <button type="button" className="ph-btn ph-btn-primary" onClick={loadBoot}>Try again</button>
          )}
          <Link to="/goals" className="ph-btn">Back to goals</Link>
        </div>
      </div>
    );
  }

  if (!boot.node.isActionable) {
    return (
      <div className="ph-state-page surface">
        <BookOpen size={28} />
        <h2>PrepHub is for individual topics</h2>
        <p className="ph-muted">“{boot.node.title}” is a group of topics. Open one of its topics from the roadmap to prepare it here.</p>
        <div className="ph-empty-actions">
          <Link to={`/goals/${boot.goal._id}`} className="ph-btn ph-btn-primary">Back to the roadmap</Link>
        </div>
      </div>
    );
  }

  const showLeft = layout.left && !focusMode;
  const showRight = layout.right && !focusMode;
  const crumbs = [boot.goal.title, ...boot.breadcrumb.map((b) => b.title)];

  return (
    <div className={`ph ${focusMode ? 'ph-focus' : ''}`}>
      <header className="ph-top">
        <button type="button" className="ph-btn ph-back" onClick={handleBack}>
          <ArrowLeft size={15} /> Roadmap
        </button>

        <div className="ph-heading">
          <p className="ph-crumbs">
            <span className="ph-dot" style={{ background: boot.goal.color || 'var(--signal)' }} />
            {crumbs.join('  ›  ')}
          </p>
          <h1 className="ph-title">{boot.node.title}</h1>
        </div>

        <div className="ph-top-right">
          <div className="ph-toggles">
            <button type="button" className={`ph-icon-btn ${layout.left ? 'ph-icon-btn-active' : ''}`} onClick={() => updateLayout({ left: !layout.left })} aria-pressed={layout.left} title="Sources panel">
              <PanelLeft size={16} />
            </button>
            <button type="button" className={`ph-icon-btn ${layout.right ? 'ph-icon-btn-active' : ''}`} onClick={() => updateLayout({ right: !layout.right })} aria-pressed={layout.right} title="Topic panel">
              <PanelRight size={16} />
            </button>
            <button type="button" className={`ph-icon-btn ${focusMode ? 'ph-icon-btn-active' : ''}`} onClick={() => setFocusMode((v) => !v)} aria-pressed={focusMode} title="Focus mode (F)">
              {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
          <PrepHubTimer nodeId={nodeId} nodeTitle={boot.node.title} onChanged={loadBoot} />
        </div>
      </header>

      {actionError && (
        <p className="ph-banner" role="alert">
          <AlertCircle size={14} /> {actionError}
          <button type="button" className="ph-link-btn" onClick={() => setActionError('')}>Dismiss</button>
        </p>
      )}

      <div
        className={`ph-body ${showLeft ? '' : 'ph-body-no-left'} ${showRight ? '' : 'ph-body-no-right'}`}
        data-pane={mobilePane}
      >
        <aside className="ph-panel ph-sources" data-pane-id="sources" aria-hidden={!showLeft}>
          <SourcesPanel
            notes={notes}
            files={files}
            activeNoteId={wb.focus === 'note' || layout.split ? wb.activeNote : null}
            activeFileId={wb.focus === 'file' || layout.split ? wb.activeFile : null}
            onOpenNote={(id) => {
              wb.openItem('note', id);
              setMobilePane('work');
            }}
            onOpenFile={(file) => {
              wb.openItem('file', file._id);
              setMobilePane('work');
            }}
            onCreateNote={handleCreateNote}
            onAttachNote={handleAttachNote}
            onAskDeleteNote={setDeleteNoteTarget}
            onAskDeleteFile={setDeleteFileTarget}
            uploads={uploads}
            onUploadFiles={handleUploadFiles}
            onReloadFiles={loadFiles}
            fileInputRef={fileInputRef}
          />
        </aside>

        <section className="ph-panel ph-work" data-pane-id="work">
          <Workbench
            notes={notes ?? []}
            files={files ?? []}
            wb={wb}
            split={layout.split}
            onToggleSplit={() => updateLayout({ split: !layout.split })}
            onPatchNote={patchNote}
            onSavedNote={handleNoteSaved}
            onDeleteNote={setDeleteNoteTarget}
            onCreateNote={handleCreateNote}
            onUpload={() => fileInputRef.current?.click()}
          />
        </section>

        <aside className="ph-panel ph-topic" data-pane-id="topic" aria-hidden={!showRight}>
          <TopicPanel
            boot={boot}
            onStatusChange={handleStatusChange}
            onNavigate={(id) => navigate(`/prephub/${id}`)}
            onAskAi={handleAskAi}
          />
        </aside>
      </div>

      <nav className="ph-mobile-tabs" aria-label="PrepHub sections">
        {[
          ['sources', 'Sources'],
          ['work', 'Workbench'],
          ['topic', 'Topic'],
        ].map(([id, label]) => (
          <button key={id} type="button" className={mobilePane === id ? 'ph-mobile-tab-active' : ''} onClick={() => setMobilePane(id)}>
            {label}
          </button>
        ))}
      </nav>

      {dragging && (
        <div className="ph-drop-overlay" aria-hidden="true">
          <Upload size={34} />
          <p>Drop files to add them to this topic</p>
        </div>
      )}

      {deleteNoteTarget && (
        <ConfirmDialog
          title="Delete this note?"
          message={`"${deleteNoteTarget.title || 'Untitled note'}" will be permanently removed.`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteNote}
          onCancel={() => setDeleteNoteTarget(null)}
        />
      )}

      {deleteFileTarget && (
        <ConfirmDialog
          title="Delete this file?"
          message={`"${deleteFileTarget.fileName}" will be permanently removed.`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteFile}
          onCancel={() => setDeleteFileTarget(null)}
        />
      )}

      {dupPrompt && (
        <ConfirmDialog
          title="Possible duplicates"
          message={`${dupPrompt.map((f) => `"${f.name}"`).join(', ')} ${dupPrompt.length === 1 ? 'looks' : 'look'} like ${dupPrompt.length === 1 ? 'a file' : 'files'} already in this topic. Upload anyway?`}
          confirmLabel="Upload anyway"
          danger={false}
          onConfirm={() => {
            uploads.addFiles(dupPrompt, { nodeId });
            setDupPrompt(null);
          }}
          onCancel={() => setDupPrompt(null)}
        />
      )}
    </div>
  );
}

// key = nodeId: moving to another topic remounts everything, so each topic
// starts clean and the old topic's timer is stopped and saved properly.
function PrepHub() {
  const { nodeId } = useParams();
  return <PrepHubInner key={nodeId} nodeId={nodeId} />;
}

export default PrepHub;