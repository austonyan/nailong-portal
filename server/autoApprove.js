// 跨署自动审批 — 共享设置、进程内调度器与处理器注册表。
//
// Each office's admin router registers a processor at import time. The
// processor receives { mode, cutoff, actor } and must reuse the same approval
// core as the manual endpoint (status transition, downstream credential,
// messages and audit), so the two paths can never drift apart.
import { db, now } from './db.js';
import { badRequest } from './http.js';

export const AUTO_APPROVE_MODES = Object.freeze(['off', 'immediate', 'delayed']);

// 每个署的管理权限是设置接口的授权依据;新增业务署时在这里登记。
export const AUTO_APPROVE_SERVICES = Object.freeze({
  visa: { permission: 'visa:manage' },
  immigration: { permission: 'imm:admin' },
  dip: { permission: 'dip:admin' },
  resident: { permission: 'res:manage' },
  protocol: { permission: 'evt:manage' },
  docs: { permission: 'docs:manage' },
  appeal: { permission: 'appeal:manage' },
});

export const SYSTEM_ACTOR = Object.freeze({
  id: null,
  name: 'system',
  displayName: 'system',
  username: 'system',
});

const processors = new Map();
const warned = new Set();
let timer = null;

export function getAutoApproveSettings(serviceKey) {
  if (!AUTO_APPROVE_SERVICES[serviceKey]) return null;
  const row = db.prepare('SELECT * FROM service_auto_approve WHERE service_key = ?').get(serviceKey);
  return {
    service: serviceKey,
    mode: row?.mode || 'off',
    delayMinutes: row?.delay_minutes ?? 0,
    updatedBy: row?.updated_by || '',
    updatedAt: row?.updated_at || null,
  };
}

export function setAutoApproveSettings(serviceKey, { mode, delayMinutes } = {}, actor = null) {
  if (!AUTO_APPROVE_SERVICES[serviceKey]) return null;
  const normalizedMode = String(mode || '');
  if (!AUTO_APPROVE_MODES.includes(normalizedMode)) {
    throw badRequest('VALIDATION_ERROR', 'mode must be off/immediate/delayed');
  }
  const previous = getAutoApproveSettings(serviceKey);
  const rawDelay = Number(delayMinutes);
  const hasDelay = Number.isFinite(rawDelay) && rawDelay >= 0 && rawDelay <= 10080;
  let delay = hasDelay ? Math.floor(rawDelay) : previous.delayMinutes;
  if (normalizedMode === 'delayed' && (delay < 1 || delay > 10080)) {
    throw badRequest('VALIDATION_ERROR', 'delayMinutes must be an integer between 1 and 10080');
  }
  if (normalizedMode !== 'delayed' && delay < 0) delay = 0;
  const updatedBy = actor?.display_name || actor?.displayName || actor?.username || actor?.name || '';
  db.prepare(
    `INSERT INTO service_auto_approve (service_key, mode, delay_minutes, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(service_key) DO UPDATE SET
       mode = excluded.mode,
       delay_minutes = excluded.delay_minutes,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`
  ).run(serviceKey, normalizedMode, delay, updatedBy, now());
  return getAutoApproveSettings(serviceKey);
}

export function registerAutoApprover(serviceKey, processor) {
  if (!AUTO_APPROVE_SERVICES[serviceKey]) {
    throw new Error(`Unknown auto-approve service: ${serviceKey}`);
  }
  if (typeof processor !== 'function') {
    throw new Error(`Auto-approve processor for ${serviceKey} must be a function`);
  }
  processors.set(serviceKey, processor);
}

function warnOnce(key, err) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[auto-approve] skip ${key}: ${err?.code || err?.message || err}`);
}

// 单行失败(关系未生效/活动已结束/外交身份失效等)只跳过该行,下一轮再试。
export function safeAutoApprove(serviceKey, rowKey, fn) {
  try {
    fn();
    return 1;
  } catch (err) {
    warnOnce(`${serviceKey}:${rowKey}`, err);
    return 0;
  }
}

export function runAutoApproveTick(nowDate = new Date()) {
  let processed = 0;
  for (const serviceKey of Object.keys(AUTO_APPROVE_SERVICES)) {
    const processor = processors.get(serviceKey);
    if (!processor) continue;
    const settings = getAutoApproveSettings(serviceKey);
    if (settings.mode === 'off') continue;
    const delay = settings.mode === 'immediate' ? 0 : settings.delayMinutes;
    const cutoff = new Date(nowDate.getTime() - delay * 60 * 1000).toISOString();
    try {
      const count = processor({ settings, cutoff, actor: SYSTEM_ACTOR });
      if (count) {
        processed += count;
        console.log(`[auto-approve] ${serviceKey}: ${count}`);
      }
    } catch (err) {
      warnOnce(`service:${serviceKey}`, err);
    }
  }
  return processed;
}

export function startAutoApproveScheduler({ intervalMs } = {}) {
  if (timer) return timer;
  const parsed = Number(intervalMs ?? process.env.AUTO_APPROVE_INTERVAL_MS);
  const ms = Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
  const run = () => {
    try {
      runAutoApproveTick();
    } catch (err) {
      console.error('[auto-approve] tick failed:', err);
    }
  };
  run();
  timer = setInterval(run, Math.max(200, ms));
  timer.unref?.();
  return timer;
}

export function stopAutoApproveScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}