

import { useRef, useState } from 'react';
import { UploadCloud, X, CheckCircle2, AlertCircle, Loader2, Target } from 'lucide-react';
import useFileUploads from '../../hooks/useFileUploads.js';
import { ACCEPT_ATTR, formatFileSize } from '../../utils/fileHelpers.js';
import './files.css';
import Select from '../Select.jsx';

const statusLabel = (item) => {
  if (item.status === 'queued') return 'Waiting…';
  if (item.status === 'done') return 'Uploaded';
  if (item.progress >= 100) return 'Finishing…';
  return `${item.progress}%`;
};

function FileUploader({ goals = [], onUploaded }) {
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [linkGoalId, setLinkGoalId] = useState('');
  const { items, addFiles, cancel, dismiss } = useFileUploads({ onUploaded });

  const start = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    addFiles(fileList, { goalId: linkGoalId || null });
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    start(e.dataTransfer.files);
  };

  return (
    <section className="uploader">
      {/* Kept outside the clickable zone so its programmatic click can't re-trigger the zone */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        hidden
        onChange={(e) => {
          start(e.target.files);
          e.target.value = '';
        }}
      />

      <div
        className={`dropzone ${isDragging ? 'dropzone-active' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={handleDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="dropzone-icon"><UploadCloud size={28} /></div>

        <div className="dropzone-text">
          <strong>{isDragging ? 'Drop to upload' : 'Drag & drop files here'}</strong>
          <span>or <u>browse</u> · PDF, images, Word, text · up to 10 MB each</span>
        </div>

        {goals.length > 0 && (
          <label className="dropzone-link" onClick={(e) => e.stopPropagation()}>
            <Target size={14} />
            <Select variant="link" aria-label="Link to a goal" value={linkGoalId} onChange={(e) => setLinkGoalId(e.target.value)}>
              <option value="">Don't link to a goal</option>
              {goals.map((g) => (
                <option key={g._id} value={g._id}>{g.title}</option>
              ))}
            </Select>
          </label>
        )}
      </div>

      {items.length > 0 && (
        <ul className="upload-queue">
          {items.map((item) => (
            <li key={item.id} className={`upload-item upload-item-${item.status}`}>
              <div className="upload-item-icon">
                {item.status === 'done' && <CheckCircle2 size={18} />}
                {item.status === 'error' && <AlertCircle size={18} />}
                {(item.status === 'uploading' || item.status === 'queued') && <Loader2 size={18} className="spin" />}
              </div>

              <div className="upload-item-main">
                <div className="upload-item-top">
                  <span className="upload-item-name" title={item.name}>{item.name}</span>
                  <span className="upload-item-size">
                    {item.status === 'error' ? formatFileSize(item.size) : `${formatFileSize(item.size)} · ${statusLabel(item)}`}
                  </span>
                </div>

                {item.status === 'error' ? (
                  <span className="upload-item-error">{item.error}</span>
                ) : (
                  <div className="upload-bar">
                    <div className="upload-bar-fill" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
              </div>

              <button
                type="button"
                className="fx-icon-btn"
                aria-label={item.status === 'error' || item.status === 'done' ? 'Dismiss' : 'Cancel upload'}
                onClick={() => (item.status === 'error' || item.status === 'done' ? dismiss(item.id) : cancel(item.id))}
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default FileUploader;