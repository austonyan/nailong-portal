// 跨署联动前端的共享映射与标签辅助。
// source 与 server/linkage.js 的 LINKED_OFFICES 一致。

// 授权按键:同一浏览器会话内,同一服务对同一来源署只确认一次。
const consentKey = (consumer, source) => `nailong.${consumer}.linkage.${source}`;

export function hasLinkageConsent(consumer, source) {
  try {
    return sessionStorage.getItem(consentKey(consumer, source)) === '1';
  } catch {
    return false;
  }
}

export function grantLinkageConsent(consumer, source) {
  try {
    sessionStorage.setItem(consentKey(consumer, source), '1');
  } catch {
    // 隐私模式下 sessionStorage 不可用时,本次仍可继续(仅不记忆授权)。
  }
}

// 文书署 doc_types.biz_source → 联动来源署。
export const DOC_BIZ_SOURCE = {
  visa: 'visa',
  entry: 'immigration',
  foreign: 'diplomatic',
  protocol: 'protocol',
  resident: 'resident',
  appeal: 'appeal',
  archives: 'archives',
};

// 状态词条按记录种类落到各署既有命名空间,避免再复制一份状态表。
export function linkageStatusKey(source, kind, status) {
  if (source === 'visa') return `visa.${kind === 'permit' ? 'permitStatus' : 'status'}.${status}`;
  if (source === 'resident') {
    const ns = kind === 'card' ? 'cardStatus' : kind === 'change' ? 'changeStatus' : 'appStatus';
    return `res.${ns}.${status}`;
  }
  if (source === 'document') return `docs.${kind === 'certificate' ? 'certStatus' : 'status'}.${status}`;
  if (source === 'appeal') return `appeal.decisionStatus.${status}`;
  if (source === 'immigration') return `imm.status.${status}`;
  if (source === 'diplomatic') return `dip.status.${status}`;
  if (source === 'protocol') return `protocol.status.${status}`;
  if (source === 'archives') return `arch.status.${status}`;
  return status;
}

export function linkageStatusLabel(t, source, kind, status) {
  return t(linkageStatusKey(source, kind, status), { defaultValue: t('common.unknown') });
}