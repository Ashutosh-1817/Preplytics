

import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, Plus, FileText, FileImage, Trash2, Loader2, AlertCircle, FileCheck2 } from 'lucide-react';
import { fetchFiles, deleteFile, downloadFileToDisk, getErrorMessage } from '../../services/files.api.js';
import useFileUploads from '../../hooks/useFileUploads.js';
import usePendingPoll from '../../hooks/usePendingPoll.js';
import { ACCEPT_ATTR, formatFileSize } from '../../utils/fileHelpers.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import FileViewer from './FileViewer.jsx';
import './files.css';

function FileAttachments({ nodeId = null, noteId = null, title = 'Files', compact = false }) {
  const [files, setFiles] = useState(null);
  const [viewerId, setViewerId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const load = useCallback(
    () => fetchFiles(nodeId ? { nodeId } : { noteId }).then(setFiles).catch(() => setFiles((prev) => prev ?? [])),
    [nodeId, noteId]
  );

  useEffect(() => {
    setFiles(null);
    load();
  }, [load]);

  usePendingPoll(files, load);

  const { items, addFiles, cancel, dismiss } = useFileUploads({ onUploaded: load });

  if (!nodeId && !noteId) return null;

  const viewerFile = files?.find((f) => f._id === viewerId) || null;

  const handleOpen = async (file) => {
    setError('');
    if (file.fileType === 'document') {
      try {
        await downloadFileToDisk(file);
      } catch (err) {
        setError(getErrorMessage(err, 'Download failed.'));
      }
      return;
    }
    setViewerId(file._id);
  };

  const handleDelete = async () => {
    try {
      await deleteFile(deleteTarget._id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteTarget(null);
      setError(getErrorMessage(err, 'Could not delete this file.'));
    }
  };

  return (
    <div className={`fa ${compact ? 'fa-compact' : ''}`}>
      <div className="fa-header">
        <span className="fa-title"><Paperclip size={13} /> {title}{files?.length ? ` (${files.length})` : ''}</span>
        <button type="button" className="fa-add" onClick={() => inputRef.current?.click()}>
          <Plus size={13} /> Attach
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files, nodeId ? { nodeId } : { noteId });
            e.target.value = '';
          }}
        />
      </div>

      {error && <p className="fa-error"><AlertCircle size={13} /> {error}</p>}

      <div className="fa-list">
        {items.map((item) => (
          <div key={item.id} className={`fa-item fa-uploading ${item.status === 'error' ? 'fa-item-error' : ''}`}>
            {item.status === 'error' ? <AlertCircle size={15} /> : <Loader2 size={15} className="spin" />}
            <span className="fa-name">{item.status === 'error' ? item.error : `${item.name} · ${item.progress}%`}</span>
            <button
              type="button"
              className="fx-icon-btn"
              aria-label="Dismiss"
              onClick={() => (item.status === 'error' ? dismiss(item.id) : cancel(item.id))}
            >
              ×
            </button>
          </div>
        ))}

        {files?.map((f) => (
          <div key={f._id} className="fa-item">
            <button type="button" className="fa-open" onClick={() => handleOpen(f)}>
              <span className="fa-icon">{f.fileType === 'image' ? <FileImage size={15} /> : <FileText size={15} />}</span>
              <span className="fa-name">{f.fileName}</span>
              <span className="fa-meta">{formatFileSize(f.fileSize)}</span>
              {f.fileType === 'pdf' && f.extractionStatus === 'completed' && (
                <FileCheck2 size={12} className="fa-ai" title="Ready for AI" />
              )}
              {f.extractionStatus === 'pending' && <Loader2 size={12} className="spin" title="Reading text…" />}
            </button>
            <button
              type="button"
              className="fx-icon-btn fx-icon-btn-danger"
              aria-label="Delete file"
              onClick={() => setDeleteTarget(f)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {files && files.length === 0 && items.length === 0 && (
          <p className="fa-empty">Nothing attached yet.</p>
        )}
      </div>

      {viewerFile && <FileViewer file={viewerFile} onClose={() => setViewerId(null)} />}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this file?"
          message={`"${deleteTarget.fileName}" will be permanently removed.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default FileAttachments;