// A topic's timer normally stops when its screen unmounts. Moving between the
// roadmap and PrepHub for the SAME topic must not cut the session in two (the
// leftover fragment would even be discarded as "too short"), so the navigating
// button marks a one-shot handoff and the timer being unmounted respects it.

const HANDOFF_TTL_MS = 15000; // long enough for a lazy-loaded page on a slow connection

let handoffNodeId = null;
let expiryTimer = null;

export const markSessionHandoff = (nodeId) => {
  handoffNodeId = nodeId;
  clearTimeout(expiryTimer);
  expiryTimer = setTimeout(() => {
    handoffNodeId = null;
  }, HANDOFF_TTL_MS);
};

// True once if a handoff was marked for this topic
export const consumeSessionHandoff = (nodeId) => {
  if (handoffNodeId !== nodeId) return false;
  clearSessionHandoff();
  return true;
};

export const clearSessionHandoff = () => {
  handoffNodeId = null;
  clearTimeout(expiryTimer);
};