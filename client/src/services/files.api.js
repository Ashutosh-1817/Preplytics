

import axios from 'axios'; // plain axios on purpose: Cloudinary must NOT receive our auth token or cookies
import api from './api.js';

export const getErrorMessage = (err, fallback = 'Something went wrong.') => {
  if (err?.code === 'ERR_CANCELED') return 'Cancelled';
  const body = err?.response?.data?.error; // our API and Cloudinary both use { error: { message } }
  return body?.details?.[0]?.message || body?.message || err?.message || fallback;
};

export const fetchFiles = (params = {}) => api.get('/files', { params }).then((r) => r.data.data.files);
export const fetchFile = (fileId) => api.get(`/files/${fileId}`).then((r) => r.data.data.file);
export const deleteFile = (fileId) => api.delete(`/files/${fileId}`);
export const retryExtraction = (fileId) => api.post(`/files/${fileId}/reextract`).then((r) => r.data.data.file);

export const fetchFileBlob = (fileId) =>
  api.get(`/files/${fileId}/content`, { responseType: 'blob' }).then((r) => r.data);

export const downloadFileToDisk = async (file) => {
  const blob = await fetchFileBlob(file._id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

// signature -> direct upload to Cloudinary -> confirm
export const uploadFile = async (
  file,
  { goalId = null, nodeId = null, noteId = null, signal, onProgress } = {}
) => {
  const sig = await api
    .post('/files/signature', { fileName: file.name, mimeType: file.type, fileSize: file.size }, { signal })
    .then((r) => r.data.data);

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', sig.timestamp);
  form.append('signature', sig.signature);
  form.append('public_id', sig.publicId);

  await axios.post(`https://api.cloudinary.com/v1_1/${sig.cloudName}/${sig.resourceType}/upload`, form, {
    signal,
    onUploadProgress: (e) => {
      if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100));
    },
  });

  return api
    .post(
      '/files/confirm',
      { cloudinaryPublicId: sig.publicId, fileName: file.name, mimeType: file.type, goalId, nodeId, noteId },
      { signal }
    )
    .then((r) => r.data.data.file);
};