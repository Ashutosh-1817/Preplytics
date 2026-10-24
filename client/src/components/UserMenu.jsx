import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronUp, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import './UserMenu.css';

// The account card at the bottom of the sidebar. Click it for the profile link and log out.
function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={rootRef}>
      {open && (
        <div className="user-menu-pop" role="menu">
          <div className="user-menu-head">
            <Avatar user={user} size={40} />
            <div className="user-menu-head-text">
              <strong>{user?.name}</strong>
              <span>{user?.email}</span>
            </div>
          </div>
          <Link to="/profile" className="user-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <UserRound size={16} /> View profile
          </Link>
          <button type="button" className="user-menu-item user-menu-danger" role="menuitem" onClick={logout}>
            <LogOut size={16} /> Log out
          </button>
        </div>
      )}

      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar user={user} size={36} />
        <span className="user-menu-text">
          <span className="user-menu-name">{user?.name}</span>
          <span className="user-menu-email">{user?.email}</span>
        </span>
        <ChevronUp size={16} className={`user-menu-chevron ${open ? 'is-open' : ''}`} />
      </button>
    </div>
  );
}

export default UserMenu;