import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // sends the httpOnly refresh cookie automatically
});

// The access token is injected from outside this file (by AuthContext,
// which owns the actual state) via this setter — api.js has no state
// of its own, it's a pure request layer.
let accessToken = null;
let onTokenRefreshed = null; // callback AuthContext registers, so a successful refresh updates its state too
let onAuthFailure = null;    // callback AuthContext registers, to force logout if refresh itself fails

export const setAccessToken = (token) => {
  accessToken = token;
};

export const registerAuthHandlers = ({ onRefreshed, onFailure }) => {
  onTokenRefreshed = onRefreshed;
  onAuthFailure = onFailure;
};

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let isRefreshing = false;
let pendingQueue = [];

const processQueue = (error, token = null) => {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  pendingQueue = [];
};


const normalizeBlobError = async (error) => {
  const data = error.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      error.response.data = JSON.parse(await data.text());
    } catch {
      // not JSON: leave it
    }
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    await normalizeBlobError(error);
    const originalRequest = error.config;
    const errorCode = error.response?.data?.error?.code;

    // Only attempt a refresh for an expired token, exactly once per
    // request (the _retry flag prevents an infinite loop if refresh
    // itself somehow keeps failing with the same error)
    if (errorCode === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      if (isRefreshing) {
        // A refresh is already in flight (e.g. two requests failed at
        // once) — queue this request rather than firing a second
        // redundant refresh call
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(
          `${BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        const newToken = data.data.accessToken;

        setAccessToken(newToken);
        onTokenRefreshed?.(newToken);
        processQueue(null, newToken);

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        onAuthFailure?.();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;