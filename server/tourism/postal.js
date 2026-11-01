// 邮政契约适配层。
//
// 跨署通知统一走「奶龙国皇家邮政与通信署」的
//   sendPostalMessage({ userId, source, type, params })   (server/postal/notify.js)
// 契约:写入 post_messages(只存 source/type/params),按 post_preferences 过滤,
// 用户明确关闭该 source 时返回 { skipped: true },否则返回 { id }。
//
// 邮政署与本署并行开发:该模块尚未并入时,通知落到本署的 tour_notify_outbox
// (同结构 user_id/source/type/params),打卡与发徽章的提示不会丢失；邮政署并入
// 后自动改走 post_messages,不需要改调用点。
import { db, now } from '../db.js';

let postalLoader;

function loadPostal() {
  if (!postalLoader) {
    postalLoader = import('../postal/notify.js')
      .then((mod) => (typeof mod.sendPostalMessage === 'function' ? mod : null))
      .catch(() => null);
  }
  return postalLoader;
}

export async function sendTourNotice({ userId, type, params = {} }) {
  // 双语参数兜底:繁体值为空时回退简体,避免 zh-TW 文案插值出空白。
  const filled = { ...params };
  for (const [key, value] of Object.entries(filled)) {
    if (key.endsWith('Tw') && !(typeof value === 'string' && value.trim())) {
      filled[key] = filled[key.slice(0, -2)] ?? '';
    }
  }
  const postal = await loadPostal();
  if (postal) {
    try {
      const result = await postal.sendPostalMessage({
        userId: String(userId),
        source: 'tourism',
        type,
        params: filled,
      });
      return { channel: 'postal', skipped: !!result?.skipped, id: result?.id ?? null };
    } catch {
      // 邮政署异常不能阻断打卡/发徽章,退回本地发件箱。
    }
  }
  const info = db
    .prepare(
      'INSERT INTO tour_notify_outbox (user_id, source, type, params, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(userId, 'tourism', type, JSON.stringify(filled), 'queued', now());
  return { channel: 'outbox', skipped: false, id: info.lastInsertRowid };
}

// 补投发件箱:邮政模块可用时,把 outbox 里积压的 queued 提示补送到
// post_messages。在本署读取入口懒触发;投递成功标记 sent,失败留待下次。
export async function flushTourOutbox() {
  const postal = await loadPostal();
  if (!postal) return { flushed: 0 };
  const rows = db.prepare("SELECT * FROM tour_notify_outbox WHERE status = 'queued' ORDER BY id LIMIT 50").all();
  let flushed = 0;
  for (const row of rows) {
    try {
      await postal.sendPostalMessage({
        userId: String(row.user_id),
        source: row.source,
        type: row.type,
        params: JSON.parse(row.params || '{}'),
      });
      db.prepare("UPDATE tour_notify_outbox SET status = 'sent' WHERE id = ?").run(row.id);
      flushed += 1;
    } catch {
      // 邮政仍不可用:中断本轮,剩余行留在队列。
      break;
    }
  }
  return { flushed };
}