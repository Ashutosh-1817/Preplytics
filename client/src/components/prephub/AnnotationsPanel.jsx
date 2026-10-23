import { useMemo, useState } from 'react';
import { X, Trash2, Pencil, Highlighter, Underline, BoxSelect, MessageSquare } from 'lucide-react';
import { colorOf } from './annotationConfig.js';

const TYPE_ICON = { highlight: Highlighter, underline: Underline, area: BoxSelect };

// All annotations of the open PDF, grouped by page. Floats over the reader's right edge.
function AnnotationsPanel({ items, status, onJump, onEdit, onDelete, onClose }) {
  const [filter, setFilter] = useState('all'); // all | comments

  const shown = useMemo(() => {
    const list = filter === 'comments' ? items.filter((a) => a.comment) : items;
    return [...list].sort((a, b) => a.page - b.page || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0));
  }, [items, filter]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const a of shown) {
      if (!map.has(a.page)) map.set(a.page, []);
      map.get(a.page).push(a);
    }
    return [...map.entries()];
  }, [shown]);

  const commentCount = useMemo(() => items.filter((a) => a.comment).length, [items]);

  return (
    <aside className="ph-annpanel" aria-label="Annotations">
      <header className="ph-annpanel-head">
        <h3>Annotations</h3>
        <button type="button" className="ph-icon-btn" onClick={onClose} aria-label="Close annotations">
          <X size={15} />
        </button>
      </header>

      <div className="ph-annpanel-filters" role="tablist">
        <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>
          All <span>{items.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={filter === 'comments'} className={filter === 'comments' ? 'is-on' : ''} onClick={() => setFilter('comments')}>
          With comments <span>{commentCount}</span>
        </button>
      </div>

      <div className="ph-annpanel-list">
        {status === 'loading' && <div className="skeleton" style={{ height: 64 }} />}
        {status === 'error' && <p className="ph-muted">Annotations could not be loaded.</p>}
        {status !== 'loading' && groups.length === 0 && (
          <p className="ph-annpanel-empty">
            {filter === 'comments'
              ? 'No comments yet. Select text, choose the comment icon, and your notes will collect here.'
              : 'Nothing marked yet. Select text in the PDF to highlight it, or use the box tool for diagrams.'}
          </p>
        )}

        {groups.map(([page, list]) => (
          <section key={page} className="ph-annpanel-group">
            <h4>Page {page}</h4>
            {list.map((a) => {
              const Icon = TYPE_ICON[a.type] || Highlighter;
              return (
                <div key={a._key} className="ph-annitem" style={{ '--ann-solid': colorOf(a.color).solid }}>
                  <button type="button" className="ph-annitem-main" onClick={() => onJump(a)}>
                    <Icon size={13} className="ph-annitem-icon" aria-hidden="true" />
                    <span className="ph-annitem-text">
                      {a.type === 'area' ? <em>Marked area</em> : a.quote ? `“${a.quote}”` : <em>Highlighted text</em>}
                      {a.comment && (
                        <span className="ph-annitem-comment">
                          <MessageSquare size={11} aria-hidden="true" /> {a.comment}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="ph-annitem-actions">
                    <button type="button" className="ph-icon-btn" onClick={() => onEdit(a)} aria-label="Edit" title="Edit or comment">
                      <Pencil size={13} />
                    </button>
                    <button type="button" className="ph-icon-btn" onClick={() => onDelete(a._key)} aria-label="Delete" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </aside>
  );
}

export default AnnotationsPanel;