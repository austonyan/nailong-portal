import { Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card } from 'animal-island-ui';
import AppLayout from './components/AppLayout.jsx';
import { RequireAuth, RequirePermission } from './auth/guards.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Portal from './pages/Portal.jsx';
import Profile from './pages/Profile.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminRoles from './pages/admin/AdminRoles.jsx';
import AdminServices from './pages/admin/AdminServices.jsx';

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="center-screen">
      <Card>
        <h2>{t('errors.notFoundTitle')}</h2>
        <p className="muted-text">{t('errors.notFoundTip')}</p>
        <Button type="primary" onClick={() => window.location.assign('/')}>
          {t('errors.backHome')}
        </Button>
      </Card>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Portal />} />
        <Route path="/profile" element={<Profile />} />
        <Route
          path="/admin/users"
          element={
            <RequirePermission permission="users:read">
              <AdminUsers />
            </RequirePermission>
          }
        />
        <Route
          path="/admin/roles"
          element={
            <RequirePermission permission="roles:read">
              <AdminRoles />
            </RequirePermission>
          }
        />
        <Route
          path="/admin/services"
          element={
            <RequirePermission permission="services:read">
              <AdminServices />
            </RequirePermission>
          }
        />
      </Route>
      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
