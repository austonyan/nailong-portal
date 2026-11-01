// 文化旅游署 Shell:署内导航 + 进入服务时的 SSO 身份确认(每浏览器会话一次,
// 直连 URL 同样强制),与签证署 / 居民署的 Shell 行为一致。
import './tourism.css';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from 'animal-island-ui';
import { MapIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import SsoConfirmModal from '../../components/SsoConfirmModal.jsx';

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

      <SsoConfirmModal flag="nailong.tourism.sso" tip={t('tour.sso.tip')} pattern="app-pink" />
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