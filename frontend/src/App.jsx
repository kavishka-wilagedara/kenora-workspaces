import { Route, Routes } from 'react-router-dom';
import { HomeRedirect, RequireAuth, RequireRole } from './auth/guards.jsx';
import Layout from './components/Layout.jsx';
import AuditPage from './pages/AuditPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import WorkshopDetailPage from './pages/WorkshopDetailPage.jsx';
import WorkshopFormPage from './pages/WorkshopFormPage.jsx';
import WorkshopsPage from './pages/WorkshopsPage.jsx';
import { ROLES } from './utils/roles.js';

const { ADMIN, MANAGER, STAFF } = ROLES;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route element={<RequireRole roles={[MANAGER]} />}>
          <Route path="workshops/new" element={<WorkshopFormPage />} />
          <Route path="workshops/:id/edit" element={<WorkshopFormPage />} />
        </Route>
        <Route element={<RequireRole roles={[MANAGER, STAFF]} />}>
          <Route path="workshops" element={<WorkshopsPage />} />
          <Route path="workshops/:id" element={<WorkshopDetailPage />} />
          <Route path="history" element={<HistoryPage />} />
        </Route>
        <Route element={<RequireRole roles={[ADMIN]} />}>
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route element={<RequireRole roles={[ADMIN, MANAGER]} />}>
          <Route path="audit" element={<AuditPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
