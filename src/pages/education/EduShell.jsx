// 教育与科学署 Shell:改用共享 OfficeShell 骨架。原用户页签与管理页签由 shared.jsx 的
// EduNav 混排一行,现按路由前缀自动切换:用户页签只放市民功能,管理页签按权限过滤。
import { useTranslation } from 'react-i18next';
import OfficeShell from '../../components/office/OfficeChrome.jsx';
import './education.css';

export default function EduShell({ permission, children }) {
  const { t } = useTranslation();
  return (
    <OfficeShell
      officeKey="education"
      permission={permission}
      pageClassName="edu-page"
      name={t('edu.officeName')}
      sub={t('edu.officeSub')}
      ssoFlag="nailong.education.sso"
      ssoTip={t('edu.sso.tip')}
      ssoPattern="app-blue"
      userTabs={[
        { to: '/education', end: true, label: t('edu.nav.home') },
        { to: '/education/entries', label: t('edu.nav.entries') },
        { to: '/education/articles', label: t('edu.nav.articles') },
        { to: '/education/tasks', label: t('edu.nav.tasks') },
        { to: '/education/my', label: t('edu.nav.my') },
      ]}
      adminTabs={[
        { to: '/education/admin/review', label: t('edu.nav.adminReview'), permission: 'edu:review' },
        { to: '/education/admin/entries', label: t('edu.nav.adminEntries'), permission: 'edu:manage' },
        { to: '/education/admin/articles', label: t('edu.nav.adminArticles'), permission: 'edu:manage' },
        { to: '/education/admin/tasks', label: t('edu.nav.adminTasks'), permission: 'edu:manage' },
        { to: '/education/admin/stats', label: t('edu.nav.adminStats'), permission: 'edu:manage' },
        { to: '/education/admin/audit', label: t('edu.nav.adminAudit'), permission: 'edu:manage' },
        { to: '/education/admin/settings', label: t('edu.nav.adminSettings'), permission: 'edu:manage' },
      ]}
    >
      {children}
    </OfficeShell>
  );
}
