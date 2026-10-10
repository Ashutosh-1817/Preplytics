// Single global key — correct because the backend only ever allows one
// active session per user at a time, regardless of node.
const KEY = 'preplytics_active_session';

export const readActiveSession = () => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const writeActiveSession = (sessionId, nodeId, startedAt) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sessionId, nodeId, startedAt }));
  } catch {
    // localStorage unavailable (private browsing, quota) — degrade
    // silently, the backend remains the source of truth either way
  }
};

export const clearActiveSession = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};