import { useEffect, useMemo, useRef, useState } from 'react';

const MAX_MATCHES = 2000;
const MIN_QUERY = 2;

// Boxes (page fractions) for characters [s, e) of a page's text
function rectsFor(entry, s, e) {
  if (entry.rotate % 360 !== 0) return []; // rotated pages: matches are listed, just not drawn
  const { viewport } = entry;
  const out = [];

  for (const it of entry.items) {
    if (it.end <= s || it.start >= e) continue;
    const len = it.end - it.start;
    if (len === 0 || it.w <= 0) continue;

    const cs = Math.max(s, it.start) - it.start;
    const ce = Math.min(e, it.end) - it.start;
    const x0 = it.tx + (it.w * cs) / len;
    const w = (it.w * (ce - cs)) / len;
    const [px, py] = viewport.convertToViewportPoint(x0, it.ty + 0.8 * it.h);

    const rect = {
      x: Math.min(1, Math.max(0, px / viewport.width)),
      y: Math.min(1, Math.max(0, py / viewport.height)),
      w: w / viewport.width,
      h: it.h / viewport.height,
    };
    rect.w = Math.min(rect.w, 1 - rect.x);
    rect.h = Math.min(rect.h, 1 - rect.y);

    const last = out[out.length - 1];
    if (last && Math.abs(last.y - rect.y) < 0.003 && rect.x - (last.x + last.w) < 0.01) {
      last.w = Math.max(last.w, rect.x + rect.w - last.x); // pieces of one line join up
    } else if (rect.w > 0 && rect.h > 0) {
      out.push(rect);
    }
  }
  return out;
}

// Full-text search over an open PDF. Pages are read once, in the background,
// only after search is opened, and cached for the life of the document.
function usePdfSearch(pdf, query, enabled) {
  const cache = useRef(new Map()); // page -> { text, items, viewport, rotate }
  const [indexed, setIndexed] = useState(0);
  const total = pdf ? pdf.numPages : 0;

  useEffect(() => {
    cache.current = new Map();
    setIndexed(0);
  }, [pdf]);

  useEffect(() => {
    if (!enabled || !pdf) return undefined;
    let cancelled = false;

    (async () => {
      for (let p = 1; p <= pdf.numPages; p += 1) {
        if (cancelled) return;
        if (cache.current.has(p)) continue;

        let entry = { text: '', items: [], viewport: null, rotate: 0 };
        try {
          const pg = await pdf.getPage(p);
          const [content, viewport] = [await pg.getTextContent(), pg.getViewport({ scale: 1 })];
          let text = '';
          const items = [];
          for (const it of content.items) {
            if (!('str' in it)) continue;
            const str = it.str.toLowerCase();
            const start = text.length;
            text += str;
            items.push({
              start,
              end: text.length,
              tx: it.transform[4],
              ty: it.transform[5],
              w: it.width,
              h: it.height || Math.abs(it.transform[3]),
            });
            if (it.hasEOL) text += ' ';
          }
          entry = { text, items, viewport, rotate: pg.rotate || 0 };
          pg.cleanup?.();
        } catch {
          // an unreadable page simply has no matches
        }

        if (cancelled) return;
        cache.current.set(p, entry);
        if (p % 5 === 0 || p === pdf.numPages) setIndexed(cache.current.size);
      }
      if (!cancelled) setIndexed(cache.current.size);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, pdf]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!enabled || q.length < MIN_QUERY) return [];

    const out = [];
    for (let p = 1; p <= total && out.length < MAX_MATCHES; p += 1) {
      const entry = cache.current.get(p);
      if (!entry) continue;
      let from = 0;
      while (out.length < MAX_MATCHES) {
        const i = entry.text.indexOf(q, from);
        if (i < 0) break;
        out.push({ id: `${p}-${i}`, page: p, rects: entry.viewport ? rectsFor(entry, i, i + q.length) : [] });
        from = i + q.length;
      }
    }
    return out;
    // `indexed` changes as more pages are read, which is what makes the list grow
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, enabled, total, indexed]);

  const byPage = useMemo(() => {
    const map = new Map();
    for (const m of results) {
      if (!map.has(m.page)) map.set(m.page, []);
      map.get(m.page).push(m);
    }
    return map;
  }, [results]);

  return { results, byPage, indexed, total, indexing: enabled && total > 0 && indexed < total, capped: results.length >= MAX_MATCHES };
}

export default usePdfSearch;