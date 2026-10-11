

import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Target, StickyNote, FolderOpen, Globe, CalendarDays, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationCenter from '../components/notifications/NotificationCenter.jsx';
import './AppShell.css';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/goals', label: 'Goals', Icon: Target },
  { to: '/notes', label: 'Notes', Icon: StickyNote },
  { to: '/files', label: 'Files', Icon: FolderOpen },
  { to: '/research', label: 'Research', Icon: Globe },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays },
];

function AppShell() {
  const { user, logout } = useAuth();
  const initial = (user?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">Preplytics</div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
            >
              <span className="sidebar-icon"><Icon size={18} strokeWidth={2} /></span>
              <span className="sidebar-label">{label}</span>
            </NavLink>
          ))}

          <NotificationCenter />
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-avatar">{initial}</div>
          <div className="sidebar-user-text">
            <span className="sidebar-user-name">{user?.name}</span>
            <span className="sidebar-user-email">{user?.email}</span>
          </div>
          <button type="button" className="sidebar-logout" onClick={logout} title="Log out" aria-label="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}

export default AppShell;