// 署级页面骨架的共享实现:标题条(OfficeBanner)、署内页签(OfficeTabs)与
// Shell(OfficeShell)。12 个署的 Shell 只保留自己的配置(署名、页签、
// SSO 提示),署徽由 OfficeShell 按 navConfig 的 office.icon 自取,
// 不再各自维护一套横幅/页签标记与样式。
//
// 约定(2026-11-02 署内导航统一轮):
// - 标题在上、页签在下;任何时刻只有一条页签栏。
// - 用户页签只放市民功能;管理功能一律从侧栏「管理台」进入,管理路由下
//   Shell 按 navConfig 的 admin.base 自动切换成管理页签。
// - 页签标签必须以字面量 t('...') 写在各署 Shell 配置里(不得拼动态 key),
//   这样 check:i18n 的源码扫描能看到;管理页签角标统一用 nav.adminDesk。
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from 'animal-island-ui';
import { useAuth } from '../../auth/AuthContext.jsx';
import SsoConfirmModal from '../SsoConfirmModal.jsx';
import { OFFICE_NAV, isAdminPath } from '../../nav/navConfig.js';
import {
  AnchorIcon,
  BadgeCheckIcon,
  BookIcon,
  BulbIcon,
  CalendarIcon,
  CompassIcon,
  FolderIcon,
  HomeIcon,
  MailIcon,
  MapIcon,
  ShieldIcon,
  StarIcon,
  UsersIcon,
} from 'naive-icons';

// 署徽映射与 Sidebar.jsx 同一套:navConfig 只存 naive-icons 的图标名,这里按名取组件。
// AnchorIcon / FolderIcon 不在 icons.js 的服务卡图标表里,所以与侧栏一样自带映射。
const OFFICE_ICONS = {
  BadgeCheckIcon,
  AnchorIcon,
  CompassIcon,
  UsersIcon,
  CalendarIcon,
  BookIcon,
  ShieldIcon,
  MapIcon,
  MailIcon,
  FolderIcon,
  StarIcon,
  BulbIcon,
};

// 各署大标题飘带的安全色(docs/ui-spec 01-foundations §1.5:只有这四色能
// 承载飘带文字,其余库色白字对比度不过 3:1 大字号线)。按署分组取色,
// 同一署的所有页面保持一致;门户级页面用 brown。
export const OFFICE_RIBBON_COLOR = {
  visa: 'brown',
  docs: 'brown',
  archives: 'brown',
  postal: 'app-yellow',
  tourism: 'app-yellow',
  education: 'app-yellow',
  immigration: 'lime-green',
  resident: 'lime-green',
  stats: 'lime-green',
  dip: 'yellow-green',
  protocol: 'yellow-green',
  appeal: 'yellow-green',
};

export function officeRibbonColor(officeKey) {
  return OFFICE_RIBBON_COLOR[officeKey] ?? 'brown';
}

// 标题条:徽章 + 署名 + 副名;adminTag 用于管理路由下的「管理台」角标。
export function OfficeBanner({ icon, name, sub, adminTag, children }) {
  return (
    <div className="nl-office-banner">
      <div className="nl-office-brand">
        <span className="nl-office-emblem">{icon}</span>
        <div>
          <div className="nl-office-name">{name}</div>
          <div className="nl-office-sub">{sub}</div>
        </div>
      </div>
      {adminTag ? <div className="nl-office-tag">{adminTag}</div> : null}
      {children}
    </div>
  );
}

// 唯一的署内页签条。tabs: [{ to, end?, label, badge?, permission?, permissions? }],
// label 必须由调用方用字面量 t() 传进来。
export function OfficeTabs({ tabs, label }) {
  const { can } = useAuth();
  const visible = tabs.filter((tab) => {
    if (tab.permission && !can(tab.permission)) return false;
    if (tab.permissions && !tab.permissions.some((p) => can(p))) return false;
    return true;
  });
  if (visible.length === 0) return null;
  return (
    <nav className="nl-tabs" aria-label={label}>
      {visible.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => (isActive ? 'nl-tab active' : 'nl-tab')}
        >
          {tab.label}
          {tab.badge}
        </NavLink>
      ))}
    </nav>
  );
}

// 无权限访问时的整屏提示,与原各署 Shell 保持一致。
export function OfficeForbidden() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="center-screen">
      <h2>{t('errors.forbiddenTitle')}</h2>
      <p className="muted-text">{t('errors.forbiddenTip')}</p>
      <Button type="primary" onClick={() => navigate('/')}>
        {t('errors.backHome')}
      </Button>
    </div>
  );
}

// 署 Shell:权限门 + 标题条 + 单一页签栏 + SSO 身份确认。
// admin 由当前路径与该署 navConfig.admin.base 自动判定,管理路由渲染管理页签;
// 署徽由 officeKey 查 navConfig 的 icon 名自取,调用方不再传图标。
export default function OfficeShell({
  officeKey,
  permission,
  pageClassName,
  name,
  sub,
  userTabs,
  adminTabs,
  ssoFlag,
  ssoTip,
  ssoPattern,
  children,
}) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const location = useLocation();

  if (permission && !can(permission)) {
    return <OfficeForbidden />;
  }

  const office = OFFICE_NAV.find((o) => o.key === officeKey);
  const admin = isAdminPath(location.pathname, office);
  const Icon = OFFICE_ICONS[office?.icon] ?? HomeIcon;

  return (
    <div className={pageClassName}>
      <OfficeBanner
        icon={<Icon size={22} />}
        name={name}
        sub={sub}
        adminTag={admin ? t('nav.adminDesk') : null}
      />
      <OfficeTabs tabs={admin ? adminTabs : userTabs} label={name} />
      {children}
      <SsoConfirmModal flag={ssoFlag} tip={ssoTip} pattern={ssoPattern} />
    </div>
  );
}
