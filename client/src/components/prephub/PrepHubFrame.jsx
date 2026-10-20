import { useEffect } from 'react';
import { useZen } from './zenStore.js';

export default function PrepHubFrame({ children }) {
  const [zen, setZen] = useZen();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setZen(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); setZen(false); };
  }, [setZen]);

  return <div className={`ph-fullscreen${zen ? ' ph-zen' : ''}`}>{children}</div>;
}