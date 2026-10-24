import axios from 'axios'; // plain axios on purpose: Cloudinary must NOT receive our auth token or cookies
import api, { setAccessToken } from './api.js';

export const fetchProfile = () => api.get('/profile').then((r) => r.data.data);

export const updateProfile = (patch) => api.patch('/profile', patch).then((r) => r.data.data.user);

export const removeAvatar = () => api.delete('/profile/avatar').then((r) => r.data.data.user);

// signature -> direct upload to Cloudinary -> save the address
export const uploadAvatar = async (file) => {
  const sig = await api.post('/profile/avatar/signature').then((r) => r.data.data);

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', sig.timestamp);
  form.append('signature', sig.signature);
  form.append('public_id', sig.publicId);
  form.append('overwrite', 'true');
  form.append('invalidate', 'true');

  const uploaded = await axios
    .post(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, form)
    .then((r) => r.data);

  return api.put('/profile/avatar', { url: uploaded.secure_url }).then((r) => r.data.data.user);
};

// Other devices are signed out; this one gets a fresh access token
export const changePassword = async (currentPassword, newPassword) => {
  const { data } = await api.post('/auth/change-password', { currentPassword: currentPassword || undefined, newPassword });
  setAccessToken(data.data.accessToken);
};

export const logoutAllDevices = () => api.post('/auth/logout-all');

export const deleteAccount = (password, confirm) =>
  api.delete('/profile', { data: { password: password || undefined, confirm } });

export const getApiError = (err, fallback = 'Something went wrong. Please try again.') =>
  err?.response?.data?.error?.details?.[0]?.message || err?.response?.data?.error?.message || err?.message || fallback;