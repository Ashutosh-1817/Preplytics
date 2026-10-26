
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Search, X } from 'lucide-react';
import { fetchFiles, deleteFile, retryExtraction, downloadFileToDisk, getErrorMessage } from '../services/files.api.js';
import { fetchGoals } from '../services/goals.api.js';
import { useAIDrawer } from '../context/AIDrawerContext.jsx';
import usePendingPoll from '../hooks/usePendingPoll.js';
import { formatFileSize } from '../utils/fileHelpers.js';
import FileUploader from '../components/files/FileUploader.jsx';
import FileCard from '../components/files/FileCard.jsx';
import FileViewer from '../components/files/FileViewer.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import './Files.css';
import Select from '../components/Select.jsx';

const FILTERS = [
  { key: 'all', label: 'All files' },
  { key: 'pdf', label: 'PDFs' },
  { key: 'image', label: 'Images' },
  { key: 'document', label: 'Documents' },
];

const SORTERS = {
  newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  name: (a, b) => a.fileName.localeCompare(b.fileName),
  size: (a, b) => b.fileSize - a.fileSize,
};

function Files() {
  const { context, setDrawerContext, clearDrawerContext, openDrawer } = useAIDrawer();

  const [files, setFiles] = useState(null);
  const [goals, setGoals] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [viewerId, setViewerId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionError, setActionError] = useState('');

  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  });

  // Leaving the page shouldn't leave the drawer pointed at a file
  useEffect(
    () => () => {
      if (contextRef.current.type === 'file') clearDrawerContext();
    },
    [clearDrawerContext]
  );

  const reload = useCallback(() => fetchFiles().then(setFiles).catch(() => {}), []);

  useEffect(() => {
    fetchFiles().then(setFiles).catch(() => setFiles([]));
    fetchGoals().then(setGoals).catch(() => setGoals([]));
  }, []);

  usePendingPoll(files, reload);

  const goalTitles = useMemo(() => new Map(goals.map((g) => [g._id, g.title])), [goals]);

  const counts = useMemo(() => {
    const c = { all: 0, pdf: 0, image: 0, document: 0 };
    (files || []).forEach((f) => {
      c.all += 1;
      c[f.fileType] += 1;
    });
    return c;
  }, [files]);

  const totalBytes = useMemo(() => (files || []).reduce((sum, f) => sum + f.fileSize, 0), [files]);

  const visible = useMemo(() => {
    if (!files) return null;
    const q = query.trim().toLowerCase();
    return files
      .filter((f) => (filter === 'all' || f.fileType === filter) && (!q || f.fileName.toLowerCase().includes(q)))
      .sort(SORTERS[sort]);
  }, [files, filter, query, sort]);

  const viewerFile = files?.find((f) => f._id === viewerId) || null;

  const handleUploaded = (file) =>
    setFiles((prev) => (prev ? [file, ...prev.filter((f) => f._id !== file._id)] : [file]));

  const handleOpen = async (file) => {
    setActionError('');
    if (file.fileType === 'document') {
      try {
        await downloadFileToDisk(file);
      } catch (err) {
        setActionError(getErrorMessage(err, 'Download failed.'));
      }
      return;
    }
    setViewerId(file._id);
  };

  const handleDownload = async (file) => {
    setActionError('');
    try {
      await downloadFileToDisk(file);
    } catch (err) {
      setActionError(getErrorMessage(err, 'Download failed.'));
    }
  };

  const handleAskAi = (file) => {
    setDrawerContext('file', file._id, `File: ${file.fileName}`, null);
    openDrawer();
  };

  const handleRetry = async (file) => {
    setActionError('');
    try {
      const updated = await retryExtraction(file._id);
      setFiles((prev) => prev?.map((f) => (f._id === updated._id ? updated : f)));
    } catch (err) {
      setActionError(getErrorMessage(err, 'Could not retry reading this file.'));
    }
  };

  const handleDelete = async () => {
    try {
      await deleteFile(deleteTarget._id);
      setFiles((prev) => prev?.filter((f) => f._id !== deleteTarget._id));
    } catch (err) {
      setActionError(getErrorMessage(err, 'Could not delete this file.'));
    } finally {
      setDeleteTarget(null);
    }
  };

  const hasFilters = filter !== 'all' || query.trim() !== '';

  return (
    <div className="files-page">
      <header className="files-header">
        <div className="files-title-badge"><FolderOpen size={24} /></div>
        <div>
          <h1 className="text-stat" style={{ fontSize: 'var(--text-2xl)' }}>Files</h1>
          <p className="files-sub">
            {files
              ? files.length === 0
                ? 'Your study material lives here'
                : `${files.length} ${files.length === 1 ? 'file' : 'files'} · ${formatFileSize(totalBytes)}`
              : 'Loading your library…'}
          </p>
        </div>
      </header>

      <FileUploader goals={goals} onUploaded={handleUploaded} />

      {actionError && <p className="auth-error">{actionError}</p>}

      <div className="files-toolbar">
        <div className="files-pills">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`files-pill ${filter === key ? 'files-pill-active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className="files-pill-count">{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className="files-tools">
          <div className="files-search">
            <Search size={15} />
            <input placeholder="Search files…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && (
              <button type="button" className="fx-icon-btn files-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>

          <Select className="ui-select--sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort files">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name</option>
            <option value="size">Largest</option>
          </Select>
        </div>
      </div>

      {visible === null && (
        <div className="files-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 290, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      )}

      {visible && visible.length === 0 && (
        <div className="files-empty">
          <div className="files-empty-icon">{hasFilters ? <Search size={26} /> : <FolderOpen size={26} />}</div>
          <h3>{hasFilters ? 'No files match' : 'No files yet'}</h3>
          <p>
            {hasFilters
              ? 'Try a different search or filter.'
              : 'Drop a PDF above to read it here and chat with the AI about it, page by page.'}
          </p>
          {hasFilters && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setFilter('all');
                setQuery('');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {visible && visible.length > 0 && (
        <div className="files-grid">
          {visible.map((file, i) => (
            <FileCard
              key={file._id}
              file={file}
              index={i}
              goalTitle={file.goalId ? goalTitles.get(file.goalId) : null}
              onOpen={handleOpen}
              onAskAi={handleAskAi}
              onDownload={handleDownload}
              onDelete={setDeleteTarget}
              onRetry={handleRetry}
            />
          ))}
        </div>
      )}

      {viewerFile && <FileViewer file={viewerFile} onClose={() => setViewerId(null)} />}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this file?"
          message={`"${deleteTarget.fileName}" will be permanently removed from your library and from storage.`}
          confirmLabel="Delete file"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default Files;