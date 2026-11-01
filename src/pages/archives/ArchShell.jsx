// 皇家档案与记录署 Shell:改用共享 OfficeShell 骨架。原用户导航与管理导航两套标记、
// 横幅角标靠 admin 属性区分,现按路由前缀自动切换,管理路由统一挂「管理台」角标。
import { useTranslation } from 'react-i18next';
import OfficeShell from '../../components/office/OfficeChrome.jsx';
import './archives.css';

export default function ArchShell({ permission = 'arch:portal', children }) {
  const { t } = useTranslation();
  return (
    <OfficeShell
      officeKey="archives"
      permission={permission}
      pageClassName="arch-page"
      name={t('arch.officeName')}
      sub={t('arch.officeSub')}
      ssoFlag="nailong.archives.sso"
      ssoTip={t('arch.sso.tip')}
      userTabs={[
        { to: '/archives', end: true, label: t('arch.nav.home') },
        { to: '/archives/records', label: t('arch.nav.records') },
        { to: '/archives/requests', label: t('arch.nav.requests') },
        { to: '/archives/messages', label: t('arch.nav.messages') },
        { to: '/archives/help', label: t('arch.nav.help') },
      ]}
      adminTabs={[
        { to: '/archives/admin/rules', label: t('arch.nav.rules') },
        { to: '/archives/admin/records', label: t('arch.nav.records') },
        { to: '/archives/admin/requests', label: t('arch.nav.requests') },
        { to: '/archives/admin/access', label: t('arch.nav.access') },
        { to: '/archives/admin/audit', label: t('arch.nav.audit') },
        { to: '/archives/admin/settings', label: t('arch.nav.settings') },
      ]}
    >
      {children}
    </OfficeShell>
  );
}
