// 全局导航数据:侧栏只对管理员显示,层级到「署 → 管理台」,署内板块仍由
// 各署页面自己的横向标签导航承担。
//
// 本文件必须保持纯数据(不 import 任何模块),`scripts/check-i18n.mjs` 会直接
// import 它来校验 labelKey —— 这些 key 是经变量传给 t() 的,源码扫描看不到。
//
// office.permission   是否在侧栏列出该署(与门户服务卡的服务权限一致)
// office.admin.base   该署后台路由前缀,用于侧栏高亮与面包屑归属
// office.admin.entries 管理台入口候选:取第一个当前用户有权限的;全无权限则不显示

export const OFFICE_NAV = [
  {
    key: 'visa',
    base: '/visa',
    labelKey: 'nav.visa',
    icon: 'BadgeCheckIcon',
    permission: 'visa:apply',
    admin: {
      base: '/visa/admin',
      entries: [
        { to: '/visa/admin/workbench', permission: 'visa:review' },
        { to: '/visa/admin/manage', permission: 'visa:manage' },
      ],
    },
  },
  {
    key: 'immigration',
    base: '/immigration',
    labelKey: 'nav.immigration',
    icon: 'AnchorIcon',
    permission: 'imm:portal',
    admin: {
      base: '/admin/immigration',
      entries: [
        { to: '/admin/immigration/review', permission: 'imm:inspect' },
        { to: '/admin/immigration/verify', permission: 'imm:verify' },
        { to: '/admin/immigration/ports', permission: 'imm:admin' },
      ],
    },
  },
  {
    key: 'dip',
    base: '/dip',
    labelKey: 'nav.diplomacy',
    icon: 'CompassIcon',
    permission: 'dip:portal',
    admin: {
      base: '/admin/dip',
      entries: [
        { to: '/admin/dip/review', permission: 'dip:review' },
        { to: '/admin/dip/agreements', permission: 'dip:admin' },
      ],
    },
  },
  {
    key: 'resident',
    base: '/resident',
    labelKey: 'nav.resident',
    icon: 'UsersIcon',
    permission: 'res:portal',
    admin: {
      base: '/resident/admin',
      entries: [
        { to: '/resident/admin/review', permission: 'res:review' },
        { to: '/resident/admin/types', permission: 'res:manage' },
      ],
    },
  },
  {
    key: 'protocol',
    base: '/protocol',
    labelKey: 'nav.protocol',
    icon: 'CalendarIcon',
    permission: 'evt:portal',
    admin: {
      base: '/protocol/admin',
      entries: [
        { to: '/protocol/admin/review', permission: 'evt:review' },
        { to: '/protocol/admin/checkin', permission: 'evt:checkin' },
        { to: '/protocol/admin/events', permission: 'evt:manage' },
      ],
    },
  },
  {
    key: 'docs',
    base: '/docs',
    labelKey: 'nav.docs',
    icon: 'BookIcon',
    permission: 'docs:apply',
    admin: {
      base: '/admin/docs',
      entries: [
        { to: '/admin/docs/review', permission: 'docs:certify' },
        { to: '/admin/docs/types', permission: 'docs:manage' },
      ],
    },
  },
  {
    key: 'appeal',
    base: '/appeal',
    labelKey: 'nav.appeal',
    icon: 'ShieldIcon',
    permission: 'appeal:apply',
    admin: {
      base: '/appeal/admin',
      entries: [
        { to: '/appeal/admin/workbench', permission: 'appeal:process' },
        { to: '/appeal/admin/reviews', permission: 'appeal:review' },
        { to: '/appeal/admin/inspect', permission: 'appeal:inspect' },
        { to: '/appeal/admin/manage', permission: 'appeal:manage' },
      ],
    },
  },
  {
    key: 'tourism',
    base: '/tourism',
    labelKey: 'nav.tourism',
    icon: 'MapIcon',
    permission: 'tour:portal',
    admin: {
      base: '/tourism/admin',
      entries: [{ to: '/tourism/admin/attractions', permission: 'tour:manage' }],
    },
  },
  {
    key: 'postal',
    base: '/postal',
    labelKey: 'nav.postal',
    icon: 'MailIcon',
    permission: 'post:portal',
    admin: {
      base: '/postal/admin',
      entries: [{ to: '/postal/admin/notices', permission: 'post:manage' }],
    },
  },
  {
    key: 'archives',
    base: '/archives',
    labelKey: 'nav.archives',
    icon: 'FolderIcon',
    permission: 'arch:portal',
    admin: {
      base: '/archives/admin',
      entries: [{ to: '/archives/admin/requests', permission: 'arch:manage' }],
    },
  },
  {
    key: 'stats',
    base: '/stats',
    labelKey: 'nav.stats',
    icon: 'StarIcon',
    permission: 'stat:portal',
    admin: {
      base: '/stats/admin',
      entries: [{ to: '/stats/admin/dashboard', permission: 'stat:manage' }],
    },
  },
  {
    key: 'education',
    base: '/education',
    labelKey: 'nav.education',
    icon: 'BulbIcon',
    permission: 'edu:portal',
    admin: {
      base: '/education/admin',
      entries: [
        { to: '/education/admin/review', permission: 'edu:review' },
        { to: '/education/admin/entries', permission: 'edu:manage' },
      ],
    },
  },
];

