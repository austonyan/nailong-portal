// 居民登记署 Shell:改用共享 OfficeShell 骨架。原用户页签混入两条管理链接、管理页签
// 另起一条导航,现按路由前缀自动切换:用户页签只放市民功能,管理页签从侧栏「管理台」进。
import { useTranslation } from 'react-i18next';
import OfficeShell from '../../components/office/OfficeChrome.jsx';

export default function ResidentShell({ permission, children }) {
  const { t } = useTranslation();
  return (
    <OfficeShell
      officeKey="resident"
      permission={permission}
      pageClassName="res-page"
      name={t('res.officeName')}
      sub={t('res.officeSub')}
      ssoFlag="nailong.resident.sso"
      ssoTip={t('res.sso.tip')}
      ssoPattern="app-green"
      userTabs={[
        { to: '/resident', end: true, label: t('res.nav.home') },
        { to: '/resident/guide', label: t('res.nav.guide') },
        { to: '/resident/apply', label: t('res.nav.apply') },
        { to: '/resident/applications', label: t('res.nav.applications') },
        { to: '/resident/card', label: t('res.nav.card') },
        { to: '/resident/changes', label: t('res.nav.changes') },
        { to: '/resident/benefits', label: t('res.nav.benefits') },
        { to: '/resident/messages', label: t('res.nav.messages') },
      ]}
      adminTabs={[
        { to: '/resident/admin/review', label: t('res.admin.tabs.review'), permission: 'res:review' },
        { to: '/resident/admin/changes', label: t('res.admin.tabs.changes'), permission: 'res:review' },
        { to: '/resident/admin/cards', label: t('res.admin.tabs.cards'), permission: 'res:review' },
        { to: '/resident/admin/residents', label: t('res.admin.tabs.residents'), permission: 'res:review' },
        { to: '/resident/admin/verify', label: t('res.admin.tabs.verify'), permission: 'res:manage' },
        { to: '/resident/admin/types', label: t('res.admin.tabs.types'), permission: 'res:manage' },
        { to: '/resident/admin/notices', label: t('res.admin.tabs.notices'), permission: 'res:manage' },
        { to: '/resident/admin/risk', label: t('res.admin.tabs.risk'), permission: 'res:manage' },
        { to: '/resident/admin/stats', label: t('res.admin.tabs.stats'), permission: 'res:manage' },
        { to: '/resident/admin/settings', label: t('res.admin.tabs.settings'), permission: 'res:manage' },
        { to: '/resident/admin/audit', label: t('res.admin.tabs.audit'), permission: 'res:manage' },
      ]}
    >
      {children}
    </OfficeShell>
  );
}
