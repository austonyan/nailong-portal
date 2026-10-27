// 管理员专属侧栏:门户首页 / 12 个署(各挂一条「管理台」) / 个人资料 / 系统管理。
// 署内板块仍由各署页面自己的横向标签导航承担,侧栏只到「署 → 管理台」。
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AnchorIcon,
  BadgeCheckIcon,
  BookIcon,
  BulbIcon,
  CalendarIcon,
  CompassIcon,
  FolderIcon,
  HomeIcon,
  MailIcon,
  MapIcon,
  SailboatIcon,
  SettingsIcon,
  ShieldIcon,
  StarIcon,
  UserIcon,
  UsersIcon,
} from 'naive-icons';
import { useAuth } from '../auth/AuthContext.jsx';
import { OFFICE_NAV, SYSTEM_NAV, adminEntry, isAdminPath, officeForPath } from '../nav/navConfig.js';

const OFFICE_ICONS = {
  BadgeCheckIcon,
  AnchorIcon,
  CompassIcon,
  UsersIcon,
  CalendarIcon,
  BookIcon,
  ShieldIcon,
  MapIcon,
  MailIcon,
  FolderIcon,
  StarIcon,
  BulbIcon,
};

const SYSTEM_ICONS = [UsersIcon, ShieldIcon, SettingsIcon];

export default function Sidebar({ onNavigate, embedded = false }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { pathname } = useLocation();

  const currentOffice = officeForPath(pathname);
  // 有门户权限就列该署;只有管理权限(如仅 evt:checkin 的签到员)也列出,
  // 否则侧栏里没有去他工作台的入口。
  const offices = OFFICE_NAV.filter((office) => can(office.permission) || Boolean(adminEntry(office, can)));
  const systemItems = SYSTEM_NAV.filter((item) => can(item.permission));

  const linkClass = (active) => (active ? 'sider-link active' : 'sider-link');
  const subLinkClass = (active) => (active ? 'sider-sublink active' : 'sider-sublink');

  return (
    <aside className={`app-sider${embedded ? ' app-sider-embedded' : ''}`}>
      <NavLink to="/" className="sider-brand" onClick={onNavigate}>
        <SailboatIcon size={24} className="brand-icon" />
        <span>{t('app.name')}</span>
      </NavLink>

      <nav className="app-sider-nav" aria-label={t('nav.menu')}>
        <NavLink to="/" end className={linkClass(pathname === '/')} onClick={onNavigate}>
          <HomeIcon size={18} />
          <span>{t('nav.portal')}</span>
        </NavLink>

        {offices.length > 0 && (
          <div className="sider-section" role="presentation">{t('nav.sectionServices')}</div>
        )}
        {offices.map((office) => {
          const Icon = OFFICE_ICONS[office.icon] ?? HomeIcon;
          const entry = adminEntry(office, can);
          const isCurrent = currentOffice?.key === office.key;
          const adminActive = isAdminPath(pathname, office);
          return (
            <div key={office.key} className="sider-office">
              <NavLink to={office.base} className={linkClass(isCurrent)} onClick={onNavigate}>
                <Icon size={18} />
                <span>{t(office.labelKey)}</span>
              </NavLink>
              {entry && (
                <NavLink to={entry.to} className={subLinkClass(adminActive)} onClick={onNavigate}>
                  <SettingsIcon size={14} />
                  <span>{t('nav.adminDesk')}</span>
                </NavLink>
              )}
            </div>
          );
        })}

        <div className="sider-section" role="presentation">{t('nav.sectionAccount')}</div>
        <NavLink to="/profile" className={linkClass(pathname === '/profile')} onClick={onNavigate}>
          <UserIcon size={18} />
          <span>{t('nav.profile')}</span>
        </NavLink>

        {systemItems.length > 0 && (
          <>
            <div className="sider-section" role="presentation">{t('nav.system')}</div>
            {systemItems.map((item, index) => {
              const Icon = SYSTEM_ICONS[index] ?? SettingsIcon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={linkClass(pathname === item.to)}
                  onClick={onNavigate}
                >
                  <Icon size={18} />
                  <span>{t(item.labelKey)}</span>
                </NavLink>
              );
            })}
          </>
        )}
      </nav>
    </aside>
  );
}