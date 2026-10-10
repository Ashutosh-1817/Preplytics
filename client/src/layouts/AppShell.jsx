

import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Target, StickyNote, FolderOpen, CalendarDays } from 'lucide-react';
import './AppShell.css';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/goals', label: 'Goals', Icon: Target },
  { to: '/notes', label: 'Notes', Icon: StickyNote },
  { to: '/files', label: 'Files', Icon: FolderOpen },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays },
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
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}

export default AppShell;