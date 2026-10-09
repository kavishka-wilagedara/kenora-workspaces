import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loading } from '../components/ui.jsx';
import { homeFor } from '../utils/roles.js';
import { useAuth } from './AuthContext.jsx';

export function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading label="Signing you in…" />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

export function RequireRole({ roles }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}

export function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homeFor(user.role)} replace />;
}
