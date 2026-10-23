import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Underline, MessageSquarePlus, Copy, Check, X } from 'lucide-react';
import { ANNOTATION_COLORS } from './annotationConfig.js';

const MENU_W = 244;

// Floating menu shown over a text selection. `sel` is a snapshot of the selection,
// so the menu keeps working even after the browser drops the highlight (e.g. when typing a comment).
function SelectionMenu({ sel, onHighlight, onUnderline, onComment, onCopy, onClose }) {
  const ref = useRef(null);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');

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

  const half = (composing ? 150 : MENU_W / 2) + 8;
  const left = Math.min(window.innerWidth - half, Math.max(half, sel.anchor.x));
  const roomBelow = window.innerHeight - sel.anchor.below > (composing ? 150 : 60);
  const style = roomBelow
    ? { left, top: sel.anchor.below + 8 }
    : { left, top: sel.anchor.above - 8, transform: 'translate(-50%, -100%)' };

  const submitComment = () => {
    if (text.trim()) onComment(text.trim());
  };

  return createPortal(
    <div
      ref={ref}
      className="ph-selmenu"
      style={style}
      // Keep the text selection alive while clicking the menu (not the textarea)
      onMouseDown={(e) => {
        if (e.target.tagName !== 'TEXTAREA') e.preventDefault();
      }}
      role="toolbar"
      aria-label="Annotate selection"
    >
      {composing ? (
        <div className="ph-selmenu-compose">
          <textarea
            autoFocus
            value={text}
            maxLength={2000}
            placeholder="Add a comment…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitComment();
              }
            }}
          />
          <div className="ph-selmenu-actions">
            <button type="button" className="ph-btn" onClick={() => setComposing(false)}>
              <X size={13} /> Cancel
            </button>
            <button type="button" className="ph-btn ph-btn-primary" onClick={submitComment} disabled={!text.trim()}>
              <Check size={13} /> Save
            </button>
          </div>
        </div>
      ) : (
        <div className="ph-selmenu-row">
          {ANNOTATION_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="ph-selmenu-dot"
              style={{ background: c.solid }}
              onClick={() => onHighlight(c.id)}
              aria-label={`Highlight ${c.label}`}
              title={`Highlight ${c.label}`}
            />
          ))}
          <span className="ph-selmenu-sep" aria-hidden="true" />
          <button type="button" className="ph-selmenu-btn" onClick={onUnderline} aria-label="Underline" title="Underline">
            <Underline size={15} />
          </button>
          <button type="button" className="ph-selmenu-btn" onClick={() => setComposing(true)} aria-label="Add comment" title="Highlight with a comment">
            <MessageSquarePlus size={15} />
          </button>
          <button type="button" className="ph-selmenu-btn" onClick={onCopy} aria-label="Copy text" title="Copy text">
            <Copy size={15} />
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}

export default SelectionMenu;