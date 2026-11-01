// Appeal service shell: sub navigation + the SSO identity confirmation that
// the unified portal shows before entering the service (once per session).
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from 'animal-island-ui';
import { ShieldIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import SsoConfirmModal from '../../components/SsoConfirmModal.jsx';

export default function AppealShell({ permission, children }) {
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

  const navClass = ({ isActive }) => (isActive ? 'appeal-nav-link active' : 'appeal-nav-link');

  return (
    <div className="appeal-page">
      <div className="appeal-office-banner">
        <div className="appeal-office-brand">
          <span className="appeal-office-emblem">
            <ShieldIcon size={22} />
          </span>
          <div>
            <div className="appeal-office-name">{t('appeal.officeName')}</div>
            <div className="appeal-office-sub">{t('appeal.officeSub')}</div>
          </div>
        </div>
      </div>

      <nav className="appeal-nav" aria-label={t('appeal.officeName')}>
        <NavLink to="/appeal" end className={navClass}>
          {t('appeal.nav.home')}
        </NavLink>
        <NavLink to="/appeal/apply" className={navClass}>
          {t('appeal.nav.apply')}
        </NavLink>
        <NavLink to="/appeal/my" className={navClass}>
          {t('appeal.nav.my')}
        </NavLink>
        <NavLink to="/appeal/reviews" className={navClass}>
          {t('appeal.nav.reviews')}
        </NavLink>
        <NavLink to="/appeal/complaints" className={navClass}>
          {t('appeal.nav.complaints')}
        </NavLink>
        <NavLink to="/appeal/tickets" className={navClass}>
          {t('appeal.nav.tickets')}
        </NavLink>
        <NavLink to="/appeal/decisions" className={navClass}>
          {t('appeal.nav.decisions')}
        </NavLink>
        <NavLink to="/appeal/publicity" className={navClass}>
          {t('appeal.nav.publicity')}
        </NavLink>
        <NavLink to="/appeal/messages" className={navClass}>
          {t('appeal.nav.messages')}
        </NavLink>
        <NavLink to="/appeal/guide" className={navClass}>
          {t('appeal.nav.guide')}
        </NavLink>
        {can('appeal:process') && (
          <NavLink to="/appeal/admin/workbench" className={navClass}>
            {t('appeal.nav.workbench')}
          </NavLink>
        )}
        {can('appeal:review') && (
          <NavLink to="/appeal/admin/reviews" className={navClass}>
            {t('appeal.nav.reviewAdmin')}
          </NavLink>
        )}
        {can('appeal:process') && (
          <NavLink to="/appeal/admin/desk" className={navClass}>
            {t('appeal.nav.desk')}
          </NavLink>
        )}
        {can('appeal:inspect') && (
          <NavLink to="/appeal/admin/inspect" className={navClass}>
            {t('appeal.nav.inspect')}
          </NavLink>
        )}
        {can('appeal:manage') && (
          <NavLink to="/appeal/admin/manage" className={navClass}>
            {t('appeal.nav.manage')}
          </NavLink>
        )}
        {can('appeal:manage') && (
          <NavLink to="/appeal/admin/stats" className={navClass}>
            {t('appeal.nav.stats')}
          </NavLink>
        )}
        {can('appeal:manage') && (
          <NavLink to="/appeal/admin/audit" className={navClass}>
            {t('appeal.nav.audit')}
          </NavLink>
        )}
      </nav>

      {children}

      <SsoConfirmModal flag="nailong.appeal.sso" tip={t('appeal.sso.tip')} pattern="app-teal" />
    </div>
  );
}
