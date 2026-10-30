// 文化旅游署 Shell:署内导航 + 进入服务时的 SSO 身份确认(每浏览器会话一次,
// 直连 URL 同样强制),与签证署 / 居民署的 Shell 行为一致。
import './tourism.css';
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Modal } from 'animal-island-ui';
import { MapIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';

const SSO_FLAG = 'nailong.tourism.sso';

const USER_TABS = [
  { to: '/tourism', key: 'home', end: true },
  { to: '/tourism/attractions', key: 'attractions' },
  { to: '/tourism/articles', key: 'articles' },
  { to: '/tourism/collection', key: 'collection' },
  { to: '/tourism/badges', key: 'badges' },
  { to: '/tourism/my', key: 'my' },
];

const ADMIN_TABS = [
  { to: '/tourism/admin/attractions', key: 'attractions' },
  { to: '/tourism/admin/articles', key: 'articles' },
  { to: '/tourism/admin/rules', key: 'rules' },
  { to: '/tourism/admin/badges', key: 'badges' },
  { to: '/tourism/admin/stats', key: 'stats' },
  { to: '/tourism/admin/audit', key: 'audit' },
];

export default function TourismShell({ permission, children }) {
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

  const navClass = ({ isActive }) => (isActive ? 'tour-nav-link active' : 'tour-nav-link');

  return (
    <div className="tour-page">
      <div className="tour-office-banner">
        <div className="tour-office-brand">
          <span className="tour-office-emblem">
            <MapIcon size={22} />
          </span>
          <div>
            <div className="tour-office-name">{t('tour.officeName')}</div>
            <div className="tour-office-sub">{t('tour.officeSub')}</div>
          </div>
        </div>
      </div>

      <nav className="tour-nav" aria-label={t('tour.officeName')}>
        {USER_TABS.map((tab) => (
          <NavLink key={tab.key} to={tab.to} end={tab.end} className={navClass}>
            {t(`tour.nav.${tab.key}`)}
          </NavLink>
        ))}
        {can('tour:manage') && (
          <NavLink to="/tourism/admin/attractions" className={navClass}>
            {t('tour.nav.manage')}
          </NavLink>
        )}
      </nav>

      {children}

      <Modal
        maskClosable={false}
        open={ssoOpen}
        title={t('tour.sso.title')}
        onClose={cancelSso}
        typewriter={false}
        footer={
          <>
            <Button onClick={cancelSso}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={confirmSso}>
              {t('tour.sso.confirm')}
            </Button>
          </>
        }
      >
        <div className="tour-sso-body">
          <Card pattern="app-pink" className="tour-sso-card">
            <div className="tour-sso-identity">
              <Avatar size="large">{(user?.displayName || user?.username || '?').slice(0, 1)}</Avatar>
              <div>
                <div className="tour-sso-name">{user?.displayName || user?.username}</div>
                <div className="tour-sso-account">@{user?.username}</div>
              </div>
            </div>
          </Card>
          <p className="muted-text">{t('tour.sso.tip')}</p>
        </div>
      </Modal>
    </div>
  );
}

// 管理端二级导航(全部页面都需要 tour:manage,仍按权限过滤以保持一致)。
export function TourAdminNav() {
  const { t } = useTranslation();
  const { can } = useAuth();
  if (!can('tour:manage')) return null;
  return (
    <nav className="tour-admin-nav" aria-label={t('tour.admin.navLabel')}>
      {ADMIN_TABS.map((tab) => (
        <NavLink
          key={tab.key}
          to={tab.to}
          className={({ isActive }) => (isActive ? 'tour-nav-link active' : 'tour-nav-link')}
        >
          {t(`tour.admin.tabs.${tab.key}`)}
        </NavLink>
      ))}
    </nav>
  );
}