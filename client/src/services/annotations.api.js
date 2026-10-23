import api from './api.js';

export const fetchAnnotations = (fileId) =>
  api.get('/annotations', { params: { fileId } }).then((r) => r.data.data.annotations);

export const createAnnotation = (payload) =>
  api.post('/annotations', payload).then((r) => r.data.data.annotation);

export const updateAnnotation = (id, payload) =>
  api.patch(`/annotations/${id}`, payload).then((r) => r.data.data.annotation);

export const deleteAnnotation = (id) => api.delete(`/annotations/${id}`).then(() => true);