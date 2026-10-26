import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FilePlus, Upload, Search, StickyNote, FileText, FileImage, Trash2, Loader2, AlertCircle,
  ChevronDown, Link2, RefreshCw,
} from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog.jsx';
import { fetchNotes } from '../../services/notes.api.js';
import { downloadFileToDisk, retryExtraction, getErrorMessage } from '../../services/files.api.js';
import { ACCEPT_ATTR, formatFileSize, describeExtractionFailure, isStalePending } from '../../utils/fileHelpers.js';
import { timeAgo } from '../../utils/timeAgo.js';
import { NOTE_TEMPLATES } from './noteTemplates.js';

function useClickOutside(ref, onOutside, active) {
  useEffect(() => {
    if (!active) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onOutside();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onOutside, active]);
}

function AttachNoteMenu({ currentIds, onPick, onClose }) {
  const [notes, setNotes] = useState(null);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useClickOutside(ref, onClose, true);

  // Every note you own, newest first, except the ones already in this topic
  useEffect(() => {
    fetchNotes()
      .then((all) => setNotes(all.filter((n) => !currentIds.has(n._id))))
      .catch(() => setNotes([]));
  }, [currentIds]);

  const term = q.trim().toLowerCase();
  const shown = (notes ?? []).filter((n) => !term || (n.title || '').toLowerCase().includes(term));

  return (
    <div className="ph-menu ph-menu-wide ph-menu-notes" ref={ref}>
      <p className="ph-menu-title">Add a note to this topic{notes ? ` · ${notes.length}` : ''}</p>
      <div className="ph-menu-search">
        <Search size={13} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all your notes" aria-label="Search your notes" />
      </div>
      <div className="ph-menu-scroll">
        {!notes && <p className="ph-menu-empty"><Loader2 size={14} className="ph-spin" /> Loading…</p>}
        {notes && notes.length === 0 && <p className="ph-menu-empty">Every note you own is already in this topic.</p>}
        {notes && notes.length > 0 && shown.length === 0 && <p className="ph-menu-empty">No notes match “{q}”.</p>}
        {shown.map((n) => (
          <button key={n._id} type="button" className="ph-menu-item" onClick={() => onPick(n)}>
            <StickyNote size={14} />
            <span>{n.title || 'Untitled note'}</span>
            {n.nodeId ? <b className="ph-menu-tag" title="Adding it here moves it from its current topic">Other topic</b> : null}
            <em>{timeAgo(n.updatedAt)}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function SourcesPanel({
  notes, files, activeNoteId, activeFileId,
  onOpenNote, onOpenFile, onCreateNote, onAttachNote, onAskDeleteNote, onAskDeleteFile,
  uploads, onUploadFiles, onReloadFiles, fileInputRef,
}) {
  const [query, setQuery] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [error, setError] = useState('');
  const templatesRef = useRef(null);
  useClickOutside(templatesRef, () => setTemplatesOpen(false), templatesOpen);

  const q = query.trim().toLowerCase();
  const currentIds = useMemo(() => new Set((notes ?? []).map((n) => n._id)), [notes]);

  const visibleNotes = useMemo(
    () =>
      [...(notes ?? [])]
        .filter((n) => !q || (n.title || '').toLowerCase().includes(q) || (n.contentText || '').toLowerCase().includes(q))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [notes, q]
  );

  const visibleFiles = useMemo(
    () => (files ?? []).filter((f) => !q || f.fileName.toLowerCase().includes(q)),
    [files, q]
  );

  const handleOpenFile = async (file) => {
    setError('');
    if (file.fileType === 'document') {
      try {
        await downloadFileToDisk(file);
      } catch (err) {
        setError(getErrorMessage(err, 'Download failed.'));
      }
      return;
    }
    onOpenFile(file);
  };

  const handleRetry = async (file, e) => {
    e.stopPropagation();
    try {
      await retryExtraction(file._id);
      onReloadFiles();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not retry.'));
    }
  };

  const fileStatus = (f) => {
    if (f.fileType !== 'pdf') return null;
    if (f.extractionStatus === 'pending' && !isStalePending(f)) {
      return <span className="ph-chip ph-chip-busy"><Loader2 size={11} className="ph-spin" /> Reading…</span>;
    }
    if (f.extractionStatus === 'completed') return null;

    const info =
      f.extractionStatus === 'pending'
        ? { short: 'Taking long', hint: 'Reading is taking longer than expected.', retryable: true }
        : describeExtractionFailure(f.extractionError);
    return (
      <span className="ph-chip ph-chip-warn" title={info.hint}>
        <AlertCircle size={11} /> {info.short}
        {info.retryable && (
          <button type="button" className="ph-chip-retry" onClick={(e) => handleRetry(f, e)} aria-label="Retry reading this file">
            <RefreshCw size={10} />
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="ph-sources-inner">
      <div className="ph-search">
        <Search size={14} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this topic's sources" aria-label="Search sources" />
      </div>

      {error && <p className="ph-error"><AlertCircle size={13} /> {error}</p>}

      {/* ---------- notes ---------- */}
      <section className="ph-section">
        <div className="ph-section-head">
          <h4>Notes{notes?.length ? ` (${notes.length})` : ''}</h4>
          <div className="ph-section-actions">
            <div className="ph-menu-wrap" ref={templatesRef}>
              <button type="button" className="ph-mini-btn" onClick={() => setTemplatesOpen((o) => !o)} aria-expanded={templatesOpen}>
                <FilePlus size={13} /> New <ChevronDown size={12} />
              </button>
              {templatesOpen && (
                <div className="ph-menu">
                  {NOTE_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="ph-menu-item"
                      onClick={() => {
                        setTemplatesOpen(false);
                        onCreateNote(t.id);
                      }}
                    >
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="ph-menu-wrap">
              <button type="button" className="ph-mini-btn" onClick={() => setAttachOpen((o) => !o)} title="Link an existing note" aria-label="Link an existing note">
                <Link2 size={13} />
              </button>
              {attachOpen && (
                <AttachNoteMenu
                  currentIds={currentIds}
                  onClose={() => setAttachOpen(false)}
                  onPick={(note) => {
                    setAttachOpen(false);
                    onAttachNote(note);
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {!notes && <div className="skeleton" style={{ height: 44 }} />}
        {notes && visibleNotes.length === 0 && (
          <p className="ph-empty-line">{q ? 'No notes match.' : 'No notes yet. Create one to start writing.'}</p>
        )}
        <ul className="ph-list">
          {visibleNotes.map((n) => (
            <li key={n._id} className={`ph-row ${n._id === activeNoteId ? 'ph-row-active' : ''}`}>
              <button type="button" className="ph-row-main" onClick={() => onOpenNote(n._id)}>
                <StickyNote size={15} />
                <span className="ph-row-text">
                  <strong>{n.title || 'Untitled note'}</strong>
                  <em>{timeAgo(n.updatedAt)}</em>
                </span>
              </button>
              <button type="button" className="ph-icon-btn ph-icon-btn-danger ph-row-del" onClick={() => onAskDeleteNote(n)} aria-label={`Delete ${n.title}`}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- files ---------- */}
      <section className="ph-section">
        <div className="ph-section-head">
          <h4>Files{files?.length ? ` (${files.length})` : ''}</h4>
          <div className="ph-section-actions">
            <button type="button" className="ph-mini-btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={13} /> Upload
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onUploadFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {uploads.items.map((item) => (
          <div key={item.id} className={`ph-upload ${item.status === 'error' ? 'ph-upload-error' : ''}`}>
            {item.status === 'error' ? <AlertCircle size={14} /> : <Loader2 size={14} className="ph-spin" />}
            <span className="ph-upload-name">{item.status === 'error' ? item.error : `${item.name} · ${item.progress}%`}</span>
            <button
              type="button"
              className="ph-icon-btn"
              aria-label="Dismiss"
              onClick={() => (item.status === 'error' ? uploads.dismiss(item.id) : uploads.cancel(item.id))}
            >
              ×
            </button>
            {item.status !== 'error' && <span className="ph-upload-bar" style={{ width: `${item.progress}%` }} />}
          </div>
        ))}

        {!files && <div className="skeleton" style={{ height: 44 }} />}
        {files && visibleFiles.length === 0 && uploads.items.length === 0 && (
          <button type="button" className="ph-drop" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} />
            <span>{q ? 'No files match.' : 'Drop PDFs or images here, or click to upload'}</span>
          </button>
        )}
        <ul className="ph-list">
          {visibleFiles.map((f) => (
            <li key={f._id} className={`ph-row ${f._id === activeFileId ? 'ph-row-active' : ''}`}>
              <button type="button" className="ph-row-main" onClick={() => handleOpenFile(f)}>
                {f.fileType === 'image' ? <FileImage size={15} /> : <FileText size={15} />}
                <span className="ph-row-text">
                  <strong>{f.fileName}</strong>
                  <em>
                    {formatFileSize(f.fileSize)}
                    {f.fileType === 'pdf' && f.pageCount ? ` · ${f.pageCount} pages` : ''}
                    {f.fileType === 'document' ? ' · download' : ''}
                  </em>
                  {fileStatus(f)}
                </span>
              </button>
              <button type="button" className="ph-icon-btn ph-icon-btn-danger ph-row-del" onClick={() => onAskDeleteFile(f)} aria-label={`Delete ${f.fileName}`}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default SourcesPanel;