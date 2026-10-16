import api from './api.js';

// force = true closes a session that is already running (its time is saved)
// and starts this one. Without it, a running session makes the server answer
// 409; use getSessionConflict(err) to read which session is running.
export const startSession = (nodeId, { force = false } = {}) =>
  api.post('/sessions/start', { nodeId, force }).then((r) => r.data.data.session);

export const stopSession = (sessionId) => api.post('/sessions/stop', { sessionId }).then((r) => r.data.data);
export const logManualSession = (payload) => api.post('/sessions/manual', payload).then((r) => r.data.data.session);

// Finished sessions only. It can never return a timer that is still running.
export const fetchSessions = (params = {}) => api.get('/sessions', { params }).then((r) => r.data.data.sessions);

// The timer that is running right now, or null:
// { sessionId, goalId, goalTitle, nodeId, nodeTitle, startedAt, elapsedMinutes }
// goalTitle / nodeTitle are null if that goal or topic was deleted.
export const fetchActiveSession = () => api.get('/sessions/active').then((r) => r.data.data.session);

export const deleteSession = (sessionId) => api.delete(`/sessions/${sessionId}`);
export const resetNodeSessions = (nodeId) => api.delete(`/sessions/node/${nodeId}/reset`);

// If this error is "a session is already running", returns that session's
// details (same shape as fetchActiveSession). Otherwise returns null.
export const getSessionConflict = (err) => {
  const body = err?.response?.data?.error;
  if (err?.response?.status === 409 && body?.code === 'SESSION_ALREADY_RUNNING') {
    return body.details?.activeSession ?? null;
  }
  return null;
};