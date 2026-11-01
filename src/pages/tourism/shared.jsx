// 文化旅游署页面的共享片段:类型/状态颜色与图标映射;日期格式化、多行输入框与
// 错误提示统一由共享模块提供,这里只转出/转发,署内调用点保持不变。
/* eslint-disable react/only-export-components */
import {
  BookIcon,
  CameraIcon,
  CatIcon,
  CoffeeCupIcon,
  CompassIcon,
  FlagIcon,
  HeartIcon,
  MapIcon,
  MountainIcon,
  SailboatIcon,
  StarIcon,
  TrophyIcon,
} from 'naive-icons';
import { toastApiError } from '../../components/toast.js';

// 全站唯一的时间格式化实现(src/lib/date.js,带 isValid() 保护)。
export { fmtDate, fmtDateTime } from '../../lib/date.js';
// 全站唯一的多行输入框(src/components/TextArea.jsx)。
export { TextArea } from '../../components/TextArea.jsx';

export const ATTRACTION_TYPES = ['landmark', 'nature', 'culture', 'food'];

export const ATTRACTION_TYPE_COLORS = {
  landmark: 'app-teal',
  nature: 'app-green',
  culture: 'purple',
  food: 'app-pink',
};

const ATTRACTION_ICONS = {
  landmark: MapIcon,
  nature: MountainIcon,
  culture: BookIcon,
  food: CoffeeCupIcon,
};

export const OPEN_STATES = ['open', 'limited', 'closed'];

export const OPEN_STATE_COLORS = {
  open: 'app-green',
  limited: 'warm-peach-pink',
  closed: 'brown',
};

export const ARTICLE_TYPES = ['festival', 'folk', 'world'];

export const ARTICLE_TYPE_COLORS = {
  festival: 'app-pink',
  folk: 'purple',
  world: 'app-teal',
};

export const BADGE_ICON_OPTIONS = [
  'TrophyIcon',
  'StarIcon',
  'CompassIcon',
  'MapIcon',
  'CameraIcon',
  'HeartIcon',
  'FlagIcon',
];

const BADGE_ICONS = {
  TrophyIcon,
  StarIcon,
  CompassIcon,
  MapIcon,
  CameraIcon,
  HeartIcon,
  FlagIcon,
};

const STAMP_ICONS = {
  wave: SailboatIcon,
  star: StarIcon,
  claw: CatIcon,
};

export function AttractionIcon({ type, size = 26 }) {
  const Icon = ATTRACTION_ICONS[type] || MapIcon;
  return <Icon size={size} />;
}

export function BadgeIcon({ name, size = 28 }) {
  const Icon = BADGE_ICONS[name] || TrophyIcon;
  return <Icon size={size} />;
}

export function StampIcon({ style, size = 22 }) {
  const Icon = STAMP_ICONS[style] || SailboatIcon;
  return <Icon size={size} />;
}

// 错误提示委托全站统一的 api.<code> 映射(未知码回退通用文案,不展示服务端英文)。
export function toastTourError(t, err) {
  toastApiError(t, err);
}

export function splitLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
