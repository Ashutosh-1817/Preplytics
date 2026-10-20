import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Minimize2, Moon, Sun,
  Download, Loader2, AlertCircle, RefreshCw,
} from 'lucide-react';
import { fetchFileBlob, downloadFileToDisk, getErrorMessage } from '../../services/files.api.js';
import { readJson, writeJson } from './prephubStorage.js';
import { useZen } from './zenStore.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const SIDE_PAD = 24;
const KEEP = 8; // pages farther than this from the reader get unmounted once scrolling settles
const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
const DOC_OPTIONS = {}; // constant identity so the Document never reloads on re-render

// Switching tabs unmounts the reader; this stops re-downloading the same PDF
const blobCache = new Map(); // fileId -> Promise<Blob>, most recent last
const getPdfBlob = (fileId) => {
  if (blobCache.has(fileId)) {
    const hit = blobCache.get(fileId);
    blobCache.delete(fileId);
    blobCache.set(fileId, hit);
    return hit;
  }
  const promise = fetchFileBlob(fileId).catch((err) => {
    blobCache.delete(fileId);
    throw err;
  });
  blobCache.set(fileId, promise);
  while (blobCache.size > 3) blobCache.delete(blobCache.keys().next().value);
  return promise;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Memoised: scrolling changes `page` every frame, but a slot only re-renders if its own props change.
// Canvas only. No text layer, no annotation layer, no forms layer.
const PageSlot = memo(function PageSlot({ n, pageWidth, slotHeight, render, setSlotRef, onRatio }) {
  return (
    <div
      ref={(el) => setSlotRef(n, el)}
      data-page={n}
      className="ph-pdf-slot"
      style={{ width: pageWidth, minHeight: slotHeight }}
    >
      {render && (
        <Page
          pageNumber={n}
          width={pageWidth}
          devicePixelRatio={DPR}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          renderForms={false}
          loading={<div className="ph-skel" style={{ width: pageWidth, height: slotHeight }} />}
          onLoadSuccess={onRatio}
          onLoadError={(e) => console.error('[PdfReader] page', n, 'load error', e)}
          onRenderError={(e) => console.error('[PdfReader] page', n, 'render error', e)}
        />
      )}
    </div>
  );
});

function PdfReader({ file }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [dark, setDark] = useState(() => readJson('prephub:pdfdark', false));
  const [near, setNear] = useState(() => new Set([1, 2]));
  const [zen, setZen] = useZen();

  const scrollRef = useRef(null);
  const slotRefs = useRef([]);
  const restoredRef = useRef(false);
  const ratioSetRef = useRef(false);
  const anchorRef = useRef({ page: 1, frac: 0 });
  const frameRef = useRef(0);

  // 8px steps so a scrollbar appearing never re-renders every canvas
  const pageWidth = Math.max(200, Math.floor(((width - SIDE_PAD) * zoom) / 8) * 8);
  const slotHeight = Math.round(pageWidth * ratio);

  const slotTop = (el) => {
    const root = scrollRef.current;
    return el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
  };

  const jumpTo = useCallback((target, behavior = 'auto') => {
    const el = slotRefs.current[target - 1];
    const root = scrollRef.current;
    if (!el || !root) return;
    // Mark the destination (and neighbours) for rendering before landing on it
    setNear((prev) => {
      const next = new Set(prev);
      for (let p = target - 1; p <= target + 2; p += 1) if (p >= 1) next.add(p);
      return next;
    });
    const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    root.scrollTo({ top: Math.max(0, top - 8), behavior });
  }, []);

  const setSlotRef = useCallback((n, el) => {
    slotRefs.current[n - 1] = el;
  }, []);

  const onRatio = useCallback((p) => {
    if (!ratioSetRef.current && p.originalWidth) {
      ratioSetRef.current = true;
      setRatio(p.originalHeight / p.originalWidth);
    }
  }, []);

  const onDocLoaded = useCallback(({ numPages: total }) => setNumPages(total), []);
  const onDocError = useCallback((err) => {
    console.error('[PdfReader] pdf.js load error', err);
    setError(err?.message || 'Could not open this PDF.');
  }, []);

  useEffect(() => {
    console.count('[PdfReader] reader mounted');
    return () => setZen(false); // never leave the side panels hidden
  }, [setZen]);

  // ---------- load the file through our API (authenticated, no public link) ----------
  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    setBlobUrl(null);
    setError('');
    setNumPages(0);
    setPage(1);
    setNear(new Set([1, 2]));
    restoredRef.current = false;
    ratioSetRef.current = false;

    getPdfBlob(file._id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((err) => {
        console.error('[PdfReader] file fetch failed', err, err?.response?.status);
        if (!cancelled) setError(getErrorMessage(err, 'Could not load this file.'));
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file._id, reloadKey]);

  // ---------- fit pages to the reading area ----------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      setWidth((prev) => (w > 0 && Math.abs(prev - w) < 2 ? prev : w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---------- pages are added when they approach the screen, never removed here ----------
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || numPages === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const add = entries.filter((e) => e.isIntersecting).map((e) => Number(e.target.dataset.page));
        if (add.length === 0) return;
        setNear((prev) => {
          if (add.every((p) => prev.has(p))) return prev;
          const next = new Set(prev);
          add.forEach((p) => next.add(p));
          return next;
        });
      },
      { root, rootMargin: '800px 0px' }
    );

    slotRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages]);

  // ---------- free memory for pages far from the reader, after scrolling settles ----------
  useEffect(() => {
    const timer = setTimeout(() => {
      setNear((prev) => {
        const next = new Set();
        prev.forEach((p) => {
          if (Math.abs(p - page) <= KEEP) next.add(p);
        });
        return next.size === prev.size ? prev : next;
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [page]);

  // ---------- current page + anchor, on scroll ----------
  const handleScroll = () => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const root = scrollRef.current;
      if (!root || numPages === 0) return;

      const mark = root.scrollTop + root.clientHeight * 0.3;
      let current = 1;
      for (let i = 0; i < numPages; i += 1) {
        const el = slotRefs.current[i];
        if (el && slotTop(el) <= mark) current = i + 1;
        else break;
      }

      const el = slotRefs.current[current - 1];
      if (el) {
        anchorRef.current = { page: current, frac: (root.scrollTop - slotTop(el)) / Math.max(1, el.offsetHeight) };
      }
      setPage((prev) => (prev === current ? prev : current));
    });
  };

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  // Keep the reader's place when zoom or width changes the page heights
  useLayoutEffect(() => {
    if (!restoredRef.current) return;
    const root = scrollRef.current;
    const { page: anchorPage, frac } = anchorRef.current;
    const el = slotRefs.current[anchorPage - 1];
    if (!root || !el) return;
    root.scrollTop = slotTop(el) + frac * el.offsetHeight;
  }, [pageWidth]);

  // ---------- remember the page per file ----------
  useEffect(() => {
    setPageInput(String(page));
    if (!restoredRef.current) return undefined;
    const timer = setTimeout(() => writeJson(`prephub:pdfpos:${file._id}`, page), 400);
    return () => clearTimeout(timer);
  }, [page, file._id]);

  useEffect(() => {
    if (numPages === 0 || width === 0 || restoredRef.current) return undefined;
    const saved = clamp(Math.round(Number(readJson(`prephub:pdfpos:${file._id}`, 1))) || 1, 1, numPages);
    const frame = requestAnimationFrame(() => {
      jumpTo(saved, 'auto');
      restoredRef.current = true;
      setPage(saved);
    });
    return () => cancelAnimationFrame(frame);
  }, [numPages, width, file._id, jumpTo]);

  const goTo = (target) => {
    if (!numPages || Number.isNaN(target)) return;
    jumpTo(clamp(Math.round(target), 1, numPages));
  };

  const changeZoom = (delta) => setZoom((z) => clamp(Math.round((z + delta) * 100) / 100, MIN_ZOOM, MAX_ZOOM));

  const handleKey = (e) => {
    if (e.target.closest('input')) return;
    if (e.key === '+' || e.key === '=') changeZoom(0.25);
    else if (e.key === '-') changeZoom(-0.25);
    else if (e.key === '0') setZoom(1);
    else return;
    e.preventDefault();
  };

  const toggleDark = () => {
    setDark((d) => {
      writeJson('prephub:pdfdark', !d);
      return !d;
    });
  };

  const pages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);

  return (
    <div className="ph-pdf">
      <div className="ph-pdf-bar">
        <button type="button" className="ph-icon-btn" onClick={() => goTo(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>
        <form
          className="ph-pdf-page"
          onSubmit={(e) => {
            e.preventDefault();
            goTo(Number(pageInput));
          }}
        >
          <input
            value={pageInput}
            inputMode="numeric"
            aria-label="Page number"
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
            onBlur={() => setPageInput(String(page))}
          />
          <span>/ {numPages || '–'}</span>
        </form>
        <button type="button" className="ph-icon-btn" onClick={() => goTo(page + 1)} disabled={!numPages || page >= numPages} aria-label="Next page">
          <ChevronRight size={16} />
        </button>

        <span className="ph-tb-sep" aria-hidden="true" />

        <button type="button" className="ph-icon-btn" onClick={() => changeZoom(-0.25)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">
          <ZoomOut size={16} />
        </button>
        <button type="button" className="ph-icon-btn" onClick={() => setZoom(1)} title="Reset to fit width">
          <span className="ph-pdf-zoom">{Math.round(zoom * 100)}%</span>
        </button>
        <button type="button" className="ph-icon-btn" onClick={() => changeZoom(0.25)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          className="ph-icon-btn"
          onClick={() => setZen(!zen)}
          aria-label={zen ? 'Exit zen mode (Esc)' : 'Zen mode'}
          title={zen ? 'Exit zen mode (Esc)' : 'Zen mode'}
        >
          {zen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>

        <span className="ph-pdf-spacer" />

        <button type="button" className="ph-icon-btn" onClick={toggleDark} aria-label="Toggle dark reading mode" title="Dark reading mode">
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button type="button" className="ph-icon-btn" onClick={() => downloadFileToDisk(file).catch(() => {})} aria-label="Download" title="Download">
          <Download size={15} />
        </button>
      </div>

      <div
        ref={scrollRef}
        className={`ph-pdf-scroll ${dark ? 'ph-pdf-dark' : ''}`}
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={handleKey}
      >
        {error && (
          <div className="ph-pdf-state">
            <AlertCircle size={20} />
            <p>{error}</p>
            <button type="button" className="ph-btn" onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshCw size={14} /> Try again
            </button>
          </div>
        )}

        {!error && !blobUrl && (
          <div className="ph-pdf-state">
            <Loader2 size={20} className="ph-spin" />
            <p>Opening {file.fileName}…</p>
          </div>
        )}

        {/* Mounted once per file and never toggled by layout state, so the worker is not torn down mid-task */}
        {!error && blobUrl && (
          <Document
            key={blobUrl}
            file={blobUrl}
            options={DOC_OPTIONS}
            loading={null}
            error={null}
            noData={null}
            onLoadSuccess={onDocLoaded}
            onLoadError={onDocError}
          >
            <div className="ph-pdf-pages">
              {width > 0 &&
                pages.map((n) => (
                  <PageSlot
                    key={n}
                    n={n}
                    pageWidth={pageWidth}
                    slotHeight={slotHeight}
                    render={near.has(n) || Math.abs(n - page) <= 2}
                    setSlotRef={setSlotRef}
                    onRatio={onRatio}
                  />
                ))}
            </div>
          </Document>
        )}
      </div>
    </div>
  );
}

export default PdfReader;