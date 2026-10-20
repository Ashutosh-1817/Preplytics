import api from './api.js';

export const fetchWrapped = ({ goalId, range, tz }) =>
  api
    .get('/wrapped', { params: { ...(goalId ? { goalId } : {}), range, tz }, timeout: 30000 })
    .then((r) => r.data.data);

export const generateWrappedNarrative = ({ goalId, range, tz, force = false }) =>
  api
    .post('/wrapped/narrative', { ...(goalId ? { goalId } : {}), range, tz, force }, { timeout: 90000 })
    .then((r) => r.data.data);