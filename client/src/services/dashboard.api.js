import api from './api.js';

export const fetchOverview = () => api.get('/dashboard/overview').then((r) => r.data.data);
export const fetchStreak = () => api.get('/dashboard/streak').then((r) => r.data.data);
export const fetchHeatmap = () => api.get('/dashboard/heatmap').then((r) => r.data.data.heatmap);
export const fetchTodayTasks = () => api.get('/tasks/today').then((r) => r.data.data.tasks);