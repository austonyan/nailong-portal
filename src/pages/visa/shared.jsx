// Shared bits for the visa pages: status palette, plus the portal-wide date,
// textarea and error-toast helpers. 日期、多行输入与错误提示的实现各自只有一份
// (src/lib/date.js、src/components/TextArea.jsx、src/components/toast.js),
// 这里只做转出,保证署内调用点仍然从 './shared.jsx' 取。
import { apiErrorMessage, toastApiError } from '../../components/toast.js';
import SharedTextArea from '../../components/TextArea.jsx';

export { fmtDate, fmtDateTime } from '../../lib/date.js';


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

// 错误码 → 文案的映射由共享层实现(未知码回退 api.INTERNAL_ERROR 并写控制台),
// 这里保持原来的两个函数名与可见文案不变,只把实现委托出去。
export function visaErrMsg(t, err) {
  return apiErrorMessage(t, err);
}

export function toastVisaError(t, err) {
  toastApiError(t, err);
}

// 驳回原因码 → i18n key(visa.rejectReason.*)
export const REJECT_REASONS = ['incomplete_materials', 'false_info', 'type_mismatch', 'duplicate', 'other'];

// 多行输入统一用共享 TextArea(原生属性透传,FormItem 注入的 value/onChange 可直接用);
// 额外带上 visa-textarea 类名,沿用本署在 index.css 里的描边/圆角版式。
export function TextArea(props) {
  return <SharedTextArea className="visa-textarea" {...props} />;
}
