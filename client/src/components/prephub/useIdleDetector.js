import { useEffect, useRef } from 'react';

// Calls onIdle(lastActivityTimestamp) once when there has been no mouse,
// keyboard, touch or scroll activity for idleMs. Also catches the case where
// the computer slept: the first activity after a long gap reports the gap.
function useIdleDetector({ enabled, idleMs, onIdle }) {
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  });

  useEffect(() => {
    if (!enabled) return undefined;

    let last = Date.now();
    let fired = false;

    const fire = () => {
      fired = true;
      onIdleRef.current?.(last);
    };

    const mark = () => {
      const now = Date.now();
      if (!fired && now - last >= idleMs) {
        fire(); // the gap itself was the idle time
        return;
      }
      last = now;
      fired = false;
    };

    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
    events.forEach((name) => window.addEventListener(name, mark, { passive: true }));
    document.addEventListener('scroll', mark, { capture: true, passive: true });

    const interval = setInterval(() => {
      if (!fired && Date.now() - last >= idleMs) fire();
    }, 15000);

    return () => {
      events.forEach((name) => window.removeEventListener(name, mark));
      document.removeEventListener('scroll', mark, { capture: true });
      clearInterval(interval);
    };
  }, [enabled, idleMs]);
}

export default useIdleDetector;