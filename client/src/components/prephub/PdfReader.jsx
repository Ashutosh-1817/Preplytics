import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Minimize2, Moon, Sun,
  Download, Loader2, AlertCircle, RefreshCw, BoxSelect, X, Search, Highlighter,
} from 'lucide-react';
import { fetchFileBlob, downloadFileToDisk, getErrorMessage } from '../../services/files.api.js';
import { readJson, writeJson } from './prephubStorage.js';
import { useZen } from './zenStore.js';
import useAnnotations from './useAnnotations.js';
import AnnotationLayer from './AnnotationLayer.jsx';
import SelectionMenu from './SelectionMenu.jsx';
import AnnotationPopover from './AnnotationPopover.jsx';
import AnnotationsPanel from './AnnotationsPanel.jsx';
import SearchBar from './SearchBar.jsx';
import usePdfSearch from './usePdfSearch.js';
import { ANNOTATION_COLORS, colorOf } from './annotationConfig.js';
import { clamp01, hitTest, selectionToPages } from './annotationGeometry.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const SIDE_PAD = 24;
const KEEP = 8; // pages farther than this from the reader get unmounted once scrolling settles
const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
const EMPTY = [];
const EMPTY_MATCHES = [];
const COLOR_KEY = 'prephub:anncolor';
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
const PageSlot = memo(function PageSlot({
  n, pageWidth, slotHeight, render, setSlotRef, onRatio,
  annotations, draft, draftColor, matches, currentMatchId, flashKey,
  onSheetClick, onAreaDown, onAreaMove, onAreaUp,
}) {
  return (
    <div
      ref={(el) => setSlotRef(n, el)}
      data-page={n}
      className="ph-pdf-slot"
      style={{ width: pageWidth, minHeight: slotHeight }}
    >
      {/* The sheet is exactly the page; annotation positions are fractions of it */}
      <div
        className="ph-pdf-sheet"
        data-page={n}
        style={{ width: pageWidth }}
        onClick={(e) => onSheetClick(n, e)}
        onPointerDown={(e) => onAreaDown(n, e)}
        onPointerMove={(e) => onAreaMove(n, e)}
        onPointerUp={(e) => onAreaUp(n, e, false)}
        onPointerCancel={(e) => onAreaUp(n, e, true)}
      >
        {render && (
          <>
            <Page
              pageNumber={n}
              width={pageWidth}
              devicePixelRatio={DPR}
              suspense={false}
              renderTextLayer
              renderAnnotationLayer={false}
              renderForms={false}
              loading={<div className="ph-skel" style={{ width: pageWidth, height: slotHeight }} />}
              onLoadSuccess={onRatio}
              onLoadError={(e) => console.error('[PdfReader] page', n, 'load error', e)}
              onRenderError={(e) => console.error('[PdfReader] page', n, 'render error', e)}
            />
            <AnnotationLayer
              annotations={annotations}
              draft={draft}
              draftColor={draftColor}
              matches={matches}
              currentMatchId={currentMatchId}
              flashKey={flashKey}
            />
          </>
        )}
      </div>
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

  // annotations
  const ann = useAnnotations(file._id);
  const createAnnotationItem = ann.create;
  const [areaMode, setAreaMode] = useState(false);
  const [toolColor, setToolColor] = useState(() => {
    const saved = readJson(COLOR_KEY, 'yellow');
    return ANNOTATION_COLORS.some((c) => c.id === saved) ? saved : 'yellow';
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [draft, setDraft] = useState(null); // box being dragged: { page, x, y, w, h }
  const [sel, setSel] = useState(null); // snapshot of the current text selection
  const [active, setActive] = useState(null); // annotation being edited: { key, x, y }

  // search + annotations list
  const [pdf, setPdf] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState(0);
  const [query, setQuery] = useState('');
  const [cur, setCur] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [flashKey, setFlashKey] = useState(null);

  const scrollRef = useRef(null);
  const slotRefs = useRef([]);
  const restoredRef = useRef(false);
  const ratioSetRef = useRef(false);
  const anchorRef = useRef({ page: 1, frac: 0 });
  const frameRef = useRef(0);
  const selectingRef = useRef(false);
  const dragRef = useRef(null);
  const areaModeRef = useRef(false);
  const toolColorRef = useRef(toolColor);
  const byPageRef = useRef(ann.byPage);
  const jumpPendingRef = useRef(false);
  const flashTimerRef = useRef(0);

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

  const onDocLoaded = useCallback((doc) => {
    setNumPages(doc.numPages);
    setPdf(doc);
  }, []);
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
    setPdf(null);
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
    setSel(null);
    setActive(null);
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
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'Escape') {
      setAreaMode(false);
      setActive(null);
      setSel(null);
      setSearchOpen(false);
      window.getSelection()?.removeAllRanges();
      return;
    }
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

  // ---------- annotations ----------
  useEffect(() => {
    areaModeRef.current = areaMode;
    toolColorRef.current = toolColor;
    byPageRef.current = ann.byPage;
  });

  const chooseColor = (id) => {
    setToolColor(id);
    writeJson(COLOR_KEY, id);
    setPaletteOpen(false);
  };

  useEffect(() => {
    if (!paletteOpen) return undefined;
    const close = (e) => {
      if (!e.target.closest?.('.ph-pal-wrap')) setPaletteOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [paletteOpen]);

  // Snapshot the browser's text selection as page fractions
  const captureSelection = useCallback(() => {
    const root = scrollRef.current;
    const s = window.getSelection();
    if (!root || !s || s.rangeCount === 0 || s.isCollapsed) return null;

    const range = s.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;

    const pages = selectionToPages(range, Array.from(root.querySelectorAll('.ph-pdf-sheet')));
    if (pages.length === 0) return null;

    const box = range.getBoundingClientRect();
    return {
      pages,
      quote: s.toString().replace(/\s+/g, ' ').trim().slice(0, 3000),
      anchor: { x: box.left + box.width / 2, below: box.bottom, above: box.top },
    };
  }, []);

  useEffect(() => {
    let timer = 0;
    const schedule = (delay) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (selectingRef.current || areaModeRef.current) return;
        const snapshot = captureSelection();
        if (snapshot) {
          setSel(snapshot);
          setActive(null);
        }
      }, delay);
    };

    const root = scrollRef.current;
    const onDown = () => {
      selectingRef.current = true;
      clearTimeout(timer);
    };
    const onUp = () => {
      if (!selectingRef.current) return;
      selectingRef.current = false;
      schedule(15);
    };
    const onSelectionChange = () => {
      const s = window.getSelection();
      if (s && !s.isCollapsed && !selectingRef.current) schedule(300); // keyboard and touch selection
    };

    root?.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      clearTimeout(timer);
      root?.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [captureSelection]);

  const closeSelection = useCallback(() => setSel(null), []);
  const closeActive = useCallback(() => setActive(null), []);

  const createFromSelection = (type, color, comment = '') => {
    if (!sel) return;
    sel.pages.forEach((p, i) => {
      ann.create({
        page: p.page,
        type,
        color,
        rects: p.rects,
        quote: i === 0 ? sel.quote : '',
        comment: i === 0 ? comment : '',
      });
    });
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };

  const copySelection = () => {
    if (sel?.quote) navigator.clipboard?.writeText(sel.quote).catch(() => {});
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };

  // Click on a highlighted spot opens its editor
  const handleSheetClick = useCallback((n, e) => {
    if (areaModeRef.current) return;
    const s = window.getSelection();
    if (s && !s.isCollapsed) return;

    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    const list = byPageRef.current.get(n);
    const hit = list ? hitTest(list, x, y) : null;
    setActive(hit ? { key: hit._key, x: e.clientX, y: e.clientY } : null);
  }, []);

  // Area highlight: drag a box
  const pointOnSheet = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: clamp01((e.clientX - box.left) / box.width), y: clamp01((e.clientY - box.top) / box.height), box };
  };

  const handleAreaDown = useCallback((n, e) => {
    if (!areaModeRef.current || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = pointOnSheet(e);
    dragRef.current = { page: n, x0: p.x, y0: p.y };
    setSel(null);
    setActive(null);
    setDraft({ page: n, x: p.x, y: p.y, w: 0, h: 0 });
  }, []);

  const handleAreaMove = useCallback((n, e) => {
    const d = dragRef.current;
    if (!d || d.page !== n) return;
    const p = pointOnSheet(e);
    setDraft({ page: n, x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0) });
  }, []);

  const handleAreaUp = useCallback(
    (n, e, cancelled) => {
      const d = dragRef.current;
      if (!d || d.page !== n) return;
      dragRef.current = null;
      setDraft(null);
      if (cancelled) return;

      const p = pointOnSheet(e);
      const rect = { x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0) };
      if (rect.w * p.box.width < 12 || rect.h * p.box.height < 12) return; // an accidental click

      const key = createAnnotationItem({ page: n, type: 'area', color: toolColorRef.current, rects: [rect], quote: '', comment: '' });
      setActive({ key, x: e.clientX, y: e.clientY });
    },
    [createAnnotationItem]
  );

  const activeAnn = active ? ann.items.find((a) => a._key === active.key) : null;

  // ---------- find in PDF ----------
  const deferredQuery = useDeferredValue(query);
  const search = usePdfSearch(pdf, deferredQuery, searchOpen);
  const matchCount = search.results.length;
  const safeCur = matchCount ? Math.min(cur, matchCount - 1) : 0;
  const currentMatch = matchCount ? search.results[safeCur] : null;

  // Scroll so a point on a page sits comfortably in view
  const jumpToRect = useCallback((target, yFrac) => {
    const el = slotRefs.current[target - 1];
    const root = scrollRef.current;
    if (!el || !root) return;
    setNear((prev) => {
      const next = new Set(prev);
      for (let p = target - 1; p <= target + 1; p += 1) if (p >= 1) next.add(p);
      return next;
    });
    const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    root.scrollTo({ top: Math.max(0, top + el.offsetHeight * yFrac - root.clientHeight * 0.35), behavior: 'auto' });
  }, []);

  const goToMatch = useCallback(
    (index) => {
      const m = search.results[index];
      if (!m) return;
      setCur(index);
      jumpToRect(m.page, m.rects[0]?.y ?? 0);
    },
    [search.results, jumpToRect]
  );

  const nextMatch = () => matchCount && goToMatch((safeCur + 1) % matchCount);
  const prevMatch = () => matchCount && goToMatch((safeCur - 1 + matchCount) % matchCount);

  const changeQuery = (value) => {
    setQuery(value);
    setCur(0);
    jumpPendingRef.current = true; // jump to the first match as soon as one exists
  };

  useEffect(() => {
    if (!jumpPendingRef.current || !searchOpen || search.results.length === 0) return;
    jumpPendingRef.current = false;
    goToMatch(0);
  }, [search.results, searchOpen, goToMatch]);

  const openSearch = () => {
    setSearchOpen(true);
    setSearchFocus((n) => n + 1);
  };

  // Closing hands the keyboard back to the page, so Ctrl+F works again straight away
  const closeSearch = () => {
    setSearchOpen(false);
    scrollRef.current?.focus({ preventScroll: true });
  };

  const handleRootKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openSearch();
    }
  };

  // ---------- annotations list ----------
  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

  const jumpToAnnotation = useCallback(
    (a) => {
      jumpToRect(a.page, a.rects[0]?.y ?? 0);
      setFlashKey(a._key);
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashKey(null), 1800);
    },
    [jumpToRect]
  );

  const editFromPanel = (a) => {
    jumpToAnnotation(a);
    setTimeout(() => {
      const slot = slotRefs.current[a.page - 1];
      if (!slot) return;
      const sheet = slot.querySelector('.ph-pdf-sheet');
      const box = (sheet && sheet.offsetHeight > 0 ? sheet : slot).getBoundingClientRect();
      const r = a.rects[a.rects.length - 1];
      setActive({ key: a._key, x: box.left + (r.x + r.w / 2) * box.width, y: box.top + (r.y + r.h) * box.height });
    }, 160);
  };

  const pages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);

  return (
    <div className="ph-pdf" onKeyDown={handleRootKey}>
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

        <span className="ph-tb-sep" aria-hidden="true" />

        <button
          type="button"
          className={`ph-icon-btn ${areaMode ? 'ph-icon-btn-active' : ''}`}
          onClick={() => {
            setAreaMode((v) => !v);
            setSel(null);
            setActive(null);
          }}
          aria-pressed={areaMode}
          aria-label="Area highlight"
          title="Area highlight: drag a box over a diagram or formula"
        >
          <BoxSelect size={15} />
        </button>
        <div className="ph-pal-wrap">
          <button type="button" className="ph-icon-btn" onClick={() => setPaletteOpen((v) => !v)} aria-label="Highlight color" title="Color for underline, comment and area highlights">
            <span className="ph-tool-swatch" style={{ background: colorOf(toolColor).solid }} />
          </button>
          {paletteOpen && (
            <div className="ph-pal" role="menu">
              {ANNOTATION_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`ph-selmenu-dot ${toolColor === c.id ? 'ph-selmenu-dot-on' : ''}`}
                  style={{ background: c.solid }}
                  onClick={() => chooseColor(c.id)}
                  aria-label={c.label}
                />
              ))}
            </div>
          )}
        </div>

        <span className="ph-pdf-spacer" />

        <button
          type="button"
          className={`ph-icon-btn ${searchOpen ? 'ph-icon-btn-active' : ''}`}
          onClick={() => (searchOpen ? closeSearch() : openSearch())}
          aria-pressed={searchOpen}
          aria-label="Find in PDF"
          title="Find in PDF (Ctrl+F)"
        >
          <Search size={15} />
        </button>
        <button
          type="button"
          className={`ph-icon-btn ph-badge-btn ${panelOpen ? 'ph-icon-btn-active' : ''}`}
          onClick={() => setPanelOpen((v) => !v)}
          aria-pressed={panelOpen}
          aria-label="Annotations"
          title="All annotations"
        >
          <Highlighter size={15} />
          {ann.items.length > 0 && <span className="ph-badge">{ann.items.length > 99 ? '99+' : ann.items.length}</span>}
        </button>

        <button type="button" className="ph-icon-btn" onClick={toggleDark} aria-label="Toggle dark reading mode" title="Dark reading mode">
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button type="button" className="ph-icon-btn" onClick={() => downloadFileToDisk(file).catch(() => {})} aria-label="Download" title="Download">
          <Download size={15} />
        </button>
      </div>

      <div className="ph-pdf-body">
        {searchOpen && (
          <SearchBar
            query={query}
            onQuery={changeQuery}
            count={matchCount}
            current={safeCur}
            indexing={search.indexing}
            indexed={search.indexed}
            total={search.total}
            capped={search.capped}
            focusTick={searchFocus}
            onNext={nextMatch}
            onPrev={prevMatch}
            onClose={closeSearch}
          />
        )}

        <div
          ref={scrollRef}
          className={`ph-pdf-scroll ${dark ? 'ph-pdf-dark' : ''} ${areaMode ? 'ph-area-mode' : ''}`}
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
              suspense={false}
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
                      annotations={ann.byPage.get(n) || EMPTY}
                      draft={draft && draft.page === n ? draft : null}
                      draftColor={toolColor}
                      matches={search.byPage.get(n) || EMPTY_MATCHES}
                      currentMatchId={currentMatch && currentMatch.page === n ? currentMatch.id : null}
                      flashKey={flashKey && (ann.byPage.get(n) || EMPTY).some((a) => a._key === flashKey) ? flashKey : null}
                      onSheetClick={handleSheetClick}
                      onAreaDown={handleAreaDown}
                      onAreaMove={handleAreaMove}
                      onAreaUp={handleAreaUp}
                    />
                  ))}
              </div>
            </Document>
          )}
        </div>

        {panelOpen && (
          <AnnotationsPanel
            items={ann.items}
            status={ann.status}
            onJump={jumpToAnnotation}
            onEdit={editFromPanel}
            onDelete={ann.remove}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      {ann.error && (
        <p className="ph-pdf-toast" role="alert">
          <AlertCircle size={14} /> {ann.error}
          <button type="button" className="ph-link-btn" onClick={ann.clearError} aria-label="Dismiss">
            <X size={13} />
          </button>
        </p>
      )}

      {sel && (
        <SelectionMenu
          key={sel.anchor.x + ':' + sel.anchor.below}
          sel={sel}
          onHighlight={(color) => createFromSelection('highlight', color)}
          onUnderline={() => createFromSelection('underline', toolColor)}
          onComment={(text) => createFromSelection('highlight', toolColor, text)}
          onCopy={copySelection}
          onClose={closeSelection}
        />
      )}

      {activeAnn && (
        <AnnotationPopover
          key={activeAnn._key}
          annotation={activeAnn}
          x={active.x}
          y={active.y}
          onColor={(color) => ann.update(activeAnn._key, { color })}
          onComment={(comment) => ann.update(activeAnn._key, { comment })}
          onDelete={() => ann.remove(activeAnn._key)}
          onClose={closeActive}
        />
      )}
    </div>
  );
}

export default PdfReader;