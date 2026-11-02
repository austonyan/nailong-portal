// 礼宾与活动署 Shell:改用共享 OfficeShell 骨架。原壳靠 variant 区分前后台、横幅上还有
// 前台/工作台互跳按钮,现按路由前缀自动切换,管理页签按权限过滤,不再要任何切换按钮。
import { useTranslation } from 'react-i18next';
import OfficeShell from '../../components/office/OfficeChrome.jsx';
import './protocol.css';

export default function ProtocolShell({ permission, children }) {
  const { t } = useTranslation();
  return (
    <OfficeShell
      officeKey="protocol"
      permission={permission}
      pageClassName="protocol-page"
      name={t('protocol.officeName')}
      sub={t('protocol.officeSub')}
      ssoFlag="nailong.protocol.sso"
      ssoTip={t('protocol.sso.tip')}
      ssoPattern="app-teal"
      userTabs={[
        { to: '/protocol', end: true, label: t('protocol.nav.home') },
        { to: '/protocol/events', label: t('protocol.nav.events') },
        { to: '/protocol/registrations', label: t('protocol.nav.registrations') },
        { to: '/protocol/invitations', label: t('protocol.nav.invitations') },
        { to: '/protocol/passes', label: t('protocol.nav.passes') },
        { to: '/protocol/hosts', label: t('protocol.nav.hosts') },
        { to: '/protocol/courtesy', label: t('protocol.nav.courtesy') },
        { to: '/protocol/messages', label: t('protocol.nav.messages') },
        { to: '/protocol/help', label: t('protocol.nav.help') },
      ]}
      adminTabs={[
        { to: '/protocol/admin/review', label: t('protocol.nav.review'), permissions: ['evt:review', 'evt:manage'] },
        { to: '/protocol/admin/events', label: t('protocol.nav.adminEvents'), permissions: ['evt:manage'] },
        { to: '/protocol/admin/issuance', label: t('protocol.nav.issuance'), permissions: ['evt:manage'] },
        { to: '/protocol/admin/hosts', label: t('protocol.nav.adminHosts'), permissions: ['evt:review', 'evt:manage'] },
        { to: '/protocol/admin/courtesy', label: t('protocol.nav.adminCourtesy'), permissions: ['evt:review', 'evt:manage'] },
        { to: '/protocol/admin/checkin', label: t('protocol.nav.checkin'), permissions: ['evt:checkin', 'evt:manage'] },
        { to: '/protocol/admin/manage', label: t('protocol.nav.manage'), permissions: ['evt:manage'] },
        { to: '/protocol/admin/stats', label: t('protocol.nav.stats'), permissions: ['evt:manage'] },
        { to: '/protocol/admin/audit', label: t('protocol.nav.audit'), permissions: ['evt:manage'] },
      ]}
    >
      {children}
    </OfficeShell>
  );
}
