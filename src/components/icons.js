// Explicit icon registry (naive-icons). Only these may be picked for service
// cards; the server validates against the same list.
import {
  RocketIcon,
  BookIcon,
  GiftIcon,
  CloudIcon,
  StarIcon,
  HeartIcon,
  MusicIcon,
  CoffeeIcon,
  CompassIcon,
  FlagIcon,
  LeafIcon,
  CatIcon,
  FoxIcon,
  MailIcon,
  CalendarIcon,
  CameraIcon,
  HomeIcon,
  UsersIcon,
  ShieldIcon,
  KeyIcon,
  SettingsIcon,
  BellIcon,
  FishIcon,
  MapIcon,
} from 'naive-icons';

export const SERVICE_ICONS = {
  RocketIcon,
  BookIcon,
  GiftIcon,
  CloudIcon,
  StarIcon,
  HeartIcon,
  MusicIcon,
  CoffeeIcon,
  CompassIcon,
  FlagIcon,
  LeafIcon,
  CatIcon,
  FoxIcon,
  MailIcon,
  CalendarIcon,
  CameraIcon,
  HomeIcon,
  UsersIcon,
  ShieldIcon,
  KeyIcon,
  SettingsIcon,
  BellIcon,
  FishIcon,
  MapIcon,
};

export const SERVICE_COLORS = [
  'app-teal',
  'app-yellow',
  'app-orange',
  'app-pink',
  'app-blue',
  'app-green',
  'purple',
  'app-red',
  'lime-green',
  'yellow-green',
  'brown',
  'warm-peach-pink',
];

// Resolve an icon component; falls back to the rocket for unknown names.
export function serviceIcon(name) {
  return SERVICE_ICONS[name] ?? RocketIcon;
}
