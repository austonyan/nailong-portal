// Visa service shell: sub navigation + the SSO identity confirmation that the
// unified portal shows before entering the service (once per browser session).
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from 'animal-island-ui';
import { BadgeCheckIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import SsoConfirmModal from '../../components/SsoConfirmModal.jsx';

export default function VisaShell({ permission, children }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();

  if (permission && !can(permission)) {
    return (
      <div className="center-screen">
        <h2>{t('errors.forbiddenTitle')}</h2>
        <p className="muted-text">{t('errors.forbiddenTip')}</p>
        <Button type="primary" onClick={() => navigate('/')}>
          {t('errors.backHome')}
        </Button>
      </div>
    );
  }

  const navClass = ({ isActive }) => (isActive ? 'visa-nav-link active' : 'visa-nav-link');

  return (
    <div className="visa-page">
      <div className="visa-office-banner">
        <div className="visa-office-brand">
          <span className="visa-office-emblem">
            <BadgeCheckIcon size={22} />
          </span>
          <div>
            <div className="visa-office-name">{t('visa.officeName')}</div>
            <div className="visa-office-sub">{t('visa.officeSub')}</div>
          </div>
        </div>
      </div>

      <nav className="visa-nav" aria-label={t('visa.officeName')}>
        <NavLink to="/visa" end className={navClass}>
          {t('visa.nav.home')}
        </NavLink>
        <NavLink to="/visa/applications" className={navClass}>
          {t('visa.nav.applications')}
        </NavLink>
        <NavLink to="/visa/permits" className={navClass}>
          {t('visa.nav.permits')}
        </NavLink>
        <NavLink to="/visa/messages" className={navClass}>
          {t('visa.nav.messages')}
        </NavLink>
        {can('visa:review') && (
          <NavLink to="/visa/admin/workbench" className={navClass}>
            {t('visa.nav.workbench')}
          </NavLink>
        )}
        {can('visa:manage') && (
          <NavLink to="/visa/admin/manage" className={navClass}>
            {t('visa.nav.manage')}
          </NavLink>
        )}
      </nav>

      {children}

      <SsoConfirmModal flag="nailong.visa.sso" tip={t('visa.sso.tip')} pattern="app-teal" />
    </div>
  );
}
