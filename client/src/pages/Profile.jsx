import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Camera, Clock, Flame, Target, CheckCircle2, StickyNote, Trophy, Trash2, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import {
  fetchProfile, updateProfile, uploadAvatar, removeAvatar,
  changePassword, logoutAllDevices, deleteAccount, getApiError,
} from '../services/profile.api.js';
import './Profile.css';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const formatHours = (minutes) => {
  if (!minutes) return '0 h';
  if (minutes < 60) return `${minutes} min`;
  const h = minutes / 60;
  return `${h >= 10 ? Math.round(h) : h.toFixed(1)} h`;
};

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '';

function Notice({ notice }) {
  if (!notice) return null;
  return <p className={`profile-notice ${notice.type === 'error' ? 'is-error' : 'is-ok'}`} role="status">{notice.text}</p>;
}

function Profile() {
  const { updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const fileInput = useRef(null);

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [name, setName] = useState('');
  const [targetExam, setTargetExam] = useState('');
  const [detailsNotice, setDetailsNotice] = useState(null);
  const [savingDetails, setSavingDetails] = useState(false);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwNotice, setPwNotice] = useState(null);
  const [savingPw, setSavingPw] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteNotice, setDeleteNotice] = useState(null);

  const [sessionNotice, setSessionNotice] = useState(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchProfile()
      .then((d) => {
        if (!alive) return;
        setLoadError('');
        setData(d);
        setName(d.user.name);
        setTargetExam(d.user.targetExam);
      })
      .catch((err) => alive && setLoadError(getApiError(err, 'Could not load your profile.')));
    return () => { alive = false; };
  }, [reloadKey]);

  const applyUser = (user) => {
    setData((d) => ({ ...d, user }));
    updateUser({ name: user.name, avatarUrl: user.avatarUrl });
  };

  const saveDetails = async (e) => {
    e.preventDefault();
    setSavingDetails(true);
    setDetailsNotice(null);
    try {
      const user = await updateProfile({ name, targetExam });
      applyUser(user);
      setDetailsNotice({ type: 'ok', text: 'Saved.' });
    } catch (err) {
      setDetailsNotice({ type: 'error', text: getApiError(err) });
    } finally {
      setSavingDetails(false);
    }
  };

  const toggleEmails = async (enabled) => {
    const before = data.user;
    setData((d) => ({ ...d, user: { ...d.user, emailNotificationsEnabled: enabled } }));
    try {
      await updateProfile({ emailNotificationsEnabled: enabled });
    } catch (err) {
      setData((d) => ({ ...d, user: before }));
      setDetailsNotice({ type: 'error', text: getApiError(err) });
    }
  };

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarNotice(null);

    if (!file.type.startsWith('image/')) return setAvatarNotice({ type: 'error', text: 'Please choose an image file.' });
    if (file.size > MAX_AVATAR_BYTES) return setAvatarNotice({ type: 'error', text: 'That picture is over 5 MB. Choose a smaller one.' });

    setAvatarBusy(true);
    try {
      applyUser(await uploadAvatar(file));
    } catch (err) {
      setAvatarNotice({ type: 'error', text: getApiError(err, 'Upload failed. Please try again.') });
    } finally {
      setAvatarBusy(false);
    }
  };

  const onRemoveAvatar = async () => {
    setAvatarBusy(true);
    setAvatarNotice(null);
    try {
      applyUser(await removeAvatar());
    } catch (err) {
      setAvatarNotice({ type: 'error', text: getApiError(err) });
    } finally {
      setAvatarBusy(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setSavingPw(true);
    setPwNotice(null);
    try {
      await changePassword(currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setPwNotice({ type: 'ok', text: 'Password updated. Your other devices were signed out.' });
      setData((d) => ({ ...d, user: { ...d.user, hasPassword: true } }));
    } catch (err) {
      setPwNotice({ type: 'error', text: getApiError(err) });
    } finally {
      setSavingPw(false);
    }
  };

  const signOutEverywhere = async () => {
    setSessionNotice(null);
    try {
      await logoutAllDevices();
      await logout(); // this device too: the server just dropped every session
      navigate('/login');
    } catch (err) {
      setSessionNotice({ type: 'error', text: getApiError(err) });
    }
  };

  const confirmDelete = async (e) => {
    e.preventDefault();
    setDeleteNotice(null);
    try {
      await deleteAccount(deletePw, deleteConfirm);
      await logout().catch(() => {});
      navigate('/login');
    } catch (err) {
      setDeleteNotice({ type: 'error', text: getApiError(err) });
    }
  };

  if (loadError) {
    return (
      <div className="profile-page">
        <p className="profile-notice is-error">{loadError}</p>
        <button type="button" className="btn btn-ghost" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="profile-page">
        <div className="skeleton" style={{ height: 160, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 16 }} />
      </div>
    );
  }

  const { user, stats } = data;
  const detailsChanged = name.trim() !== user.name || targetExam.trim() !== user.targetExam;

  const statCards = [
    { Icon: Flame, label: 'Current streak', value: `${stats.currentStreak} day${stats.currentStreak === 1 ? '' : 's'}`, hint: `Longest ${stats.longestStreak}` },
    { Icon: Clock, label: 'Total study time', value: formatHours(stats.totalMinutes), hint: `${stats.sessions} session${stats.sessions === 1 ? '' : 's'}` },
    { Icon: CheckCircle2, label: 'Topics completed', value: stats.topicsCompleted, hint: 'Across all goals' },
    { Icon: Target, label: 'Active goals', value: stats.activeGoals, hint: `${stats.totalGoals} in total` },
    { Icon: StickyNote, label: 'Notes', value: stats.notes, hint: `${stats.files} file${stats.files === 1 ? '' : 's'} uploaded` },
    { Icon: Trophy, label: 'Longest streak', value: `${stats.longestStreak} day${stats.longestStreak === 1 ? '' : 's'}`, hint: 'Your personal best' },
  ];

  return (
    <div className="profile-page">
      {/* ---------- Header ---------- */}
      <section className="profile-card profile-header">
        <div className="profile-avatar-wrap">
          <Avatar user={user} size={96} />
          <button
            type="button"
            className="profile-avatar-btn"
            onClick={() => fileInput.current?.click()}
            disabled={avatarBusy}
            aria-label="Change profile picture"
            title="Change profile picture"
          >
            <Camera size={15} />
          </button>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={onPickAvatar} />
        </div>

        <div className="profile-id">
          <h1 className="text-stat">{user.name}</h1>
          <div className="profile-email">
            <span>{user.email}</span>
            {user.emailVerified && <span className="profile-verified"><BadgeCheck size={14} /> Verified</span>}
          </div>
          <div className="profile-meta">
            {user.targetExam && <span className="pill profile-pill">{user.targetExam}</span>}
            <span className="text-muted">Member since {formatDate(user.createdAt)}</span>
          </div>
          <div className="profile-avatar-actions">
            {avatarBusy ? <span className="text-muted">Updating picture…</span> : user.avatarUrl && (
              <button type="button" className="profile-link" onClick={onRemoveAvatar}>Remove picture</button>
            )}
          </div>
          <Notice notice={avatarNotice} />
        </div>
      </section>

      {/* ---------- Stats ---------- */}
      <section className="profile-stats">
        {statCards.map(({ Icon, label, value, hint }) => (
          <div className="profile-stat" key={label}>
            <span className="profile-stat-icon"><Icon size={18} /></span>
            <div>
              <div className="profile-stat-value text-stat">{value}</div>
              <div className="profile-stat-label">{label}</div>
              <div className="profile-stat-hint">{hint}</div>
            </div>
          </div>
        ))}
      </section>

      {/* ---------- Details ---------- */}
      <section className="profile-card">
        <h2>Your details</h2>
        <form className="profile-form" onSubmit={saveDetails}>
          <label className="auth-label">
            Name
            <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          </label>
          <label className="auth-label">
            Email
            <input className="auth-input" value={user.email} disabled />
          </label>
          <label className="auth-label">
            Target exam
            <input className="auth-input" value={targetExam} onChange={(e) => setTargetExam(e.target.value)} maxLength={80} placeholder="e.g. JEE Main 2027, GATE CSE, UPSC" />
          </label>
          <div className="profile-actions">
            <button type="submit" className="btn btn-primary" disabled={savingDetails || !detailsChanged || !name.trim()}>
              {savingDetails ? 'Saving…' : 'Save changes'}
            </button>
            <Notice notice={detailsNotice} />
          </div>
        </form>

        <label className="profile-toggle">
          <span>
            <strong>Email reminders</strong>
            <span className="text-muted">A daily nudge when you have study tasks due.</span>
          </span>
          <input
            type="checkbox"
            checked={user.emailNotificationsEnabled}
            onChange={(e) => toggleEmails(e.target.checked)}
          />
        </label>
      </section>

      {/* ---------- Security ---------- */}
      <section className="profile-card">
        <h2>Security</h2>
        <p className="text-muted profile-sub">
          {user.hasGoogle ? 'You can sign in with Google. ' : ''}
          {user.hasPassword ? 'Change your password below.' : 'You have no password yet. Set one to also log in with your email.'}
        </p>

        <form className="profile-form" onSubmit={savePassword}>
          {user.hasPassword && (
            <label className="auth-label">
              Current password
              <input className="auth-input" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" required />
            </label>
          )}
          <label className="auth-label">
            {user.hasPassword ? 'New password' : 'Password'}
            <input className="auth-input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} minLength={8} autoComplete="new-password" required />
          </label>
          <div className="profile-actions">
            <button type="submit" className="btn btn-primary" disabled={savingPw}>
              {savingPw ? 'Updating…' : user.hasPassword ? 'Change password' : 'Set password'}
            </button>
            <Notice notice={pwNotice} />
          </div>
        </form>

        <div className="profile-row">
          <div>
            <strong>Sign out of all devices</strong>
            <p className="text-muted profile-sub">Ends every logged-in session, including this one.</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={signOutEverywhere}>
            <LogOut size={15} /> Sign out everywhere
          </button>
        </div>
        <Notice notice={sessionNotice} />
      </section>

      {/* ---------- Danger zone ---------- */}
      <section className="profile-card profile-danger">
        <h2>Delete account</h2>
        <p className="text-muted profile-sub">
          Permanently removes your goals, roadmaps, notes, files, sessions and history. This cannot be undone.
        </p>

        {!deleting ? (
          <button type="button" className="btn profile-delete-btn" onClick={() => setDeleting(true)}>
            <Trash2 size={15} /> Delete my account
          </button>
        ) : (
          <form className="profile-form" onSubmit={confirmDelete}>
            {user.hasPassword && (
              <label className="auth-label">
                Your password
                <input className="auth-input" type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} required />
              </label>
            )}
            <label className="auth-label">
              Type <strong>DELETE</strong> to confirm
              <input className="auth-input" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} autoComplete="off" />
            </label>
            <div className="profile-actions">
              <button type="submit" className="btn profile-delete-btn" disabled={deleteConfirm !== 'DELETE'}>
                Permanently delete
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setDeleting(false); setDeleteConfirm(''); setDeletePw(''); setDeleteNotice(null); }}>
                Cancel
              </button>
            </div>
            <Notice notice={deleteNotice} />
          </form>
        )}
      </section>
    </div>
  );
}

export default Profile;