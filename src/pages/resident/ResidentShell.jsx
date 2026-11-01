// Resident office shell: sub navigation + the SSO identity confirmation that
// the unified portal shows before entering the service (once per session).
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from 'animal-island-ui';
import { UsersIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import SsoConfirmModal from '../../components/SsoConfirmModal.jsx';

export default function ResidentShell({ permission, children }) {
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

  const navClass = ({ isActive }) => (isActive ? 'res-nav-link active' : 'res-nav-link');

  return (
    <div className="res-page">
      <div className="res-office-banner">
        <div className="res-office-brand">
          <span className="res-office-emblem">
            <UsersIcon size={22} />
          </span>
          <div>
            <div className="res-office-name">{t('res.officeName')}</div>
            <div className="res-office-sub">{t('res.officeSub')}</div>
          </div>
        </div>
      </div>

      <nav className="res-nav" aria-label={t('res.officeName')}>
        <NavLink to="/resident" end className={navClass}>
          {t('res.nav.home')}
        </NavLink>
        <NavLink to="/resident/guide" className={navClass}>
          {t('res.nav.guide')}
        </NavLink>
        <NavLink to="/resident/apply" className={navClass}>
          {t('res.nav.apply')}
        </NavLink>
        <NavLink to="/resident/applications" className={navClass}>
          {t('res.nav.applications')}
        </NavLink>
        <NavLink to="/resident/card" className={navClass}>
          {t('res.nav.card')}
        </NavLink>
        <NavLink to="/resident/changes" className={navClass}>
          {t('res.nav.changes')}
        </NavLink>
        <NavLink to="/resident/benefits" className={navClass}>
          {t('res.nav.benefits')}
        </NavLink>
        <NavLink to="/resident/messages" className={navClass}>
          {t('res.nav.messages')}
        </NavLink>
        {can('res:review') && (
          <NavLink to="/resident/admin/review" className={navClass}>
            {t('res.nav.workbench')}
          </NavLink>
        )}
        {can('res:manage') && (
          <NavLink to="/resident/admin/types" className={navClass}>
            {t('res.nav.manage')}
          </NavLink>
        )}
      </nav>

      {children}

      <SsoConfirmModal flag="nailong.resident.sso" tip={t('res.sso.tip')} pattern="app-green" />
    </div>
  );
}

// 管理端二级导航(按权限过滤,审核员只看得到审核相关页签)
const ADMIN_TABS = [
  { to: '/resident/admin/review', key: 'review', permission: 'res:review' },
  { to: '/resident/admin/changes', key: 'changes', permission: 'res:review' },
  { to: '/resident/admin/cards', key: 'cards', permission: 'res:review' },
  { to: '/resident/admin/residents', key: 'residents', permission: 'res:review' },
  { to: '/resident/admin/verify', key: 'verify', permission: 'res:manage' },
  { to: '/resident/admin/types', key: 'types', permission: 'res:manage' },
  { to: '/resident/admin/notices', key: 'notices', permission: 'res:manage' },
  { to: '/resident/admin/risk', key: 'risk', permission: 'res:manage' },
  { to: '/resident/admin/stats', key: 'stats', permission: 'res:manage' },
  { to: '/resident/admin/settings', key: 'settings', permission: 'res:manage' },
  { to: '/resident/admin/audit', key: 'audit', permission: 'res:manage' },
];

export function ResAdminNav() {
  const { t } = useTranslation();
  const { can } = useAuth();
  return (
    <nav className="res-nav res-admin-nav" aria-label={t('res.admin.navLabel')}>
      {ADMIN_TABS.filter((tab) => can(tab.permission)).map((tab) => (
        <NavLink key={tab.key} to={tab.to} className={({ isActive }) => (isActive ? 'res-nav-link active' : 'res-nav-link')}>
          {t(`res.admin.tabs.${tab.key}`)}
        </NavLink>
      ))}
    </nav>
  );
}
