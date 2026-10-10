

import { useEffect } from 'react';

// While any PDF is still being read, refresh the list every few seconds
function usePendingPoll(files, reload, intervalMs = 3000) {
  const hasPending = !!files?.some((f) => f.extractionStatus === 'pending');

  useEffect(() => {
    if (!hasPending) return undefined;
    const id = setInterval(reload, intervalMs);
    return () => clearInterval(id);
  }, [hasPending, reload, intervalMs]);
}

export default usePendingPoll;