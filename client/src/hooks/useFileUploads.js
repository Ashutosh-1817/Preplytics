

import { useState, useRef, useCallback, useEffect } from 'react';
import { uploadFile, getErrorMessage } from '../services/files.api.js';
import { validateFileForUpload } from '../utils/fileHelpers.js';

const MAX_PARALLEL = 2;
let idCounter = 0;

function useFileUploads({ onUploaded } = {}) {
  const [items, setItems] = useState([]);
  const queueRef = useRef([]);
  const activeRef = useRef(new Map());
  const mountedRef = useRef(true);
  const onUploadedRef = useRef(onUploaded);

  useEffect(() => {
    onUploadedRef.current = onUploaded;
  });

  useEffect(() => {
    mountedRef.current = true;
    const active = activeRef.current;
    return () => {
      mountedRef.current = false;
      queueRef.current = [];
      active.forEach((controller) => controller.abort());
    };
  }, []);

  const patch = useCallback((id, changes) => {
    if (!mountedRef.current) return;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  const dismiss = useCallback((id) => {
    if (!mountedRef.current) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const runJob = useCallback(
    async (job) => {
      const controller = new AbortController();
      activeRef.current.set(job.id, controller);
      patch(job.id, { status: 'uploading', progress: 0 });

      try {
        const file = await uploadFile(job.file, {
          ...job.links,
          signal: controller.signal,
          onProgress: (progress) => patch(job.id, { progress }),
        });
        patch(job.id, { status: 'done', progress: 100 });
        onUploadedRef.current?.(file);
        setTimeout(() => dismiss(job.id), 3000);
      } catch (err) {
        if (err?.code === 'ERR_CANCELED') dismiss(job.id);
        else patch(job.id, { status: 'error', error: getErrorMessage(err, 'Upload failed.') });
      } finally {
        activeRef.current.delete(job.id);
      }
    },
    [patch, dismiss]
  );

  const pump = useCallback(() => {
    while (activeRef.current.size < MAX_PARALLEL && queueRef.current.length > 0) {
      const job = queueRef.current.shift();
      runJob(job).finally(pump);
    }
  }, [runJob]);

  const addFiles = useCallback(
    (fileList, links = {}) => {
      const newItems = [];
      const jobs = [];

      Array.from(fileList).forEach((file) => {
        const id = `up-${Date.now()}-${idCounter++}`;
        const problem = validateFileForUpload(file);
        const base = { id, name: file.name, size: file.size, progress: 0 };

        if (problem) {
          newItems.push({ ...base, status: 'error', error: problem });
        } else {
          newItems.push({ ...base, status: 'queued', error: '' });
          jobs.push({ id, file, links });
        }
      });

      setItems((prev) => [...prev, ...newItems]);
      queueRef.current.push(...jobs);
      pump();
    },
    [pump]
  );

  const cancel = useCallback(
    (id) => {
      const controller = activeRef.current.get(id);
      if (controller) {
        controller.abort();
        return;
      }
      queueRef.current = queueRef.current.filter((job) => job.id !== id);
      dismiss(id);
    },
    [dismiss]
  );

  return { items, addFiles, cancel, dismiss };
}

export default useFileUploads;