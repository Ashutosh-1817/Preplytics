import api from './api.js';

export const fetchNotes = (params = {}) => api.get('/notes', { params }).then((r) => r.data.data.notes);
export const fetchNote = (noteId) => api.get(`/notes/${noteId}`).then((r) => r.data.data.note);
export const createNote = (payload) => api.post('/notes', payload).then((r) => r.data.data.note);
export const updateNote = (noteId, payload) => api.patch(`/notes/${noteId}`, payload).then((r) => r.data.data.note);
export const deleteNote = (noteId) => api.delete(`/notes/${noteId}`);