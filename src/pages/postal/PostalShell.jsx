// 邮政与通信署 Shell:改用共享 OfficeShell 骨架。原 5 个用户页签与 6 个管理页签经分隔线
// 混排一行,现按路由前缀自动切换:用户页签只放市民功能,管理页签从侧栏「管理台」进。
import { useTranslation } from 'react-i18next';
import OfficeShell from '../../components/office/OfficeChrome.jsx';
import './postal.css';

export default function PostalShell({ permission, children }) {
  const { t } = useTranslation();
  return (
    <OfficeShell
      officeKey="postal"
      permission={permission}
      pageClassName="postal-page"
      name={t('post.officeName')}
      sub={t('post.officeSub')}
      ssoFlag="nailong.postal.sso"
      ssoTip={t('post.sso.tip')}
      ssoPattern="app-blue"
      userTabs={[
        { to: '/postal', end: true, label: t('post.nav.home') },
        { to: '/postal/notices', label: t('post.nav.notices') },
        { to: '/postal/messages', label: t('post.nav.messages') },
        { to: '/postal/postcards', label: t('post.nav.postcards') },
        { to: '/postal/subscription', label: t('post.nav.subscription') },
      ]}
      adminTabs={[
        { to: '/postal/admin/notices', label: t('post.nav.adminNotices') },
        { to: '/postal/admin/templates', label: t('post.nav.adminTemplates') },
        { to: '/postal/admin/card-templates', label: t('post.nav.adminCardTemplates') },
        { to: '/postal/admin/postcards', label: t('post.nav.adminPostcards') },
        { to: '/postal/admin/stats', label: t('post.nav.adminStats') },
        { to: '/postal/admin/audit', label: t('post.nav.adminAudit') },
      ]}
    >
      {children}
    </OfficeShell>
  );
}
