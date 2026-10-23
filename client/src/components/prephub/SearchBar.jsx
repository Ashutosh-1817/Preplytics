import { useEffect, useRef } from 'react';
import { Search, ChevronUp, ChevronDown, X, Loader2 } from 'lucide-react';

// Find-in-PDF bar, floating over the top-right of the reader (it never moves the pages)
function SearchBar({ query, onQuery, count, current, indexing, indexed, total, capped, focusTick, onNext, onPrev, onClose }) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusTick]);

  const hasQuery = query.trim().length >= 2;
  let status = '';
  if (hasQuery) status = count === 0 ? (indexing ? 'Searching…' : 'No matches') : `${current + 1} of ${count}${capped ? '+' : ''}`;

  return (
    <div className="ph-find" role="search">
      <Search size={14} className="ph-find-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Find in this PDF"
        aria-label="Find in this PDF"
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <span className="ph-find-status" aria-live="polite">
        {indexing && total > 0 && <Loader2 size={12} className="ph-spin" aria-label={`Reading pages ${indexed} of ${total}`} />}
        {status}
      </span>
      <button type="button" className="ph-icon-btn" onClick={onPrev} disabled={count === 0} aria-label="Previous match" title="Previous (Shift+Enter)">
        <ChevronUp size={15} />
      </button>
      <button type="button" className="ph-icon-btn" onClick={onNext} disabled={count === 0} aria-label="Next match" title="Next (Enter)">
        <ChevronDown size={15} />
      </button>
      <button type="button" className="ph-icon-btn" onClick={onClose} aria-label="Close search" title="Close (Esc)">
        <X size={15} />
      </button>
    </div>
  );
}

export default SearchBar;