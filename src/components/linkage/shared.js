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
// 验真中心复用同一映射,因此 source 同时接受 linkage 的 document/diplomatic
// 与验真注册表的 docs/diplomacy 两种写法。
export function linkageStatusKey(source, kind, status) {
  if (!status) return null;
  if (source === 'visa') return `visa.${kind === 'permit' ? 'permitStatus' : 'status'}.${status}`;
  if (source === 'resident') {
    const ns = kind === 'card' ? 'cardStatus' : kind === 'change' ? 'changeStatus' : 'appStatus';
    return `res.${ns}.${status}`;
  }
  if (source === 'document' || source === 'docs') {
    return `docs.${kind === 'certificate' ? 'certStatus' : 'status'}.${status}`;
  }
  if (source === 'appeal') {
    const ns =
      kind === 'review'
        ? 'reviewStatus'
        : kind === 'complaint'
          ? 'complaintStatus'
          : kind === 'ticket'
            ? 'ticketStatus'
            : kind === 'decision'
              ? 'decisionStatus'
              : 'status';
    return `appeal.${ns}.${status}`;
  }
  if (source === 'immigration') return `imm.status.${status}`;
  if (source === 'diplomatic' || source === 'diplomacy') return `dip.status.${status}`;
  if (source === 'protocol') return `protocol.status.${status}`;
  if (source === 'archives') return `arch.status.${status}`;
  if (source === 'postal') {
    return kind === 'postcard' ? `post.postcardStatus.${status}` : `post.admin.noticeStatus.${status}`;
  }
  if (source === 'tourism') {
    const ns =
      kind === 'article' ? 'articleStatus' : kind === 'badge' ? 'badgeStatus' : 'status';
    return `tour.admin.${ns}.${status}`;
  }
  if (source === 'stats') return null;
  if (source === 'education') {
    return kind === 'task' ? `edu.admin.taskStatus.${status}` : `edu.status.${status}`;
  }
  return status;
}

export function linkageStatusLabel(t, source, kind, status) {
  const key = linkageStatusKey(source, kind, status);
  return key ? t(key, { defaultValue: t('common.unknown') }) : '';
}