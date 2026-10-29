// 文化旅游署页面的共享片段:类型/状态颜色、日期格式化、错误提示、图标映射
// 与令牌化多行输入框。
/* eslint-disable react/only-export-components */
import dayjs from 'dayjs';
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
import { toast } from '../../components/toast.js';

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

export function fmtDateTime(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '-';
}

export function fmtDate(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD') : '-';
}

export function tourErrMsg(t, err) {
  return t(`api.${err?.code}`, { defaultValue: err?.message || t('api.INTERNAL_ERROR') });
}

// 统一走全站 toast(库的通知 API 在 React 19 下会抛异常,不能用于关键流程)
export function toastTourError(t, err) {
  toast('error', tourErrMsg(t, err));
}

export function splitLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// 库里没有多行输入组件:按 Input 的视觉语言用令牌自定义。
export function TextArea({ rows = 4, className = '', ...rest }) {
  return <textarea rows={rows} className={`tour-textarea ${className}`} {...rest} />;
}