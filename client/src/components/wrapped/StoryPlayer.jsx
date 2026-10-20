import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pause } from 'lucide-react';
import { EASE_OUT } from '../motion/motionPresets.js';

const THEMES = [
  { bg: 'linear-gradient(160deg,#120B33 0%,#2B1B6B 55%,#4B3BC4 120%)', orbs: ['#6C5CE7', '#00CEC9'] }, // intro
  { bg: 'linear-gradient(160deg,#061C26 0%,#0B4F57 70%,#0E7C7B 130%)', orbs: ['#00CEC9', '#6C5CE7'] }, // time
  { bg: 'linear-gradient(160deg,#2A1204 0%,#6B3209 70%,#9A4A0C 130%)', orbs: ['#F59E0B', '#FF7675'] }, // rhythm
  { bg: 'linear-gradient(160deg,#2B0A12 0%,#6F1A2D 70%,#9B2640 130%)', orbs: ['#FF7675', '#F59E0B'] }, // streak
  { bg: 'linear-gradient(160deg,#0A1B33 0%,#173F78 70%,#1F58A8 130%)', orbs: ['#3B82F6', '#00CEC9'] }, // subjects
  { bg: 'linear-gradient(160deg,#08261B 0%,#0D5A40 70%,#0F7A56 130%)', orbs: ['#10B981', '#00CEC9'] }, // estimates
  { bg: 'linear-gradient(160deg,#1B0B33 0%,#4A2388 70%,#6A33C0 130%)', orbs: ['#A855F7', '#6C5CE7'] }, // progress
  { bg: 'linear-gradient(160deg,#0E1028 0%,#222862 70%,#2F3890 130%)', orbs: ['#6C5CE7', '#10B981'] }, // verdict
];

const slideVariants = {
  enter: (dir) => ({ opacity: 0, x: dir > 0 ? 56 : -56, scale: 0.985 }),
  center: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.45, ease: EASE_OUT } },
  exit: (dir) => ({ opacity: 0, x: dir > 0 ? -56 : 56, scale: 0.985, transition: { duration: 0.28, ease: 'easeIn' } }),
};

const HOLD_MS = 260;
const INTERACTIVE = 'button, a, input, select, textarea, [data-no-nav]';

// slides: [{ id, theme, durationMs | null, render: ({ next, prev }) => node }]
// durationMs null = waits for a tap (intro, verdict, summary)
function StoryPlayer({ slides, onIndexChange }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [showPaused, setShowPaused] = useState(false);

  const progress = useMotionValue(0);
  const indexRef = useRef(0);
  const heldRef = useRef(false);
  const hiddenRef = useRef(false);
  const pressRef = useRef(null);
  const holdTimerRef = useRef(null);

  const goTo = useCallback(
    (target) => {
      const next = Math.max(0, Math.min(slides.length - 1, target));
      if (next === indexRef.current) return;
      setDir(next > indexRef.current ? 1 : -1);
      indexRef.current = next;
      progress.set(0);
      setIndex(next);
    },
    [slides.length, progress]
  );

  const next = useCallback(() => goTo(indexRef.current + 1), [goTo]);
  const prev = useCallback(() => goTo(indexRef.current - 1), [goTo]);

  useEffect(() => {
    onIndexChange?.(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Auto-advance clock: paused while holding or when the tab is hidden
  useEffect(() => {
    const duration = slides[index]?.durationMs;
    if (!duration || reduceMotion) return undefined;

    let raf;
    let last = performance.now();

    const tick = (now) => {
      const dt = now - last;
      last = now;

      if (!heldRef.current && !hiddenRef.current) {
        const value = progress.get() + dt / duration;
        if (value >= 1) {
          progress.set(1);
          if (indexRef.current < slides.length - 1) goTo(indexRef.current + 1);
          return; // effect restarts for the next slide
        }
        progress.set(value);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, slides, reduceMotion, progress, goTo]);

  useEffect(() => {
    const onVisibility = () => {
      hiddenRef.current = document.hidden;
    };
    const onKey = (e) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKey);
      clearTimeout(holdTimerRef.current);
    };
  }, [next, prev]);

  // Tap left/right edges to navigate, press-and-hold to pause
  const onPointerDown = (e) => {
    if (e.target.closest(INTERACTIVE)) return;
    pressRef.current = { t: performance.now() };
    heldRef.current = true;
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => setShowPaused(true), HOLD_MS);
  };

  const release = (e, cancelled) => {
    const press = pressRef.current;
    pressRef.current = null;
    heldRef.current = false;
    clearTimeout(holdTimerRef.current);
    setShowPaused(false);
    if (!press || cancelled) return;

    if (performance.now() - press.t < HOLD_MS) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      goTo(indexRef.current + (x < rect.width * 0.3 ? -1 : 1));
    }
  };

  const slide = slides[index];
  const theme = THEMES[(slide.theme ?? index) % THEMES.length];
  const isLast = index === slides.length - 1;

  return (
    <div
      className="wr-stage"
      role="region"
      aria-label="Preplytics Wrapped"
      onPointerDown={onPointerDown}
      onPointerUp={(e) => release(e, false)}
      onPointerLeave={(e) => release(e, true)}
      onPointerCancel={(e) => release(e, true)}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={`bg-${index}`}
          className="wr-bg"
          style={{ background: theme.bg }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0.999, transition: { duration: 0.7 } }}
          transition={{ duration: 0.7 }}
        >
          {theme.orbs.map((color, i) => (
            <motion.span
              key={color}
              className="wr-orb"
              style={{ background: color, ...(i === 0 ? { top: '-12%', left: '-18%' } : { bottom: '-14%', right: '-20%' }) }}
              animate={reduceMotion ? undefined : { x: [0, 34, -22, 0], y: [0, -26, 20, 0], scale: [1, 1.12, 0.96, 1] }}
              transition={{ duration: 14 + i * 4, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}
          <span className="wr-grain" />
        </motion.div>
      </AnimatePresence>

      <div className="wr-top">
        <div className="wr-segments">
          {slides.map((s, i) => {
            let fill;
            if (reduceMotion) fill = i <= index ? 1 : 0;
            else if (i < index) fill = 1;
            else if (i > index) fill = 0;
            else fill = s.durationMs ? progress : i === slides.length - 1 ? 1 : 0;

            return (
              <div key={s.id} className="wr-seg">
                <motion.div className="wr-seg-fill" style={{ scaleX: fill, originX: 0 }} />
              </div>
            );
          })}
        </div>
        <div className="wr-top-row">
          <span className="wr-brand-mini">Preplytics</span>
          <AnimatePresence>
            {showPaused && (
              <motion.span
                className="wr-paused"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <Pause size={12} /> Paused
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence initial={false} custom={dir}>
        <motion.div
          key={slide.id}
          className="wr-slide"
          custom={dir}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
        >
          {slide.render({ next, prev })}
        </motion.div>
      </AnimatePresence>

      <div className="wr-nav">
        <motion.button
          type="button"
          className="wr-nav-btn"
          onClick={prev}
          disabled={index === 0}
          aria-label="Previous slide"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronLeft size={18} />
        </motion.button>
        <motion.button
          type="button"
          className="wr-nav-btn"
          onClick={next}
          disabled={isLast}
          aria-label="Next slide"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronRight size={18} />
        </motion.button>
      </div>
    </div>
  );
}

export default StoryPlayer;