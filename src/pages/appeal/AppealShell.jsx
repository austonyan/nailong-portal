// 申诉与监察署 Shell:改用共享 OfficeShell 骨架。原 10 个用户页签与 7 个管理页签
// 混排一行,现按路由前缀自动切换:用户页签只放市民功能,管理页签从侧栏「管理台」进。
import { useTranslation } from 'react-i18next';
import OfficeShell from '../../components/office/OfficeChrome.jsx';

export default function AppealShell({ permission, children }) {
  const { t } = useTranslation();
  return (
    <OfficeShell
      officeKey="appeal"
      permission={permission}
      pageClassName="appeal-page"
      name={t('appeal.officeName')}
      sub={t('appeal.officeSub')}
      ssoFlag="nailong.appeal.sso"
      ssoTip={t('appeal.sso.tip')}
      ssoPattern="app-teal"
      userTabs={[
        { to: '/appeal', end: true, label: t('appeal.nav.home') },
        { to: '/appeal/apply', label: t('appeal.nav.apply') },
        { to: '/appeal/my', label: t('appeal.nav.my') },
        { to: '/appeal/reviews', label: t('appeal.nav.reviews') },
        { to: '/appeal/complaints', label: t('appeal.nav.complaints') },
        { to: '/appeal/tickets', label: t('appeal.nav.tickets') },
        { to: '/appeal/decisions', label: t('appeal.nav.decisions') },
        { to: '/appeal/publicity', label: t('appeal.nav.publicity') },
        { to: '/appeal/messages', label: t('appeal.nav.messages') },
        { to: '/appeal/guide', label: t('appeal.nav.guide') },
      ]}
      adminTabs={[
        { to: '/appeal/admin/workbench', label: t('appeal.nav.workbench'), permission: 'appeal:process' },
        { to: '/appeal/admin/reviews', label: t('appeal.nav.reviewAdmin'), permission: 'appeal:review' },
        { to: '/appeal/admin/desk', label: t('appeal.nav.desk'), permission: 'appeal:process' },
        { to: '/appeal/admin/inspect', label: t('appeal.nav.inspect'), permission: 'appeal:inspect' },
        { to: '/appeal/admin/manage', label: t('appeal.nav.manage'), permission: 'appeal:manage' },
        { to: '/appeal/admin/stats', label: t('appeal.nav.stats'), permission: 'appeal:manage' },
        { to: '/appeal/admin/audit', label: t('appeal.nav.audit'), permission: 'appeal:manage' },
      ]}
    >
      {children}
    </OfficeShell>
  );
}
