

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


// ---------- Whole-goal flow (Phase 1) ----------

export const generateSubjects = (goalId, context = '') =>
  api
    .post(`/goals/${goalId}/ai-syllabus/subjects`, { context }, { timeout: AI_TIMEOUT_MS })
    .then((r) => r.data.data);

export const expandSubject = (goalId, payload) =>
  api
    .post(`/goals/${goalId}/ai-syllabus/subject-breakdown`, payload, { timeout: 60000 })
    .then((r) => r.data.data);

export const bulkInsertGoalSyllabus = (goalId, subjects) =>
  api.post(`/goals/${goalId}/bulk-subjects`, { subjects }).then((r) => r.data.data);

export const saveSubjectRoadmap = (goalId, nodeId, chapters) =>
  api.post(`/goals/${goalId}/nodes/${nodeId}/roadmap`, { chapters }).then((r) => r.data.data);

export const saveSubjectList = (goalId, subjects) =>
  api.post(`/goals/${goalId}/subject-list`, { subjects }).then((r) => r.data.data);