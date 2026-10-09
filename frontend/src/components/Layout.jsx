import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { can, ROLE_LABELS } from '../utils/roles.js';

export default function Layout() {
  const { user, logout } = useAuth();
  const links = [
    can.register(user.role) && { to: '/workshops', label: 'Workshops', end: true },
    can.manageWorkshops(user.role) && { to: '/workshops/new', label: 'New workshop' },
    can.register(user.role) && { to: '/history', label: 'Registration history' },
    can.manageUsers(user.role) && { to: '/users', label: 'Staff accounts' },
    can.viewAudit(user.role) && { to: '/audit', label: 'Change log' },
  ].filter(Boolean);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">🎟️ Workshops</span>
          <nav className="nav">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="whoami">
            <span>
              {user.name} <span className="muted">· {ROLE_LABELS[user.role]}</span>
            </span>
            <button type="button" className="btn btn-small" onClick={() => logout()}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
