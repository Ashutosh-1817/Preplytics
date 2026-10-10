// src/hooks/useDebounce.js
import { useRef, useEffect, useCallback } from 'react';

function useDebounce(fn, delay) {
  const fnRef = useRef(fn);

  // Keep the latest function reference updated without triggering re-renders
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const timeoutRef = useRef(null);

  return useCallback((...args) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      fnRef.current(...args);
    }, delay);
  }, [delay]);
}

export default useDebounce;