export const SYSTEM_NAV = [
  { to: '/admin/users', labelKey: 'nav.users', permission: 'users:read' },
  { to: '/admin/roles', labelKey: 'nav.roles', permission: 'roles:read' },
  { to: '/admin/services', labelKey: 'nav.services', permission: 'services:read' },
];

// 侧栏/面包屑会渲染的所有词条 —— 供 check:i18n 校验。
export const NAV_LABEL_KEYS = [
  'app.name',
  'nav.portal',
  'nav.profile',
  'nav.adminDesk',
  'nav.sectionServices',
  'nav.sectionAccount',
  'nav.system',
  'nav.menu',
  ...OFFICE_NAV.map((office) => office.labelKey),
  ...SYSTEM_NAV.map((item) => item.labelKey),
];

const hasPath = (pathname, base) => pathname === base || pathname.startsWith(`${base}/`);

export function adminEntry(office, can) {
  if (!office.admin) return null;
  return office.admin.entries.find((entry) => can(entry.permission)) ?? null;
}

export function officeForPath(pathname) {
  return OFFICE_NAV.find((office) => (
    hasPath(pathname, office.base) || (office.admin ? hasPath(pathname, office.admin.base) : false)
  )) ?? null;
}

export function isAdminPath(pathname, office) {
  return Boolean(office?.admin) && hasPath(pathname, office.admin.base);
}

// 面包屑:返回要顺序展示的词条 key,由调用方 t() 渲染。
export function breadcrumbKeys(pathname) {
  if (pathname === '/') return ['nav.portal'];
  if (pathname === '/profile') return ['nav.profile'];
  const system = SYSTEM_NAV.find((item) => hasPath(pathname, item.to));
  if (system) return ['nav.system', system.labelKey];
  const office = officeForPath(pathname);
  if (!office) return [];
  return isAdminPath(pathname, office) ? [office.labelKey, 'nav.adminDesk'] : [office.labelKey];
}

// 侧栏只给管理员看:admin 角色,或持有任一管理类权限。
// 普通账号只有 portal/apply 权限,因此看到的仍是纯门户形态。
export function isPortalAdmin({ can, hasRole }) {
  if (hasRole && hasRole('admin')) return true;
  if (SYSTEM_NAV.some((item) => can(item.permission))) return true;
  return OFFICE_NAV.some((office) => (
    (office.admin?.entries ?? []).some((entry) => can(entry.permission))
  ));
}