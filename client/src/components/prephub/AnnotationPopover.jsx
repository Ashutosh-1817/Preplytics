import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Check } from 'lucide-react';
import { ANNOTATION_COLORS } from './annotationConfig.js';

const W = 280;

// Opens when you click an existing annotation: change color, edit the comment, delete.
function AnnotationPopover({ annotation, x, y: rawY, onColor, onComment, onDelete, onClose }) {
  const y = Math.min(rawY, window.innerHeight - 24); // the click can sit at the very edge of the screen
  const ref = useRef(null);
  const [text, setText] = useState(annotation.comment || '');
  const latest = useRef({ text, saved: annotation.comment || '', deleted: false });

  useEffect(() => {
    latest.current.text = text;
  }, [text]);

  // Saving on close means a typed comment is never lost by clicking away
  useEffect(() => {
    const state = latest.current;
    return () => {
      if (!state.deleted && state.text.trim() !== state.saved) onComment(state.text.trim());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const left = Math.min(window.innerWidth - W - 12, Math.max(12, x - W / 2));
  const below = window.innerHeight - y > 280;
  const style = below ? { left, top: y + 14 } : { left, bottom: window.innerHeight - y + 14 };

  const save = () => {
    latest.current.saved = text.trim();
    onComment(text.trim());
    onClose();
  };

  return createPortal(
    <div ref={ref} className="ph-annpop" style={{ ...style, width: W }} role="dialog" aria-label="Annotation">
      {annotation.quote && <p className="ph-annpop-quote">“{annotation.quote}”</p>}

      <div className="ph-annpop-colors">
        {ANNOTATION_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`ph-selmenu-dot ${annotation.color === c.id ? 'ph-selmenu-dot-on' : ''}`}
            style={{ background: c.solid }}
            onClick={() => onColor(c.id)}
            aria-label={c.label}
            aria-pressed={annotation.color === c.id}
          />
        ))}
      </div>

      <textarea
        value={text}
        maxLength={2000}
        placeholder="Add a comment…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          }
        }}
      />

      <div className="ph-annpop-actions">
        <button
          type="button"
          className="ph-btn ph-annpop-delete"
          onClick={() => {
            latest.current.deleted = true;
            onDelete();
            onClose();
          }}
        >
          <Trash2 size={13} /> Delete
        </button>
        <button type="button" className="ph-btn ph-btn-primary" onClick={save}>
          <Check size={13} /> Done
        </button>
      </div>
    </div>,
    document.body
  );
}

export default AnnotationPopover;