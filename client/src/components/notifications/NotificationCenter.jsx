

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Bell, BellOff, CheckCheck, Settings2, X, Flame, AlertTriangle, RefreshCw, Inbox, Mail, Zap, Loader2,
} from 'lucide-react';
import useNotifications from '../../hooks/useNotifications.js';
import { timeAgo } from '../../utils/timeAgo.js';
import './notifications.css';

const TYPE_META = {
  inactivity: { Icon: Flame, tone: 'warm', label: 'Streak' },
  behind_pace: { Icon: AlertTriangle, tone: 'alert', label: 'Pace' },
  revision: { Icon: RefreshCw, tone: 'signal', label: 'Revision' },
};

// Where clicking a notification should take you
const targetFor = (n) => {
  if (n.type === 'inactivity') return '/';

  const goalId = n.goalId?._id;
  if (!goalId) return '/goals';

  if (n.type === 'revision' && n.nodeIds?.length) return `/goals/${goalId}?node=${n.nodeIds[0]}`;
  return `/goals/${goalId}`;
};

const dayLabel = (iso) => {
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(new Date(iso))) / 86400000);

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return 'Earlier';
};

function NotificationCenter() {
  const navigate = useNavigate();
  const {
    notifications, unreadCount, preferences, error,
    loadList, markRead, markAllRead, remove, setEmailPreference, runSweep,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (open) loadList();
  }, [open, loadList]);

  useEffect(() => {
    if (!open) return undefined;

    const onDown = (e) => {
      if (e.target.closest?.('[data-notif-toggle]')) return; // the bell button handles itself
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups = useMemo(() => {
    const list = (notifications || []).filter((n) => tab === 'all' || !n.isRead);
    const byLabel = new Map();

    list.forEach((n) => {
      const label = dayLabel(n.createdAt);
      if (!byLabel.has(label)) byLabel.set(label, []);
      byLabel.get(label).push(n);
    });

    return [...byLabel.entries()].map(([label, items]) => ({ label, items }));
  }, [notifications, tab]);

  const handleOpenItem = (n) => {
    markRead(n._id);
    setOpen(false);
    navigate(targetFor(n));
  };

  const handleSweep = async () => {
    setSweeping(true);
    try {
      await runSweep();
    } finally {
      setSweeping(false);
    }
  };

  const panel = (
    <div className="notif-panel" ref={panelRef} role="dialog" aria-label="Notifications">
      <div className="notif-head">
        <div className="notif-title">
          Notifications
          {unreadCount > 0 && <span className="notif-count">{unreadCount} new</span>}
        </div>

        <div className="notif-head-actions">
          {unreadCount > 0 && (
            <button type="button" className="notif-icon-btn" onClick={markAllRead} title="Mark all as read">
              <CheckCheck size={17} />
            </button>
          )}
          <button
            type="button"
            className={`notif-icon-btn ${showSettings ? 'notif-icon-btn-active' : ''}`}
            onClick={() => setShowSettings((s) => !s)}
            title="Notification settings"
          >
            <Settings2 size={17} />
          </button>
          <button type="button" className="notif-icon-btn" onClick={() => setOpen(false)} title="Close">
            <X size={17} />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="notif-settings">
          <div className="notif-setting-row">
            <span className="notif-setting-icon"><Mail size={16} /></span>
            <div className="notif-setting-text">
              <strong>Email reminders</strong>
              <span>Also email me when a reminder fires. They always appear here.</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.emailNotificationsEnabled}
              aria-label="Email reminders"
              className={`switch ${preferences.emailNotificationsEnabled ? 'switch-on' : ''}`}
              onClick={() => setEmailPreference(!preferences.emailNotificationsEnabled)}
            >
              <span className="switch-thumb" />
            </button>
          </div>
          <p className="notif-setting-note">Reminders are checked once a day at 8 PM.</p>
        </div>
      )}

      <div className="notif-tabs">
        <button type="button" className={`notif-tab ${tab === 'all' ? 'notif-tab-active' : ''}`} onClick={() => setTab('all')}>
          All
        </button>
        <button type="button" className={`notif-tab ${tab === 'unread' ? 'notif-tab-active' : ''}`} onClick={() => setTab('unread')}>
          Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
        </button>
      </div>

      <div className="notif-list">
        {notifications === null && (
          <>
            <div className="skeleton" style={{ height: 64, margin: '0 var(--space-4) var(--space-2)' }} />
            <div className="skeleton" style={{ height: 64, margin: '0 var(--space-4)' }} />
          </>
        )}

        {error && <p className="auth-error" style={{ margin: 'var(--space-3) var(--space-4)' }}>{error}</p>}

        {notifications && groups.length === 0 && !error && (
          <div className="notif-empty">
            <div className="notif-empty-icon">{tab === 'unread' ? <BellOff size={22} /> : <Inbox size={22} />}</div>
            <h4>{tab === 'unread' ? "You're all caught up" : 'No reminders yet'}</h4>
            <p>
              {tab === 'unread'
                ? 'Nothing new. Nice work.'
                : 'Streak, pace and revision reminders will show up here.'}
            </p>
          </div>
        )}

        {groups.map((group) => (
          <section key={group.label}>
            <h5 className="notif-group-label">{group.label}</h5>
            <ul>
              {group.items.map((n) => {
                const meta = TYPE_META[n.type] || TYPE_META.inactivity;
                return (
                  <li key={n._id}>
                    <div
                      className={`notif-item ${n.isRead ? '' : 'notif-item-unread'}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenItem(n)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleOpenItem(n);
                        }
                      }}
                    >
                      <span className={`notif-icon notif-tone-${meta.tone}`}><meta.Icon size={16} /></span>

                      <span className="notif-main">
                        <span className="notif-message">{n.message}</span>
                        <span className="notif-meta">{meta.label} · {timeAgo(n.createdAt)}</span>
                      </span>

                      <button
                        type="button"
                        className="notif-remove"
                        aria-label="Dismiss notification"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(n._id);
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {import.meta.env.DEV && (
        <div className="notif-foot">
          <button type="button" className="notif-dev-btn" onClick={handleSweep} disabled={sweeping}>
            {sweeping ? <Loader2 size={14} className="notif-spin" /> : <Zap size={14} />}
            Run my reminder check now
            <span>dev only</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        type="button"
        className={`sidebar-link notif-trigger ${open ? 'notif-trigger-open' : ''}`}
        data-notif-toggle
        onClick={() => setOpen((o) => !o)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <span className="sidebar-icon">
          <Bell size={18} strokeWidth={2} />
          {unreadCount > 0 && <span className="notif-dot" />}
        </span>
        <span className="sidebar-label">Notifications</span>
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {/* Portaled to <body>: the sidebar's blur effect would otherwise trap a fixed panel inside it */}
      {open && createPortal(panel, document.body)}
    </>
  );
}

export default NotificationCenter;