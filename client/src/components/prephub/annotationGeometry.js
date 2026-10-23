// Everything here works in "sheet space": x, y, w, h are fractions (0..1) of one PDF page.

export const clamp01 = (v) => Math.min(1, Math.max(0, v));

const overlapV = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);

// Collapse the many overlapping boxes a text selection produces into one box per line
export function mergeLineRects(rects) {
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const lines = [];

  for (const r of sorted) {
    const line = lines.find((l) => overlapV(l, r) >= 0.5 * Math.min(l.bottom - l.top, r.bottom - r.top));
    if (line) {
      line.items.push(r);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else {
      lines.push({ top: r.top, bottom: r.bottom, items: [r] });
    }
  }

  const out = [];
  for (const line of lines) {
    const items = line.items.sort((a, b) => a.left - b.left);
    const height = line.bottom - line.top;
    let cur = { left: items[0].left, right: items[0].right, top: line.top, bottom: line.bottom };
    for (let i = 1; i < items.length; i += 1) {
      const it = items[i];
      if (it.left <= cur.right + height * 1.5) cur.right = Math.max(cur.right, it.right);
      else {
        out.push(cur);
        cur = { left: it.left, right: it.right, top: line.top, bottom: line.bottom };
      }
    }
    out.push(cur);
  }
  return out;
}

// A selection can cover several pages: returns [{ page, rects: [{x,y,w,h}] }]
export function selectionToPages(range, sheets) {
  const raw = Array.from(range.getClientRects()).filter((r) => r.width >= 1 && r.height >= 1);
  const pages = [];

  for (const sheet of sheets) {
    const sr = sheet.getBoundingClientRect();
    if (sr.width < 1 || sr.height < 1) continue;

    const inside = raw.filter((r) => {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const tooBig = r.height > sr.height * 0.25; // stray container boxes, never a line of text
      return !tooBig && cx >= sr.left && cx <= sr.right && cy >= sr.top && cy <= sr.bottom;
    });
    if (inside.length === 0) continue;

    const rects = mergeLineRects(inside)
      .map((m) => {
        const x = clamp01((m.left - sr.left) / sr.width);
        const y = clamp01((m.top - sr.top) / sr.height);
        return {
          x,
          y,
          w: Math.min(1 - x, (m.right - m.left) / sr.width),
          h: Math.min(1 - y, (m.bottom - m.top) / sr.height),
        };
      })
      .filter((r) => r.w > 0.002 && r.h > 0.002);

    if (rects.length) pages.push({ page: Number(sheet.dataset.page), rects: rects.slice(0, 200) });
  }
  return pages;
}

// Topmost (latest) annotation under a point on one page
export function hitTest(annotations, x, y) {
  const pad = 0.003;
  for (let i = annotations.length - 1; i >= 0; i -= 1) {
    const a = annotations[i];
    for (const r of a.rects) {
      if (x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad) return a;
    }
  }
  return null;
}