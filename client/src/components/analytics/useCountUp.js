import { useEffect, useState } from 'react';
import { useReducedMotion } from './chartKit.jsx';

// Eases a number from 0 to `target` once per change. Reduced-motion users get the final value immediately.
export default function useCountUp(target, duration = 900) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced || !Number.isFinite(target) ? target : 0);

  useEffect(() => {
    if (reduced || !Number.isFinite(target)) {
      setValue(target);
      return undefined;
    }
    let raf;
    let start;
    const tick = (t) => {
      if (start === undefined) start = t;
      const p = Math.min(1, (t - start) / duration);
      setValue(target * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);

  return Math.round(value);
}
