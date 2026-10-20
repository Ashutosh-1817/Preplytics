import api from './api.js';

// { node, goal, breadcrumb, position, prev, next, schedule, stats }
export const fetchPrepHub = (nodeId) =>
  api
    .get(`/prephub/${nodeId}`, {
      params: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
    })
    .then((r) => r.data.data);

// Reads the conflict details from a note save that was refused with a 409
export const isNoteConflict = (err) =>
  err?.response?.status === 409 && err?.response?.data?.error?.code === 'NOTE_CONFLICT';