import { Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

// A drop-in replacement for the native <select>. Use it with plain <option> children:
//   <Select value={x} onChange={(e) => setX(e.target.value)}> <option value="a">A</option> ... </Select>
// The open list is drawn by the app (not the browser), so it looks the same everywhere.

const labelOf = (node) => Children.toArray(node).join('');

function readOptions(children) {
  const out = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement(child) || child.type !== 'option') return;
    const label = labelOf(child.props.children);
    out.push({
      value: String(child.props.value ?? label),
      label,
      disabled: Boolean(child.props.disabled),
    });
  });
  return out;
}

function Select({ value, onChange, children, className = '', variant = 'field', disabled = false, placeholder = 'Select', id, 'aria-label': ariaLabel }) {
  const options = useMemo(() => readOptions(children), [children]);
  const current = String(value ?? '');
  const selectedIndex = options.findIndex((o) => o.value === current);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);

  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const typeahead = useRef({ text: '', timer: null });
  const listId = useId();

  const close = useCallback(() => setOpen(false), []);

  const openList = () => {
    if (disabled || options.length === 0) return;
    setActive(selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled));
    setOpen(true);
  };

  const choose = (index) => {
    const opt = options[index];
    if (!opt || opt.disabled) return;
    setOpen(false);
    triggerRef.current?.focus();
    if (opt.value !== current) onChange?.({ target: { value: opt.value } });
  };

  // Place the list under the button, or above it when there is no room below.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const longest = options.reduce((m, o) => Math.max(m, o.label.length), 0);
    const width = Math.min(Math.max(rect.width, longest * 8 + 64), 400, vw - 16);
    const left = Math.max(8, Math.min(rect.left, vw - width - 8));
    const below = vh - rect.bottom - 14;
    const above = rect.top - 14;
    const wanted = Math.min(options.length * 40 + 12, 320);
    const placeAbove = below < Math.min(wanted, 180) && above > below;
    setPos({
      left,
      width,
      maxHeight: Math.max(120, Math.min(320, placeAbove ? above : below)),
      ...(placeAbove ? { bottom: vh - rect.top + 6 } : { top: rect.bottom + 6 }),
      above: placeAbove,
    });
  }, [open, options]);

  // Close on outside click, resize, or when something behind it scrolls.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onScroll = (e) => {
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close]);

  // Keep the highlighted row in view while using the arrow keys.
  useEffect(() => {
    if (!open || !popRef.current) return;
    popRef.current.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active, pos]);

  const move = (dir) => {
    if (!options.length) return;
    let next = active;
    for (let i = 0; i < options.length; i += 1) {
      next = (next + dir + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    setActive(next);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'Home': e.preventDefault(); setActive(options.findIndex((o) => !o.disabled)); break;
      case 'End': e.preventDefault(); setActive(options.length - 1 - [...options].reverse().findIndex((o) => !o.disabled)); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
      case 'Tab': close(); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const t = typeahead.current;
          clearTimeout(t.timer);
          t.text += e.key.toLowerCase();
          t.timer = setTimeout(() => { t.text = ''; }, 600);
          const hit = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(t.text));
          if (hit >= 0) setActive(hit);
        }
    }
  };

  return (
    <div className={`ui-select ui-select--${variant} ${open ? 'is-open' : ''} ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="ui-select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={handleKeyDown}
      >
        <span className={`ui-select-value ${selected ? '' : 'is-placeholder'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className="ui-select-chevron" size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          id={listId}
          role="listbox"
          className={`ui-select-pop ${pos.above ? 'is-above' : ''}`}
          style={{ left: pos.left, width: pos.width, maxHeight: pos.maxHeight, top: pos.top, bottom: pos.bottom }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((opt, i) => (
            <div
              key={`${opt.value}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === selectedIndex}
              aria-disabled={opt.disabled || undefined}
              data-active={i === active}
              title={opt.label}
              className={`ui-select-opt ${i === selectedIndex ? 'is-selected' : ''} ${i === active ? 'is-active' : ''} ${opt.disabled ? 'is-disabled' : ''}`}
              onMouseEnter={() => !opt.disabled && setActive(i)}
              onClick={() => choose(i)}
            >
              <span className="ui-select-opt-label">{opt.label}</span>
              {i === selectedIndex && <Check size={15} strokeWidth={2.6} aria-hidden="true" />}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default Select;