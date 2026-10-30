// Shared bits for the visa pages: status palette, date formatting and the
// common error toast mapper.
import dayjs from 'dayjs';
import { toastError } from '../../components/toast.js';


export const APPLICATION_STATUS_COLORS = {
  draft: 'brown',
  pending_review: 'warm-peach-pink',
  supplement_required: 'warm-peach-pink',
  approved: 'app-green',
  issued: 'app-teal',
  rejected: 'app-red',
  withdrawn: 'brown',
  closed: 'brown',
};

export const PERMIT_STATUS_COLORS = {
  valid: 'app-green',
  used: 'app-green',
  expired: 'brown',
  voided: 'app-red',
};

export const NOTICE_LEVEL_COLORS = {
  info: 'app-blue',
  policy: 'warm-peach-pink',
  event: 'app-pink',
};

// 审核轨迹的 action 与申请状态同色:通过=绿、驳回=红、补件=暖粉、签发=青、
// 作废=红、已使用=绿。两个页面(用户详情 / 审核工作台)共用,避免各写一套导致漂色。
export const REVIEW_ACTION_COLORS = {
  approve: 'app-green',
  reject: 'app-red',
  require_supplement: 'warm-peach-pink',
  issue: 'app-teal',
  void: 'app-red',
  mark_used: 'app-green',
};

export function fmtDateTime(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '-';
}

export function fmtDate(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD') : '-';
}

export function visaErrMsg(t, err) {
  return t(`api.${err?.code}`, { defaultValue: t('api.INTERNAL_ERROR') });
}

export function toastVisaError(t, err) {
  toastError(visaErrMsg(t, err));
}

// 材料类型 → i18n key(visa.materialKind.*)
export const MATERIAL_KINDS = ['avatar', 'invitation', 'proof', 'other'];

export const REJECT_REASONS = ['incomplete_materials', 'false_info', 'type_mismatch', 'duplicate', 'other'];

// 库里没有多行输入;按 Input 的视觉语言用 token 自定义,FormItem 直接注入
// value/onChange 也能工作(原生受控)。
export function TextArea({ rows = 4, className = '', ...rest }) {
  return <textarea rows={rows} className={`visa-textarea ${className}`} {...rest} />;
}
