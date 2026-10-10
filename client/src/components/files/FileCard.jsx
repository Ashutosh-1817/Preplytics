

import { useState } from 'react';
import {
  FileText, FileImage, Eye, Download, Trash2, Sparkles, Target, Loader2, AlertCircle, RefreshCw,
} from 'lucide-react';
import {
  formatFileSize, formatShortDate, thumbnailUrl, isStalePending, describeExtractionFailure,
} from '../../utils/fileHelpers.js';
import './files.css';

const TYPE_META = {
  pdf: { Icon: FileText, label: 'PDF', tone: 'rose' },
  image: { Icon: FileImage, label: 'Image', tone: 'cyan' },
  document: { Icon: FileText, label: 'Document', tone: 'indigo' },
};

function AiStatus({ file, onRetry }) {
  if (file.fileType === 'image') return null;

  if (file.fileType === 'document') {
    return <span className="file-chip">Stored · download only</span>;
  }

  if (file.extractionStatus === 'completed') {
    return (
      <span className="file-chip file-chip-ok">
        <Sparkles size={12} /> Ready for AI · {file.pageCount} {file.pageCount === 1 ? 'page' : 'pages'}
      </span>
    );
  }

  if (file.extractionStatus === 'pending') {
    if (isStalePending(file)) {
      return (
        <div className="file-ai-fail">
          <span className="file-chip file-chip-warn"><AlertCircle size={12} /> Taking longer than expected</span>
          <button type="button" className="file-retry" onClick={() => onRetry(file)}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      );
    }
    return (
      <span className="file-chip file-chip-busy">
        <Loader2 size={12} className="spin" /> Reading text…
      </span>
    );
  }

  const info = describeExtractionFailure(file.extractionError);
  return (
    <div className="file-ai-fail">
      <span className="file-chip file-chip-err"><AlertCircle size={12} /> {info.short}</span>
      <p className="file-hint">{info.hint}</p>
      {info.retryable && (
        <button type="button" className="file-retry" onClick={() => onRetry(file)}>
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  );
}

function FileCard({ file, goalTitle, index = 0, onOpen, onAskAi, onDownload, onDelete, onRetry }) {
  const [imgFailed, setImgFailed] = useState(false);
  const meta = TYPE_META[file.fileType] || TYPE_META.document;
  const ext = (file.fileName.split('.').pop() || meta.label).slice(0, 5).toUpperCase();
  const canAskAi = file.fileType === 'pdf' && file.extractionStatus === 'completed';

  return (
    <article
      className={`file-card file-card-${meta.tone}`}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <button
        type="button"
        className="file-card-preview"
        onClick={() => onOpen(file)}
        aria-label={`${file.fileType === 'document' ? 'Download' : 'Open'} ${file.fileName}`}
      >
        {file.fileType === 'image' && !imgFailed ? (
          <img
            className="file-card-img"
            src={thumbnailUrl(file.url)}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="file-card-tile">
            <meta.Icon size={36} strokeWidth={1.5} />
            <span className="file-card-ext">{ext}</span>
          </div>
        )}
        <span className="file-card-open-hint">
          {file.fileType === 'document' ? <Download size={16} /> : <Eye size={16} />}
          {file.fileType === 'document' ? 'Download' : 'Open'}
        </span>
      </button>

      <div className="file-card-body">
        <h3 className="file-card-name" title={file.fileName}>{file.fileName}</h3>

        <div className="file-card-meta">
          <span>{formatFileSize(file.fileSize)}</span>
          <span className="file-meta-dot" />
          <span>{formatShortDate(file.createdAt)}</span>
        </div>

        {goalTitle && (
          <span className="file-chip file-chip-goal" title={goalTitle}>
            <Target size={12} /> {goalTitle}
          </span>
        )}

        <AiStatus file={file} onRetry={onRetry} />
      </div>

      <div className="file-card-actions">
        {canAskAi && (
          <button type="button" className="fx-icon-btn fx-icon-btn-ai" title="Ask AI about this file" onClick={() => onAskAi(file)}>
            <Sparkles size={16} />
          </button>
        )}
        <button type="button" className="fx-icon-btn" title="Download" onClick={() => onDownload(file)}>
          <Download size={16} />
        </button>
        <button type="button" className="fx-icon-btn fx-icon-btn-danger" title="Delete" onClick={() => onDelete(file)}>
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

export default FileCard;