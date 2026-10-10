// src/services/calendar.api.js

import api from './api.js';

export const fetchCalendar = (goalId, startDate, endDate) =>
  api
    .get(`/goals/${goalId}/schedule/calendar`, { params: { startDate, endDate } })
    .then((r) => r.data.data.tasks);

export const updateTaskStatus = (taskId, status) =>
  api.patch(`/tasks/${taskId}/status`, { status }).then((r) => r.data.data.task);