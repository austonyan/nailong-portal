import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Title } from 'animal-island-ui';
import { ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const TABS = [
  { to: '/docs', key: 'home', end: true },
  { to: '/docs/types', key: 'types' },
  { to: '/docs/apply', key: 'apply' },
  { to: '/docs/applications', key: 'applications' },
  { to: '/docs/certificates', key: 'certificates' },
  { to: '/docs/verify', key: 'verify' },
  { to: '/docs/messages', key: 'messages', badge: true },
];

export const DOCS_MSG_REFRESH = 'docs:msg-refresh';

export default function DocsLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(() => {
    api
      .get('/docs/messages/unread')
      .then((d) => setUnread(d.unread || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshUnread();
    const onChange = () => refreshUnread();
    window.addEventListener(DOCS_MSG_REFRESH, onChange);
    return () => window.removeEventListener(DOCS_MSG_REFRESH, onChange);
  }, [refreshUnread, location.pathname]);

  const name = user?.displayName || user?.username || '';

  return (
    <div className="docs-page">
      <div className="docs-hero">
        <Title size="large">{t('docs.title')}</Title>
        <p className="muted-text docs-hero-sub">{t('docs.subtitle', { name })}</p>
      </div>

      <nav className="docs-subnav" aria-label={t('docs.title')}>
        {TABS.map((tab) => (
          <NavLink key={tab.key} to={tab.to} end={tab.end} className={({ isActive }) => (isActive ? 'docs-tab active' : 'docs-tab')}>
            {t(`docs.tab.${tab.key}`)}
            {tab.badge && unread > 0 && (
              <span className="docs-tab-badge">
                <Badge count={unread} size="small" />
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
