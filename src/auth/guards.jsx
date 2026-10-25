import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SpinnerIcon } from 'naive-icons';
import { useAuth } from './AuthContext.jsx';
import { Button } from 'animal-island-ui';

export function FullLoading({ tip }) {
  const { t } = useTranslation();
  return (
    <div className="center-screen" role="status">
      <SpinnerIcon size={28} className="spin-icon" />
      <p className="muted-text">{tip ?? t('common.loading')}</p>
    </div>
  );
}

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function RequirePermission({ permission, children }) {
  const { user, loading, can } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  if (loading) return <FullLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!can(permission)) {
    return (
      <div className="center-screen">
        <h2>{t('errors.forbiddenTitle')}</h2>
        <p className="muted-text">{t('errors.forbiddenTip')}</p>
        <Button type="primary" onClick={() => window.history.back()}>
          {t('errors.backHome')}
        </Button>
      </div>
    );
  }
  return children;
}
