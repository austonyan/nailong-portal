// 外交事务署 Shell:改用共享 OfficeShell 骨架。原壳只有横幅与 SSO 门、页签由各页
// 自渲染,现由壳统一提供标题条与页签,并按路由前缀自动切换用户/管理页签。
import { useTranslation } from 'react-i18next';
import OfficeShell from '../../components/office/OfficeChrome.jsx';

export default function DipShell({ permission, children }) {
  const { t } = useTranslation();
  return (
    <OfficeShell
      officeKey="dip"
      permission={permission}
      pageClassName="dip-page"
      name={t('dip.officeName')}
      sub={t('dip.officeSub')}
      ssoFlag="nailong.dip.sso"
      ssoTip={t('dip.sso.tip')}
      ssoPattern="purple"
      userTabs={[
        { to: '/dip', end: true, label: t('dip.nav.home') },
        { to: '/dip/apply', label: t('dip.nav.apply') },
        { to: '/dip/relations', label: t('dip.nav.relations') },
        { to: '/dip/identity', label: t('dip.nav.identity') },
        { to: '/dip/agreements', label: t('dip.nav.agreements') },
        { to: '/dip/courtesies', label: t('dip.nav.courtesies') },
        { to: '/dip/offices', label: t('dip.nav.offices') },
        { to: '/dip/messages', label: t('dip.nav.messages') },
      ]}
      adminTabs={[
        { to: '/admin/dip/review', label: t('dip.admin.tabs.review') },
        { to: '/admin/dip/agreements', label: t('dip.admin.tabs.agreements') },
        { to: '/admin/dip/offices', label: t('dip.admin.tabs.offices') },
        { to: '/admin/dip/verify', label: t('dip.admin.tabs.verify') },
        { to: '/admin/dip/config', label: t('dip.admin.tabs.config') },
        { to: '/admin/dip/stats', label: t('dip.admin.tabs.stats') },
        { to: '/admin/dip/audit', label: t('dip.admin.tabs.audit') },
      ]}
    >
      {children}
    </OfficeShell>
  );
}
