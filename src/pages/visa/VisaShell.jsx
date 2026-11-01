// 签注申请署 Shell:共享骨架(标题条 + 单一页签栏 + SSO 门)的署级配置。
// 管理页签(workbench/manage/stats/audit)只在管理路由下渲染,用户页签不再混入。
import { useTranslation } from 'react-i18next';
import { BadgeCheckIcon } from 'naive-icons';
import OfficeShell from '../../components/office/OfficeChrome.jsx';

export default function VisaShell({ permission, children }) {
  const { t } = useTranslation();
  return (
    <OfficeShell
      officeKey="visa"
      permission={permission}
      pageClassName="visa-page"
      icon={<BadgeCheckIcon size={22} />}
      name={t('visa.officeName')}
      sub={t('visa.officeSub')}
      ssoFlag="nailong.visa.sso"
      ssoTip={t('visa.sso.tip')}
      ssoPattern="app-teal"
      userTabs={[
        { to: '/visa', end: true, label: t('visa.nav.home') },
        { to: '/visa/applications', label: t('visa.nav.applications') },
        { to: '/visa/permits', label: t('visa.nav.permits') },
        { to: '/visa/messages', label: t('visa.nav.messages') },
      ]}
      adminTabs={[
        { to: '/visa/admin/workbench', label: t('visa.nav.workbench') },
        { to: '/visa/admin/manage', label: t('visa.nav.manage') },
        { to: '/visa/admin/stats', label: t('visa.admin.stats.title') },
        { to: '/visa/admin/audit', label: t('visa.admin.audit.title') },
      ]}
    >
      {children}
    </OfficeShell>
  );
}
