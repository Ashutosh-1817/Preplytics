

import api from './api.js';

export const fetchSearchUsage = () => api.get('/search/usage').then((r) => r.data.data);

// Returns { search, cached }
export const runSearch = (payload) =>
  api.post('/search', payload, { timeout: 45000 }).then((r) => r.data.data);

export const summarizeSearch = (searchId, regenerate = false) =>
  api.post(`/search/${searchId}/summary`, { regenerate }, { timeout: 60000 }).then((r) => r.data.data.search);

export const fetchSearchHistory = () => api.get('/search/history').then((r) => r.data.data.history);
export const fetchSearch = (searchId) => api.get(`/search/${searchId}`).then((r) => r.data.data.search);
export const deleteSearch = (searchId) => api.delete(`/search/${searchId}`);