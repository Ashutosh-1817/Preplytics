
import api from './api.js';

export const startSession = (nodeId) => api.post('/sessions/start', { nodeId }).then((r) => r.data.data.session);
export const stopSession = (sessionId) => api.post('/sessions/stop', { sessionId }).then((r) => r.data.data);
export const logManualSession = (payload) => api.post('/sessions/manual', payload).then((r) => r.data.data.session);
export const fetchSessions = (params = {}) => api.get('/sessions', { params }).then((r) => r.data.data.sessions);
export const deleteSession = (sessionId) => api.delete(`/sessions/${sessionId}`);
export const resetNodeSessions = (nodeId) => api.delete(`/sessions/node/${nodeId}/reset`);