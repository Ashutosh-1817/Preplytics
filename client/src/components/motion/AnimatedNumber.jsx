import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from './motionPresets.js';

const defaultFormat = (n) => String(Math.round(n));

// Counts up from 0 to `value`. Writes straight to the DOM, so it never
// re-renders React on every frame.
function AnimatedNumber({ value, format = defaultFormat, duration = 1.2, delay = 0, className }) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    if (reduceMotion) {
      node.textContent = format(value);
      return undefined;
    }

    const controls = animate(0, value, {
      duration,
      delay,
      ease: EASE_OUT,
      onUpdate: (v) => {
        node.textContent = format(v);
      },
    });
    return () => controls.stop();
    // `format` is intentionally left out: callers pass inline functions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, delay, reduceMotion]);

  return (
    <span ref={ref} className={className}>
      {format(0)}
    </span>
  );
}

export default AnimatedNumber;