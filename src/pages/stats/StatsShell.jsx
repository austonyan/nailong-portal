// 统计署 shell: 署内导航 + 与统一门户一致的 SSO 身份确认(每个浏览器会话一次)。
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Modal } from 'animal-island-ui';
import { StarIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import './stats.css';

const SSO_FLAG = 'nailong.stats.sso';

export default function StatsShell({ permission, children }) {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [ssoOpen, setSsoOpen] = useState(() => sessionStorage.getItem(SSO_FLAG) !== '1');

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

  const confirmSso = () => {
    sessionStorage.setItem(SSO_FLAG, '1');
    setSsoOpen(false);
  };

  const cancelSso = () => {
    setSsoOpen(false);
    navigate('/');
  };

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

      <Modal
        maskClosable={false}
        open={ssoOpen}
        title={t('stat.sso.title')}
        onClose={cancelSso}
        typewriter={false}
        footer={
          <>
            <Button onClick={cancelSso}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={confirmSso}>
              {t('stat.sso.confirm')}
            </Button>
          </>
        }
      >
        <div className="stat-sso-body">
          <Card pattern="app-blue" className="stat-sso-card">
            <div className="stat-sso-identity">
              <Avatar size="large">{(user?.displayName || user?.username || '?').slice(0, 1)}</Avatar>
              <div>
                <div className="stat-sso-name">{user?.displayName || user?.username}</div>
                <div className="stat-sso-account">@{user?.username}</div>
              </div>
            </div>
          </Card>
          <p className="muted-text">{t('stat.sso.tip')}</p>
        </div>
      </Modal>
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