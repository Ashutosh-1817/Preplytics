import { useEffect, useState } from 'react';
import { NavLink, Link, Outlet } from 'react-router-dom';
import { LayoutDashboard, Target, StickyNote, FolderOpen, Globe, CalendarDays, TrendingUp, Award } from 'lucide-react';
import BrandMark from '../components/BrandMark.jsx';
import UserMenu from '../components/UserMenu.jsx';
import NotificationCenter from '../components/notifications/NotificationCenter.jsx';
import './AppShell.css';

const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
      { to: '/goals', label: 'Goals', Icon: Target },
      { to: '/notes', label: 'Notes', Icon: StickyNote },
      { to: '/files', label: 'Files', Icon: FolderOpen },
    ],
  },
  {
    label: 'Explore',
    items: [
      { to: '/research', label: 'Research', Icon: Globe },
      { to: '/calendar', label: 'Calendar', Icon: CalendarDays },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/analytics', label: 'Analytics', Icon: TrendingUp },
      { to: '/wrapped', label: 'Wrapped', Icon: Award },
    ],
  },
];

const STORAGE_KEY = 'preplytics.sidebarCollapsed';

function AppShell() {
  // The logo mark folds the sidebar down to an icon rail and back. The choice is remembered.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage can be blocked; the toggle still works for this visit */
    }
  }, [collapsed]);

  return (
    <div className={`app-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <button
            type="button"
            className="brand-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <BrandMark />
          </button>
          <Link to="/" className="brand-word" tabIndex={collapsed ? -1 : 0}>
            Prep<span>lytics</span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div className="sidebar-group" key={group.label}>
              <div className="sidebar-group-label">{group.label}</div>
              {group.items.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <span className="sidebar-icon"><Icon size={18} strokeWidth={2} /></span>
                  <span className="sidebar-label">{label}</span>
                </NavLink>
              ))}
            </div>
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