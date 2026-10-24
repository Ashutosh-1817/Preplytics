import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Target, StickyNote, FolderOpen, Globe, CalendarDays, TrendingUp, Award } from 'lucide-react';
import UserMenu from '../components/UserMenu.jsx';
import NotificationCenter from '../components/notifications/NotificationCenter.jsx';
import './AppShell.css';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/goals', label: 'Goals', Icon: Target },
  { to: '/notes', label: 'Notes', Icon: StickyNote },
  { to: '/files', label: 'Files', Icon: FolderOpen },
  { to: '/research', label: 'Research', Icon: Globe },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { to: '/analytics', label: 'Analytics', Icon: TrendingUp },
  { to: '/wrapped', label: 'Wrapped', Icon: Award },
];

function AppShell() {
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

        <UserMenu />
      </aside>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}

export default AppShell;