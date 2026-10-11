
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  updateNotificationPreferences,
  triggerReminderSweep,
} from '../services/notifications.api.js';

const POLL_MS = 60_000;

function useNotifications() {
  const [notifications, setNotifications] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState({ emailNotificationsEnabled: true });
  const [error, setError] = useState('');

  // Refs let handlers read the latest values without being re-created
  const listRef = useRef(null);
  const countRef = useRef(0);
  const listLoadedRef = useRef(false);

  useEffect(() => {
    listRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    countRef.current = unreadCount;
  }, [unreadCount]);

  const loadList = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      setPreferences(data.preferences);
      listLoadedRef.current = true;
      setError('');
    } catch {
      setError('Could not load notifications.');
      setNotifications((prev) => prev ?? []);
    }
  }, []);

  // The bell only polls a tiny count endpoint. The list loads when you open it.
  const pollCount = useCallback(async () => {
    try {
      const count = await fetchUnreadCount();
      if (count !== countRef.current) {
        setUnreadCount(count);
        if (listLoadedRef.current) loadList(); // keep an already-opened list in sync
      }
    } catch {
      // offline, or a token refresh is in flight: try again next tick
    }
  }, [loadList]);

  useEffect(() => {
    pollCount();

    const tick = () => {
      if (document.visibilityState === 'visible') pollCount();
    };

    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [pollCount]);

  // Every action updates the screen instantly, then confirms with the server.
  // If the server disagrees, reloading the list restores the truth.

  const markRead = useCallback(
    async (id) => {
      const target = listRef.current?.find((n) => n._id === id);
      if (!target || target.isRead) return;

      setNotifications((prev) => prev?.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));

      try {
        await markNotificationRead(id);
      } catch {
        loadList();
      }
    },
    [loadList]
  );

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev?.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await markAllNotificationsRead();
    } catch {
      loadList();
    }
  }, [loadList]);

  const remove = useCallback(
    async (id) => {
      const target = listRef.current?.find((n) => n._id === id);

      setNotifications((prev) => prev?.filter((n) => n._id !== id));
      if (target && !target.isRead) setUnreadCount((c) => Math.max(0, c - 1));

      try {
        await deleteNotification(id);
      } catch {
        loadList();
      }
    },
    [loadList]
  );

  const setEmailPreference = useCallback(async (enabled) => {
    setPreferences((p) => ({ ...p, emailNotificationsEnabled: enabled }));

    try {
      await updateNotificationPreferences({ emailNotificationsEnabled: enabled });
    } catch {
      setPreferences((p) => ({ ...p, emailNotificationsEnabled: !enabled }));
    }
  }, []);

  const runSweep = useCallback(async () => {
    await triggerReminderSweep();
    await loadList();
  }, [loadList]);

  return {
    notifications,
    unreadCount,
    preferences,
    error,
    loadList,
    markRead,
    markAllRead,
    remove,
    setEmailPreference,
    runSweep,
  };
}

export default useNotifications;