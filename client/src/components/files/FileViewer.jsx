

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Download, Sparkles, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2,
  Loader2, AlertCircle, FileText, FileImage, RefreshCw,
} from 'lucide-react';
import { useAIDrawer } from '../../context/AIDrawerContext.jsx';
import { fetchFileBlob, downloadFileToDisk, getErrorMessage } from '../../services/files.api.js';
import { formatFileSize } from '../../utils/fileHelpers.js';
import './files.css';

const PdfPages = lazy(() => import('./PdfPages.jsx'));

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

function FileViewer({ file, onClose }) {
  const isPdf = file.fileType === 'pdf';
  const aiReady = isPdf && file.extractionStatus === 'completed';

  const { context, setDrawerContext, clearDrawerContext, openDrawer, isOpen: drawerOpen, drawerMode } = useAIDrawer();

  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [numPages, setNumPages] = useState(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [zoom, setZoom] = useState(1);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  const bodyRef = useRef(null);
  const previousContextRef = useRef(context); // restored when the viewer closes

  // Lock page scroll while open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Fetch the PDF through our API (authenticated, no public link)
  useEffect(() => {
    if (!isPdf) return undefined;
    let cancelled = false;
    let objectUrl = null;

    setBlobUrl(null);
    setError('');
    setNumPages(null);
    setPage(1);

    fetchFileBlob(file._id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load this file.'));
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file._id, isPdf, reloadKey]);

  // Track the reading area's width so pages can fit it
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => setBodyWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Hand the AI drawer the file (and the page being read)
  useEffect(() => {
    if (!aiReady) return undefined;
    const previous = previousContextRef.current;
    setDrawerContext('file', file._id, `File: ${file.fileName}`, 1);

    return () => {
      if (previous.type === 'none') clearDrawerContext();
      else setDrawerContext(previous.type, previous.id, previous.label, previous.page ?? null);
    };
  }, [aiReady, file._id, file.fileName, setDrawerContext, clearDrawerContext]);

  useEffect(() => {
    if (!aiReady || !numPages) return;
    setDrawerContext('file', file._id, `File: ${file.fileName}`, page);
  }, [page, numPages, aiReady, file._id, file.fileName, setDrawerContext]);

  useEffect(() => {
    setPageInput(String(page));
    bodyRef.current?.scrollTo({ top: 0 });
  }, [page]);

  const goTo = useCallback(
    (target) => {
      if (!numPages || Number.isNaN(target)) return;
      setPage(Math.min(numPages, Math.max(1, Math.round(target))));
    },
    [numPages]
  );

  const changeZoom = useCallback(
    (delta) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100))),
    []
  );

  // Keyboard: Esc closes, arrows / PageUp / PageDown turn pages, +/- zoom
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') onClose();
      else if (isPdf && numPages) {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') goTo(page + 1);
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goTo(page - 1);
        else if (e.key === '+' || e.key === '=') changeZoom(ZOOM_STEP);
        else if (e.key === '-') changeZoom(-ZOOM_STEP);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isPdf, numPages, page, goTo, changeZoom]);

  const handleLoaded = useCallback((count) => {
    setNumPages(count);
    setPage((p) => Math.min(p, count));
  }, []);

  const handlePdfError = useCallback((message) => setError(message), []);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadFileToDisk(file);
    } catch (err) {
      setError(getErrorMessage(err, 'Download failed.'));
    } finally {
      setIsDownloading(false);
    }
  };

  const baseWidth = Math.max(280, Math.min(bodyWidth - 48, 980));
  const pageWidth = Math.round(baseWidth * zoom);
  const docked = drawerOpen && drawerMode === 'docked';

  return createPortal(
    <div
      className={`file-viewer ${docked ? 'file-viewer--docked' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={file.fileName}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="file-viewer-panel">
        <header className="fv-toolbar">
          <div className="fv-title">
            <span className={`fv-title-icon ${isPdf ? 'fv-tone-rose' : 'fv-tone-cyan'}`}>
              {isPdf ? <FileText size={18} /> : <FileImage size={18} />}
            </span>
            <div className="fv-title-text">
              <span className="fv-name" title={file.fileName}>{file.fileName}</span>
              <span className="fv-sub">
                {formatFileSize(file.fileSize)}
                {numPages ? ` · ${numPages} ${numPages === 1 ? 'page' : 'pages'}` : ''}
              </span>
            </div>
          </div>

          {isPdf && numPages && (
            <div className="fv-controls">
              <div className="fv-group">
                <button className="fv-icon-btn" onClick={() => goTo(page - 1)} disabled={page <= 1} aria-label="Previous page">
                  <ChevronLeft size={18} />
                </button>
                <div className="fv-page-field">
                  <input
                    value={pageInput}
                    inputMode="numeric"
                    aria-label="Page number"
                    onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
                    onBlur={() => {
                      const n = parseInt(pageInput, 10);
                      if (n) goTo(n);
                      else setPageInput(String(page));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.target.blur();
                    }}
                  />
                  <span>/ {numPages}</span>
                </div>
                <button className="fv-icon-btn" onClick={() => goTo(page + 1)} disabled={page >= numPages} aria-label="Next page">
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="fv-group">
                <button className="fv-icon-btn" onClick={() => changeZoom(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">
                  <ZoomOut size={17} />
                </button>
                <span className="fv-zoom-label">{Math.round(zoom * 100)}%</span>
                <button className="fv-icon-btn" onClick={() => changeZoom(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">
                  <ZoomIn size={17} />
                </button>
                <button className="fv-icon-btn" onClick={() => setZoom(1)} aria-label="Fit to width" title="Fit to width">
                  <Maximize2 size={16} />
                </button>
              </div>
            </div>
          )}

          <div className="fv-actions">
            {isPdf && (
              <button
                className="fv-ask"
                onClick={openDrawer}
                disabled={!aiReady}
                title={aiReady ? 'Ask AI about this page' : "The AI can't read this file"}
              >
                <Sparkles size={16} /> <span>Ask AI</span>
              </button>
            )}
            <button className="fv-icon-btn" onClick={handleDownload} disabled={isDownloading} aria-label="Download" title="Download">
              {isDownloading ? <Loader2 size={18} className="spin" /> : <Download size={18} />}
            </button>
            <button className="fv-icon-btn" onClick={onClose} aria-label="Close" title="Close (Esc)">
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="fv-body" ref={bodyRef}>
          {isPdf ? (
            error ? (
              <div className="fv-state fv-state-error">
                <AlertCircle size={30} />
                <h4>Couldn't open this file</h4>
                <p>{error}</p>
                <button className="btn btn-ghost" onClick={() => setReloadKey((k) => k + 1)}>
                  <RefreshCw size={15} /> Try again
                </button>
              </div>
            ) : (
              <div className="fv-page-area">
                {!numPages && (
                  <div className="fv-state">
                    <Loader2 size={26} className="spin" />
                    <span>{blobUrl ? 'Rendering…' : 'Loading document…'}</span>
                    <div className="fv-skeleton" style={{ width: pageWidth, height: Math.round(pageWidth * 1.3) }} />
                  </div>
                )}
                {blobUrl && (
                  <Suspense fallback={null}>
                    <PdfPages url={blobUrl} page={page} width={pageWidth} onLoaded={handleLoaded} onError={handlePdfError} />
                  </Suspense>
                )}
              </div>
            )
          ) : (
            <div className="fv-image-wrap">
              <img className="fv-image" src={file.url} alt={file.fileName} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default FileViewer;