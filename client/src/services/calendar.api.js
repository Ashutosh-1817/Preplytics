// src/services/calendar.api.js

import api from './api.js';

export const fetchCalendar = (goalId, startDate, endDate) =>
  api
    .get(`/goals/${goalId}/schedule/calendar`, { params: { startDate, endDate } })
    .then((r) => r.data.data.tasks);

export const updateTaskStatus = (taskId, status) =>
  api.patch(`/tasks/${taskId}/status`, { status }).then((r) => r.data.data.task);

// Topics from past days that were never completed (preview only, writes nothing)
export const fetchCatchUp = (goalId) =>
  api.get(`/goals/${goalId}/schedule/catch-up`).then((r) => r.data.data);

// Re-spreads every unfinished topic over the days that are left
export const regenerateSchedule = (goalId) =>
  api.post(`/goals/${goalId}/schedule/regenerate`).then((r) => r.data.data);