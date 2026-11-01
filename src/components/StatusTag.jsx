// 全站共享的状态标签:imm / dip / edu / protocol / resident / archives 六种写法统一到这里。
// 颜色表由调用方传入(各署的业务语义留在各署),共享层只提供一份通用并集作为默认值;
// 未命中时回退 brown + soft,文案未命中时回退 common.unknown。
// (与各署 shared.jsx 同理:同一文件既导出常量又导出组件,关闭 Fast Refresh 的拆分告警。)
/* eslint-disable react/only-export-components */
import { useTranslation } from 'react-i18next';
import { Tag } from 'animal-island-ui';

/**
 * 通用状态配色并集:草稿/关闭/过期/撤销/未知 → brown,待处理/补件/维护 → warm-peach-pink,
 * 已通过/有效/已使用/开放/完成 → app-green,已签发/已入境/审核中 → app-teal,
 * 已出境 → app-blue,驳回/作废/失效/拦截 → app-red。标签一律 soft。
 */
export const STATUS_PALETTE = {
  draft: { color: 'brown', variant: 'soft' },
  closed: { color: 'brown', variant: 'soft' },
  expired: { color: 'brown', variant: 'soft' },
  withdrawn: { color: 'brown', variant: 'soft' },
  unknown: { color: 'brown', variant: 'soft' },
  pending: { color: 'warm-peach-pink', variant: 'soft' },
  pending_review: { color: 'warm-peach-pink', variant: 'soft' },
  supplement: { color: 'warm-peach-pink', variant: 'soft' },
  supplement_required: { color: 'warm-peach-pink', variant: 'soft' },
  maintenance: { color: 'warm-peach-pink', variant: 'soft' },
  approved: { color: 'app-green', variant: 'soft' },
  valid: { color: 'app-green', variant: 'soft' },
  used: { color: 'app-green', variant: 'soft' },
  open: { color: 'app-green', variant: 'soft' },
  completed: { color: 'app-green', variant: 'soft' },
  issued: { color: 'app-teal', variant: 'soft' },
  entered: { color: 'app-teal', variant: 'soft' },
  reviewing: { color: 'app-teal', variant: 'soft' },
  exited: { color: 'app-blue', variant: 'soft' },
  rejected: { color: 'app-red', variant: 'soft' },
  voided: { color: 'app-red', variant: 'soft' },
  invalid: { color: 'app-red', variant: 'soft' },
  visa_blocked: { color: 'app-red', variant: 'soft' },
};

/**
 * 渲染一个状态标签(soft 变体 + 当前语言文案);状态码/配色表/i18n 前缀都由调用方给定。
 * @param {object} props
 * @param {string} [props.value] 状态码(优先;兼容 protocol 的 `status` 写法)
 * @param {string} [props.status] 状态码别名
 * @param {Record<string, string|{color: string, variant?: string}>} [props.map] 署内配色表(优先;兼容 `colors` 别名)
 * @param {Record<string, string|{color: string, variant?: string}>} [props.colors] 配色表别名
 * @param {string} [props.i18nPrefix] i18n 前缀,如 `'imm.status'`(兼容 `prefix` / `labelPrefix` 别名)
 * @param {string} [props.prefix] i18n 前缀别名
 * @param {string} [props.labelPrefix] i18n 前缀别名
 * @param {string} [props.tw] 可选的繁体文案覆盖(仅 zh-TW 且为非空字符串时生效;普通枚举走 i18n 即可)
 * @param {'small'|'medium'|'large'} [props.size] 标签尺寸,不传用库默认
 * @returns {import('react').ReactElement}
 */
export function StatusTag({ value, status, map, colors, prefix, i18nPrefix, labelPrefix, tw, size }) {
  const { t, i18n } = useTranslation();
  const code = value ?? status;
  const palette = map ?? colors;
  const entry = (palette ?? STATUS_PALETTE)[code];
  const color = typeof entry === 'string' ? entry : entry?.color;
  const namespace = i18nPrefix ?? prefix ?? labelPrefix;
  const fallback = t('common.unknown');
  const label = code ? t(`${namespace}.${code}`, { defaultValue: fallback }) : fallback;
  // 服务端双语内容的 *Tw 场景可以直接传繁体文案;普通枚举不需要传,交给 i18n 词典。
  const text = typeof tw === 'string' && tw && String(i18n?.language ?? '').startsWith('zh-TW') ? tw : label;
  return (
    <Tag color={color ?? 'brown'} variant="soft" size={size}>
      {text}
    </Tag>
  );
}

export default StatusTag;