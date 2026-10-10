

import api from './api.js';

const AI_TIMEOUT_MS = 45000;

export const generateChapters = (goalId, subject, context) =>
  api
    .post(`/goals/${goalId}/ai-syllabus/chapters`, { subject, context }, { timeout: AI_TIMEOUT_MS })
    .then((r) => r.data.data);

export const expandChapter = (goalId, payload) =>
  api
    .post(`/goals/${goalId}/ai-syllabus/expand`, payload, { timeout: AI_TIMEOUT_MS })
    .then((r) => r.data.data);

export const bulkInsertSyllabus = (goalId, subject, chapters) =>
  api.post(`/goals/${goalId}/bulk-nodes`, { subject, chapters }).then((r) => r.data.data);

export const fetchCapacity = (goalId) =>
  api.get(`/goals/${goalId}/schedule/capacity`).then((r) => r.data.data);