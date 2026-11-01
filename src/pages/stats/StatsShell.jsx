// 统计署 shell: 署内导航 + 与统一门户一致的 SSO 身份确认(每个浏览器会话一次)。
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from 'animal-island-ui';
import { StarIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import SsoConfirmModal from '../../components/SsoConfirmModal.jsx';
import './stats.css';

export default function StatsShell({ permission, children }) {
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

  const navClass = ({ isActive }) => (isActive ? 'stat-nav-link active' : 'stat-nav-link');

  return (
    <div className="stat-page">
      <div className="stat-office-banner">
        <div className="stat-office-brand">
          <span className="stat-office-emblem">
            <StarIcon size={22} />
          </span>
          <div>
            <div className="stat-office-name">{t('stat.officeName')}</div>
            <div className="stat-office-sub">{t('stat.officeSub')}</div>
          </div>
        </div>
      </div>

      <nav className="stat-nav" aria-label={t('stat.officeName')}>
        <NavLink to="/stats" end className={navClass}>
          {t('stat.nav.home')}
        </NavLink>
        <NavLink to="/stats/reports" className={navClass}>
          {t('stat.nav.reports')}
        </NavLink>
        <NavLink to="/stats/guide" className={navClass}>
          {t('stat.nav.guide')}
        </NavLink>
        {can('stat:manage') && (
          <NavLink to="/stats/admin/dashboard" className={navClass}>
            {t('stat.nav.dashboard')}
          </NavLink>
        )}
        {can('stat:manage') && (
          <NavLink to="/stats/admin/metrics" className={navClass}>
            {t('stat.nav.metrics')}
          </NavLink>
        )}
        {can('stat:manage') && (
          <NavLink to="/stats/admin/export" className={navClass}>
            {t('stat.nav.export')}
          </NavLink>
        )}
        {can('stat:manage') && (
          <NavLink to="/stats/admin/audit" className={navClass}>
            {t('stat.nav.audit')}
          </NavLink>
        )}
      </nav>

      {children}

      <SsoConfirmModal flag="nailong.stats.sso" tip={t('stat.sso.tip')} pattern="app-blue" />
    </div>
  );
}

// 管理端二级导航(按权限过滤;当前只有 stat:manage 一个权限,保留同一范式)。
const ADMIN_TABS = [
  { to: '/stats/admin/dashboard', key: 'dashboard', permission: 'stat:manage' },
  { to: '/stats/admin/metrics', key: 'metrics', permission: 'stat:manage' },
  { to: '/stats/admin/export', key: 'export', permission: 'stat:manage' },
  { to: '/stats/admin/audit', key: 'audit', permission: 'stat:manage' },
];

export function StatsAdminNav() {
  const { t } = useTranslation();
  const { can } = useAuth();
  return (
    <nav className="stat-nav stat-admin-nav" aria-label={t('stat.admin.navLabel')}>
      {ADMIN_TABS.filter((tab) => can(tab.permission)).map((tab) => (
        <NavLink
          key={tab.key}
          to={tab.to}
          className={({ isActive }) => (isActive ? 'stat-nav-link active' : 'stat-nav-link')}
        >
          {t(`stat.admin.tabs.${tab.key}`)}
        </NavLink>
      ))}
    </nav>
  );
}