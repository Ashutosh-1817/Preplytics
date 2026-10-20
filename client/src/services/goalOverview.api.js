import api from './api.js';

// Returns { status, data, generatedAt }. Free when a briefing already exists
// and regenerate is false (the server just returns the saved one).
export const generateOverview = (goalId, regenerate = false) =>
  api
    .post(`/goals/${goalId}/overview`, { regenerate }, { timeout: 60000 })
    .then((r) => r.data.data.overview);