// 皇家口岸入境署 Shell:改用共享 OfficeShell 骨架。原壳只有 SSO 门,横幅与页签由各页
// 自渲染,现由壳统一提供标题条与页签,并按路由前缀自动切换用户/管理页签。
import { useTranslation } from 'react-i18next';
import OfficeShell from '../../components/office/OfficeChrome.jsx';

export default function ImmShell({ permission, children }) {
  const { t } = useTranslation();
  return (
    <OfficeShell
      officeKey="immigration"
      permission={permission}
      pageClassName="im-page"
      name={t('imm.officeName')}
      sub={t('imm.officeSub')}
      ssoFlag="nailong.immigration.sso"
      ssoTip={t('imm.sso.tip')}
      ssoPattern="app-teal"
      userTabs={[
        { to: '/immigration', end: true, label: t('imm.nav.home') },
        { to: '/immigration/ports', label: t('imm.nav.ports') },
        { to: '/immigration/declarations', label: t('imm.nav.myDeclarations') },
        { to: '/immigration/pass-codes', label: t('imm.nav.passCodes') },
        { to: '/immigration/records', label: t('imm.nav.records') },
        { to: '/immigration/messages', label: t('imm.nav.messages') },
        { to: '/immigration/help', label: t('imm.nav.help') },
      ]}
      adminTabs={[
        { to: '/admin/immigration/ports', label: t('imm.admin.tabs.ports') },
        { to: '/admin/immigration/review', label: t('imm.admin.tabs.review') },
        { to: '/admin/immigration/verify', label: t('imm.admin.tabs.verify') },
        { to: '/admin/immigration/records', label: t('imm.admin.tabs.records') },
        { to: '/admin/immigration/stats', label: t('imm.admin.tabs.stats') },
        { to: '/admin/immigration/settings', label: t('imm.admin.tabs.settings') },
        { to: '/admin/immigration/audit', label: t('imm.admin.tabs.audit') },
      ]}
    >
      {children}
    </OfficeShell>
  );
}
