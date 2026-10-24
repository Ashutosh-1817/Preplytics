

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, FileText, Upload, Loader2, AlertCircle, MessageSquareText, X } from 'lucide-react';
import { fetchFiles, fetchFile, uploadFile, getErrorMessage } from '../../services/files.api.js';
import { describeExtractionFailure, formatFileSize, validateFileForUpload } from '../../utils/fileHelpers.js';
import './files.css';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function AttachFilePopover({ onSelect, onClose }) {
  const [files, setFiles] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null); // { name, progress, phase }
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const cancelledRef = useRef(false);

  const loadFiles = () => fetchFiles({ type: 'pdf' }).then(setFiles).catch(() => setFiles([]));

  useEffect(() => {
    cancelledRef.current = false;
    loadFiles();

    const onDown = (e) => {
      if (e.target.closest?.('[data-attach-toggle]')) return; // the toggle button handles itself
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);

    return () => {
      cancelledRef.current = true;
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (files || []).filter((f) => !q || f.fileName.toLowerCase().includes(q));
  }, [files, query]);

  const handleUpload = async (file) => {
    setError('');

    const problem = validateFileForUpload(file);
    if (problem) return setError(problem);
    if (file.type !== 'application/pdf') {
      return setError('The AI can read PDFs for now. Upload other files from the Files page.');
    }

    try {
      setBusy({ name: file.name, progress: 0, phase: 'uploading' });
      const created = await uploadFile(file, {
        onProgress: (progress) => setBusy((b) => (b ? { ...b, progress } : b)),
      });
      setBusy((b) => (b ? { ...b, phase: 'reading', progress: 100 } : b));

      let current = created;
      for (let i = 0; i < 30 && current.extractionStatus === 'pending'; i++) {
        await sleep(2000);
        if (cancelledRef.current) return;
        current = await fetchFile(created._id);
      }
      if (cancelledRef.current) return;

      if (current.extractionStatus === 'completed') {
        onSelect(current);
        return;
      }

      const info = describeExtractionFailure(current.extractionError);
      setError(
        current.extractionStatus === 'pending'
          ? 'Still reading this file. It will appear in the list shortly.'
          : `${info.short}. ${info.hint}`
      );
      setBusy(null);
      loadFiles();
    } catch (err) {
      if (cancelledRef.current) return;
      setError(getErrorMessage(err, 'Upload failed.'));
      setBusy(null);
    }
  };

  return (
    <div className="attach-pop" ref={rootRef} role="dialog" aria-label="Attach a PDF">
      <div className="attach-pop-head">
        <span><MessageSquareText size={14} /> Chat about a PDF</span>
        <button type="button" className="fx-icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>

      <div className="attach-search">
        <Search size={14} />
        <input placeholder="Search your PDFs…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="attach-list">
        {files === null && <div className="skeleton" style={{ height: 44 }} />}
        {files && visible.length === 0 && (
          <p className="attach-empty">{files.length === 0 ? 'No PDFs yet. Upload one below.' : 'No PDFs match.'}</p>
        )}

        {visible.map((f) => {
          const ready = f.extractionStatus === 'completed';
          const info = f.extractionStatus === 'failed' ? describeExtractionFailure(f.extractionError) : null;
          return (
            <button
              key={f._id}
              type="button"
              className="attach-item"
              disabled={!ready}
              onClick={() => onSelect(f)}
            >
              <span className="attach-item-icon"><FileText size={16} /></span>
              <span className="attach-item-main">
                <span className="attach-item-name">{f.fileName}</span>
                <span className="attach-item-sub">
                  {ready && `${f.pageCount} pages · ${formatFileSize(f.fileSize)}`}
                  {f.extractionStatus === 'pending' && 'Reading text…'}
                  {info && info.short}
                </span>
              </span>
              {f.extractionStatus === 'pending' && <Loader2 size={14} className="spin" />}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="attach-error"><AlertCircle size={13} /> {error}</p>
      )}

      <div className="attach-foot">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) handleUpload(f);
          }}
        />

        {busy ? (
          <div className="attach-busy">
            <Loader2 size={15} className="spin" />
            <span>
              {busy.phase === 'uploading' ? `Uploading ${busy.progress}%` : 'Reading text…'} · {busy.name}
            </span>
          </div>
        ) : (
          <button type="button" className="attach-upload" onClick={() => inputRef.current?.click()}>
            <Upload size={15} /> Upload a PDF
          </button>
        )}

        <p className="attach-note">
          The AI reads text-based PDFs. Images and scans can be stored, but it can't read them yet.
        </p>
      </div>
    </div>
  );
}

export default AttachFilePopover;