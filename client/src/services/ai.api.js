
import api from './api.js';

export const askAi = (payload) => api.post('/ai/ask', payload).then((r) => r.data.data);
export const saveAiResultAsNote = (payload) => api.post('/ai/save-as-note', payload).then((r) => r.data.data.note);
export const fetchConversations = () => api.get('/ai/conversations').then((r) => r.data.data.conversations);
export const fetchConversationById = (id) => api.get(`/ai/conversations/${id}`).then((r) => r.data.data.conversation);