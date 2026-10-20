import api from './api.js';

export const fetchAnalytics = ({ goalId, range, tz }) =>
  api
    .get('/analytics/overview', {
      params: { ...(goalId ? { goalId } : {}), range, tz },
      timeout: 30000,
    })
    .then((r) => r.data.data);