// 统计署 Shell:改用共享 OfficeShell 骨架。原 3 个用户页签与 4 个管理页签混排一行、
// 管理页签又由 StatsAdminNav 重复一份,现按路由前缀自动切换,始终只有一条页签栏。
import { useTranslation } from 'react-i18next';
import OfficeShell from '../../components/office/OfficeChrome.jsx';
import './stats.css';

export default function StatsShell({ permission, children }) {
  const { t } = useTranslation();
  return (
    <OfficeShell
      officeKey="stats"
      permission={permission}
      pageClassName="stat-page"
      name={t('stat.officeName')}
      sub={t('stat.officeSub')}
      ssoFlag="nailong.stats.sso"
      ssoTip={t('stat.sso.tip')}
      ssoPattern="app-blue"
      userTabs={[
        { to: '/stats', end: true, label: t('stat.nav.home') },
        { to: '/stats/reports', label: t('stat.nav.reports') },
        { to: '/stats/guide', label: t('stat.nav.guide') },
      ]}
      adminTabs={[
        { to: '/stats/admin/dashboard', label: t('stat.admin.tabs.dashboard'), permission: 'stat:manage' },
        { to: '/stats/admin/metrics', label: t('stat.admin.tabs.metrics'), permission: 'stat:manage' },
        { to: '/stats/admin/export', label: t('stat.admin.tabs.export'), permission: 'stat:manage' },
        { to: '/stats/admin/audit', label: t('stat.admin.tabs.audit'), permission: 'stat:manage' },
      ]}
    >
      {children}
    </OfficeShell>
  );
}
