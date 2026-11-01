// 文书署 Layout:改用共享 OfficeShell 骨架,并按路由前缀自动区分前台与管理端(/admin/docs):
// 前台页签带站内信未读角标,管理页签按权限过滤;署名两个模式都用 docs.title,模式由「管理台」角标表达。
import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from 'animal-island-ui';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import OfficeShell from '../../components/office/OfficeChrome.jsx';

export const DOCS_MSG_REFRESH = 'docs:msg-refresh';

export default function DocsLayout({ permission, children }) {
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
    <OfficeShell
      officeKey="docs"
      permission={permission}
      pageClassName="docs-page"
      name={t('docs.title')}
      sub={t('docs.subtitle', { name })}
      ssoFlag="nailong.docs.sso"
      ssoTip={t('docs.sso.tip')}
      ssoPattern="app-teal"
      userTabs={[
        { to: '/docs', end: true, label: t('docs.tab.home') },
        { to: '/docs/types', label: t('docs.tab.types') },
        { to: '/docs/apply', label: t('docs.tab.apply') },
        { to: '/docs/applications', label: t('docs.tab.applications') },
        { to: '/docs/certificates', label: t('docs.tab.certificates') },
        { to: '/docs/verify', label: t('docs.tab.verify') },
        {
          to: '/docs/messages',
          label: t('docs.tab.messages'),
          badge: unread > 0 ? <Badge count={unread} size="small" /> : null,
        },
      ]}
      adminTabs={[
        { to: '/admin/docs/review', label: t('docs.admin.tab.review'), permission: 'docs:certify' },
        { to: '/admin/docs/types', label: t('docs.admin.tab.types'), permission: 'docs:manage' },
        { to: '/admin/docs/certs', label: t('docs.admin.tab.certs'), permission: 'docs:manage' },
        { to: '/admin/docs/verify', label: t('docs.admin.tab.verify'), permission: 'docs:manage' },
        { to: '/admin/docs/stats', label: t('docs.admin.tab.stats'), permission: 'docs:manage' },
        { to: '/admin/docs/notices', label: t('docs.admin.tab.notices'), permission: 'docs:manage' },
        { to: '/admin/docs/audit', label: t('docs.admin.tab.audit'), permission: 'docs:manage' },
        { to: '/admin/docs/settings', label: t('docs.admin.tab.settings'), permission: 'docs:manage' },
      ]}
    >
      {children ?? <Outlet />}
    </OfficeShell>
  );
}
