import api from './api.js';

export const fetchGoals = () => api.get('/goals').then((r) => r.data.data.goals);
export const fetchGoal = (goalId) => api.get(`/goals/${goalId}`).then((r) => r.data.data.goal);
export const createGoal = (payload) => api.post('/goals', payload).then((r) => r.data.data.goal);
export const updateGoal = (goalId, payload) => api.patch(`/goals/${goalId}`, payload).then((r) => r.data.data.goal);
export const deleteGoal = (goalId) => api.delete(`/goals/${goalId}`);

export const fetchRoadmapTree = (goalId) => api.get(`/goals/${goalId}/nodes`).then((r) => r.data.data.tree);
export const createNode = (goalId, payload) => api.post(`/goals/${goalId}/nodes`, payload).then((r) => r.data.data.node);
export const updateNode = (nodeId, payload) => api.patch(`/nodes/${nodeId}`, payload).then((r) => r.data.data.node);
export const deleteNode = (nodeId) => api.delete(`/nodes/${nodeId}`);

export const generateSchedule = (goalId) => api.post(`/goals/${goalId}/schedule/generate`).then((r) => r.data.data);
export const regenerateSchedule = (goalId) => api.post(`/goals/${goalId}/schedule/regenerate`).then((r) => r.data.data);