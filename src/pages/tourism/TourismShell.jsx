// 文化旅游署 Shell:改用共享 OfficeShell 骨架。原用户页签尾随一条「管理」链接、管理页签
// 另起一条导航,现按路由前缀自动切换:始终只有一条页签栏,管理页签从侧栏「管理台」进。
import { useTranslation } from 'react-i18next';
import OfficeShell from '../../components/office/OfficeChrome.jsx';
import './tourism.css';

export default function TourismShell({ permission, children }) {
  const { t } = useTranslation();
  return (
    <OfficeShell
      officeKey="tourism"
      permission={permission}
      pageClassName="tour-page"
      name={t('tour.officeName')}
      sub={t('tour.officeSub')}
      ssoFlag="nailong.tourism.sso"
      ssoTip={t('tour.sso.tip')}
      ssoPattern="app-pink"
      userTabs={[
        { to: '/tourism', end: true, label: t('tour.nav.home') },
        { to: '/tourism/attractions', label: t('tour.nav.attractions') },
        { to: '/tourism/articles', label: t('tour.nav.articles') },
        { to: '/tourism/collection', label: t('tour.nav.collection') },
        { to: '/tourism/badges', label: t('tour.nav.badges') },
        { to: '/tourism/my', label: t('tour.nav.my') },
      ]}
      adminTabs={[
        { to: '/tourism/admin/attractions', label: t('tour.admin.tabs.attractions') },
        { to: '/tourism/admin/articles', label: t('tour.admin.tabs.articles') },
        { to: '/tourism/admin/rules', label: t('tour.admin.tabs.rules') },
        { to: '/tourism/admin/badges', label: t('tour.admin.tabs.badges') },
        { to: '/tourism/admin/stats', label: t('tour.admin.tabs.stats') },
        { to: '/tourism/admin/audit', label: t('tour.admin.tabs.audit') },
      ]}
    >
      {children}
    </OfficeShell>
  );
}
