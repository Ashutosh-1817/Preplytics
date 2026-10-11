

import api from './api.js';

export const fetchNotifications = () => api.get('/notifications').then((r) => r.data.data);
export const fetchUnreadCount = () => api.get('/notifications/unread-count').then((r) => r.data.data.unreadCount);
export const markNotificationRead = (id) => api.patch(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.patch('/notifications/read-all');
export const deleteNotification = (id) => api.delete(`/notifications/${id}`);
export const updateNotificationPreferences = (prefs) =>
  api.patch('/notifications/preferences', prefs).then((r) => r.data.data.preferences);
export const triggerReminderSweep = () => api.post('/notifications/trigger-test').then((r) => r.data.data);