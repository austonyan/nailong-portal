// 跨署互认规则:配置"持 A 证件可免办/简化/优先办 B 业务"。
// 规则存库、管理台可增删改与启停,业务申请时按规则自动校验,无需改代码。
// 规则只描述"资格/权益",不改变各署既有审批状态机。
import { db, now } from './db.js';
import { badRequest } from './http.js';
import { listUserCertificates } from './linkage.js';

db.exec(`
CREATE TABLE IF NOT EXISTS service_recognize (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  service_key   TEXT NOT NULL,
  holder_source TEXT NOT NULL,
  holder_kind   TEXT NOT NULL DEFAULT '',
  effect        TEXT NOT NULL DEFAULT 'simplify' CHECK (effect IN ('simplify','waive','priority')),
  benefit       TEXT NOT NULL DEFAULT '',
  benefit_tw    TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recognize_service ON service_recognize (service_key, enabled);
`);

export const RECOGNIZE_EFFECTS = Object.freeze(['simplify', 'waive', 'priority']);
export const RECOGNIZE_SERVICES = Object.freeze([
  'visa', 'immigration', 'resident', 'dip', 'protocol', 'docs', 'appeal', 'archives',
]);

const DEFAULT_RULES = [
  {
    service_key: 'visa',
    holder_source: 'resident',
    holder_kind: 'card',
    effect: 'simplify',
    benefit: '持有效居民证申请签注可简化材料',
    benefit_tw: '持有效居民證申請簽註可簡化材料',
    sort_order: 0,
  },
  {
    service_key: 'immigration',
    holder_source: 'resident',
    holder_kind: 'card',
    effect: 'priority',
    benefit: '持有效居民证可使用居民快捷通道',
    benefit_tw: '持有效居民證可使用居民快捷通道',
    sort_order: 1,
  },
  {
    service_key: 'immigration',
    holder_source: 'diplomatic',
    holder_kind: 'identity',
    effect: 'priority',
    benefit: '持有效外交身份可享入境礼遇',
    benefit_tw: '持有效外交身分可享入境禮遇',
    sort_order: 2,
  },
  {
    service_key: 'protocol',
    holder_source: 'resident',
    holder_kind: 'card',
    effect: 'priority',
    benefit: '持有效居民证可优先参与居民专属活动',
    benefit_tw: '持有效居民證可優先參與居民專屬活動',
    sort_order: 3,
  },
];

function seedRules() {
  if (db.prepare('SELECT COUNT(*) AS n FROM service_recognize').get().n > 0) return;
  const ts = now();
  const stmt = db.prepare(
    `INSERT INTO service_recognize (service_key, holder_source, holder_kind, effect, benefit, benefit_tw, enabled, sort_order, created_at, updated_at)
     VALUES (@service_key, @holder_source, @holder_kind, @effect, @benefit, @benefit_tw, 1, @sort_order, @now, @now)`
  );
  db.transaction(() => {
    for (const r of DEFAULT_RULES) stmt.run({ ...r, now: ts });
  })();
}
seedRules();

export function serializeRule(row) {
  return {
    id: row.id,
    serviceKey: row.service_key,
    holderSource: row.holder_source,
    holderKind: row.holder_kind,
    effect: row.effect,
    benefit: row.benefit,
    benefitTw: row.benefit_tw,
    enabled: !!row.enabled,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

export function listRecognizeRules() {
  return db
    .prepare('SELECT * FROM service_recognize ORDER BY service_key, sort_order, id')
    .all()
    .map(serializeRule);
}

// 返回某个用户在当前业务署可享受的互认资格:规则 + 是否命中有效证件。
export function getRecognition(userId, serviceKey) {
  const rules = db
    .prepare('SELECT * FROM service_recognize WHERE service_key = ? AND enabled = 1 ORDER BY sort_order, id')
    .all(serviceKey);
  if (!rules.length) return { serviceKey, items: [] };
  const certs = listUserCertificates(userId);
  const items = rules.map((row) => {
    const cert = certs.find(
      (c) => c.source === row.holder_source && (!row.holder_kind || c.kind === row.holder_kind) && c.valid
    );
    return {
      ...serializeRule(row),
      eligible: !!cert,
      matchedCode: cert?.code || '',
      matchedName: cert?.typeName || '',
      matchedNameTw: cert?.typeNameTw || null,
    };
  });
  return { serviceKey, items };
}

function normalizePayload(payload = {}) {
  const serviceKey = String(payload.serviceKey || '').trim();
  if (!RECOGNIZE_SERVICES.includes(serviceKey)) {
    throw badRequest('VALIDATION_ERROR', 'Unknown service key');
  }
  const holderSource = String(payload.holderSource || '').trim();
  if (!['visa', 'immigration', 'resident', 'diplomatic', 'document', 'protocol', 'appeal', 'archives'].includes(holderSource)) {
    throw badRequest('VALIDATION_ERROR', 'Unknown holder source');
  }
  const effect = String(payload.effect || 'simplify');
  if (!RECOGNIZE_EFFECTS.includes(effect)) {
    throw badRequest('VALIDATION_ERROR', 'Unknown effect');
  }
  return {
    serviceKey,
    holderSource,
    holderKind: String(payload.holderKind || '').trim(),
    effect,
    benefit: String(payload.benefit || '').trim().slice(0, 200),
    benefitTw: String(payload.benefitTw || '').trim().slice(0, 200) || null,
    enabled: payload.enabled === undefined ? 1 : payload.enabled ? 1 : 0,
    sortOrder: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0,
  };
}

export function createRecognizeRule(payload) {
  const p = normalizePayload(payload);
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO service_recognize (service_key, holder_source, holder_kind, effect, benefit, benefit_tw, enabled, sort_order, created_at, updated_at)
       VALUES (@serviceKey, @holderSource, @holderKind, @effect, @benefit, @benefitTw, @enabled, @sortOrder, @now, @now)`
    )
    .run({ ...p, now: ts });
  return serializeRule(db.prepare('SELECT * FROM service_recognize WHERE id = ?').get(info.lastInsertRowid));
}

export function updateRecognizeRule(id, payload) {
  const row = db.prepare('SELECT * FROM service_recognize WHERE id = ?').get(Number(id));
  if (!row) return null;
  const p = normalizePayload({ ...serializeRule(row), ...payload });
  db.prepare(
    `UPDATE service_recognize SET service_key = @serviceKey, holder_source = @holderSource, holder_kind = @holderKind,
     effect = @effect, benefit = @benefit, benefit_tw = @benefitTw, enabled = @enabled, sort_order = @sortOrder,
     updated_at = @now WHERE id = @id`
  ).run({ ...p, now: now(), id: row.id });
  return serializeRule(db.prepare('SELECT * FROM service_recognize WHERE id = ?').get(row.id));
}

export function deleteRecognizeRule(id) {
  const info = db.prepare('DELETE FROM service_recognize WHERE id = ?').run(Number(id));
  return info.changes > 0;
}
