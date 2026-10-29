// Shared bits for the visa pages: status palette, date formatting and the
// common error toast mapper.
import dayjs from 'dayjs';
import { toastError } from '../../components/toast.js';


export const APPLICATION_STATUS_COLORS = {
  draft: 'default',
  pending_review: 'app-yellow',
  supplement_required: 'app-orange',
  approved: 'app-green',
  issued: 'app-teal',
  rejected: 'app-red',
  withdrawn: 'brown',
  closed: 'default',
};

export const PERMIT_STATUS_COLORS = {
  valid: 'app-green',
  used: 'app-blue',
  expired: 'brown',
  voided: 'app-red',
};

export const NOTICE_LEVEL_COLORS = {
  info: 'app-blue',
  policy: 'app-yellow',
  event: 'app-pink',
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
