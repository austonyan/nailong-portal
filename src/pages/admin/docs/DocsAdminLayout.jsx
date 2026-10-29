import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../auth/AuthContext.jsx';

const ITEMS = [
  { to: '/admin/docs/review', key: 'review', perm: 'docs:certify' },
  { to: '/admin/docs/types', key: 'types', perm: 'docs:manage' },
  { to: '/admin/docs/certs', key: 'certs', perm: 'docs:manage' },
  { to: '/admin/docs/verify', key: 'verify', perm: 'docs:manage' },
  { to: '/admin/docs/stats', key: 'stats', perm: 'docs:manage' },
  { to: '/admin/docs/notices', key: 'notices', perm: 'docs:manage' },
  { to: '/admin/docs/audit', key: 'audit', perm: 'docs:manage' },
  { to: '/admin/docs/settings', key: 'settings', perm: 'docs:manage' },
];

// 文书署管理端骨架: 菜单项按权限过滤,认证员只看得到审核工作台(队列隔离)。
export default function DocsAdminLayout() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const visible = ITEMS.filter((i) => can(i.perm));

  return (
    <div className="docs-page">
      <div className="docs-hero docs-hero-admin">
        <div className="docs-admin-title">{t('docs.admin.title')}</div>
      </div>
      <nav className="docs-subnav" aria-label={t('docs.admin.title')}>
        {visible.map((item) => (
          <NavLink key={item.key} to={item.to} className={({ isActive }) => (isActive ? 'docs-tab active' : 'docs-tab')}>
            {t(`docs.admin.tab.${item.key}`)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
