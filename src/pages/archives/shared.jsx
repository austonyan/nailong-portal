// 皇家档案与记录署 — shared UI atoms: status tags, office tags, CSV export,
// formatted dates, the office sub-navigation and the tokenised textarea.
// (Non-component exports are intentional helpers, not a components-file slip.)
/* eslint-disable react/only-export-components */
import { useTranslation } from 'react-i18next';
import { Tag } from 'animal-island-ui';
import i18n from '../../i18n/index.js';
import { toastApiError } from '../../components/toast.js';
import { StatusTag as SharedStatusTag } from '../../components/StatusTag.jsx';
import { TextArea as SharedTextArea } from '../../components/TextArea.jsx';

// 时间格式与客户端 CSV 导出统一由共享层实现:src/lib/date.js 带 isValid 保护,
// src/lib/csv.js 的 exportCsv 与本署旧实现逐字一致。这里只再导出,调用点不变。
// 档案署的时间戳一直带秒(详情时间线、列表、站内信参数、审计 CSV 导出都是),
// 因此本署的 fmtDateTime 走共享层的秒级版本,不要退回分钟级。
export { fmtDate } from '../../lib/date.js';
export { fmtDateTimeSec as fmtDateTime } from '../../lib/date.js';
export { exportCsv } from '../../lib/csv.js';

// Toast helper usable outside React components.
// 服务端 message 是英文:未知错误码只回退到通用文案,不把 message 摊到界面上。
export function toastArchError(err) {
  toastApiError(i18n.t, err);
}

// 库内没有 Textarea 组件:共享组件负责令牌化外观,这里只补署内样式类。
export function TextArea({ rows = 4, className = '', ...rest }) {
  return <SharedTextArea rows={rows} className={`arch-textarea ${className}`} {...rest} />;
}

const REQUEST_STATUS_TAG = {
  pending: { color: 'warm-peach-pink', variant: 'soft' },
  reviewing: { color: 'app-teal', variant: 'soft' },
  executing: { color: 'app-blue', variant: 'soft' },
  completed: { color: 'app-green', variant: 'soft' },
  rejected: { color: 'app-red', variant: 'soft' },
};

export function RequestStatusTag({ value }) {
  return <SharedStatusTag value={value} map={REQUEST_STATUS_TAG} i18nPrefix="arch.status" />;
}

const RECORD_STATUS_TAG = {
  draft: { color: 'brown', variant: 'soft' },
  pending: { color: 'warm-peach-pink', variant: 'soft' },
  pending_review: { color: 'warm-peach-pink', variant: 'soft' },
  supplement: { color: 'warm-peach-pink', variant: 'soft' },
  supplement_required: { color: 'warm-peach-pink', variant: 'soft' },
  approved: { color: 'app-green', variant: 'soft' },
  issued: { color: 'app-teal', variant: 'soft' },
  valid: { color: 'app-green', variant: 'soft' },
  rejected: { color: 'app-red', variant: 'soft' },
  invalid: { color: 'app-red', variant: 'soft' },
  withdrawn: { color: 'brown', variant: 'soft' },
  closed: { color: 'brown', variant: 'soft' },
  used: { color: 'app-green', variant: 'soft' },
  expired: { color: 'brown', variant: 'soft' },
  voided: { color: 'app-red', variant: 'soft' },
  entered: { color: 'app-teal', variant: 'soft' },
  exited: { color: 'app-blue', variant: 'soft' },
};

export function RecordStatusTag({ value }) {
  return <SharedStatusTag value={value} map={RECORD_STATUS_TAG} i18nPrefix="arch.recStatus" size="small" />;
}

const OFFICE_TAG = {
  visa: { color: 'app-teal', variant: 'soft' },
  immigration: { color: 'purple', variant: 'soft' },
};

export function OfficeTag({ office }) {
  const { t } = useTranslation();
  const style = OFFICE_TAG[office] ?? { color: 'brown', variant: 'soft' };
  return (
    <Tag color={style.color} variant={style.variant} size="small">
      {t(`arch.office.${office}`, { defaultValue: t('common.unknown') })}
    </Tag>
  );
}





