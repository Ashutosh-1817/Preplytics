import { memo } from 'react';
import { colorOf } from './annotationConfig.js';

const pct = (v) => `${v * 100}%`;

// Draws one page's annotations. Never takes mouse input (clicks are hit-tested by the
// reader), so text underneath stays selectable.
const AnnotationLayer = memo(function AnnotationLayer({ annotations, draft, draftColor, matches, currentMatchId, flashKey }) {
  return (
    <div className="ph-ann-layer" aria-hidden="true">
      {matches.map((m) =>
        m.rects.map((r, i) => (
          <div
            key={`${m.id}-${i}`}
            className={`ph-match ${m.id === currentMatchId ? 'ph-match-current' : ''}`}
            style={{ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) }}
          />
        ))
      )}
      {annotations.map((a) => {
        const c = colorOf(a.color);
        return (
          <div key={a._key} className={`ph-ann-group ph-ann-${a.type} ${a._key === flashKey ? 'ph-ann-flash' : ''}`} style={{ '--ann-fill': c.fill, '--ann-solid': c.solid }}>
            {a.rects.map((r, i) => (
              <div
                key={i}
                className="ph-ann"
                style={{ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) }}
              />
            ))}
            {a.comment && a.rects[0] && (
              <span
                className="ph-ann-dot"
                style={{ left: pct(a.rects[0].x + a.rects[0].w), top: pct(a.rects[0].y) }}
              />
            )}
          </div>
        );
      })}

      {draft && (
        <div
          className="ph-ann-draft"
          style={{
            left: pct(draft.x),
            top: pct(draft.y),
            width: pct(draft.w),
            height: pct(draft.h),
            '--ann-solid': colorOf(draftColor).solid,
            '--ann-fill': colorOf(draftColor).fill,
          }}
        />
      )}
    </div>
  );
});

export default AnnotationLayer;