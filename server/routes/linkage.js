// 跨署联动读取入口 — 前端按 SSO 账户自动取件 / 手动编号校验。
// 只返回当前登录账户自己的记录；每次读取都写 linkage_access_logs 审计。
import express from 'express';
import { authenticate } from '../auth.js';
import { badRequest } from '../http.js';
import {
  LINKED_OFFICES,
  crossOfficeAlerts,
  listOwnedRecords,
  listUserCertificates,
  linkageIdentity,
  recordLinkageAccess,
  verifyBusinessRecord,
} from '../linkage.js';
import { now } from '../db.js';

const router = express.Router();

const SOURCES = new Set(Object.keys(LINKED_OFFICES));
const CONSUMERS = new Set([
  'docs_apply',
  'immigration_declare',
  'protocol_courtesy',
  'protocol_registration',
  'appeal_apply',
  'manual',
]);

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
}

function readSource(value) {
  const source = String(value || '').trim();
  if (!SOURCES.has(source)) throw badRequest('LINKAGE_SOURCE_INVALID', 'Unknown linkage source');
  return source;
}

function readConsumer(value, { optional = false } = {}) {
  const consumer = String(value || '').trim();
  if (!consumer) {
    if (optional) return 'manual';
    throw badRequest('LINKAGE_CONSUMER_INVALID', 'Linkage consumer is required');
  }
  if (!CONSUMERS.has(consumer)) throw badRequest('LINKAGE_CONSUMER_INVALID', 'Unknown linkage consumer');
  return consumer;
}

router.use(authenticate);

// 授权弹窗用:当前账户可用于证明"本人"的身份凭证。
router.get('/identity', (req, res) => {
  res.json(linkageIdentity(req.user.id));
});

// 按来源署列出当前账户自己的记录。
router.get('/records', (req, res) => {
  const source = readSource(req.query.source);
  const consumer = readConsumer(req.query.consumer);
  const kind = String(req.query.kind || '').trim();
  const records = listOwnedRecords(source, req.user.id, { kind });
  recordLinkageAccess({
    userId: req.user.id,
    consumer,
    source,
    action: 'list',
    count: records.length,
    detail: kind ? { kind } : {},
    ip: clientIp(req),
  });
  res.json({
    source,
    office: LINKED_OFFICES[source] || '',
    identity: linkageIdentity(req.user.id),
    records,
    fetchedAt: now(),
  });
});

// 统一"证件库":聚合当前账户各署本人有效证件,供前端统一展示与到期提醒。
router.get('/certificates', (req, res) => {
  const certificates = listUserCertificates(req.user.id);
  recordLinkageAccess({
    userId: req.user.id,
    consumer: 'manual',
    source: 'all',
    action: 'list',
    count: certificates.length,
    detail: {},
    ip: clientIp(req),
  });
  res.json({ certificates, fetchedAt: now() });
});

// 跨署状态级联提示:居民证/外交身份失效时,关联证件可能受影响。
router.get('/alerts', (req, res) => {
  res.json({ alerts: crossOfficeAlerts(req.user.id), fetchedAt: now() });
});

// 手动填写编号后的即时校验:严格按当前 SSO 账户归属,非本人不返回明细。
router.get('/verify', (req, res) => {
  const source = readSource(req.query.source);
  const consumer = readConsumer(req.query.consumer, { optional: true });
  const code = String(req.query.code || '').trim();
  if (!code) throw badRequest('VALIDATION_ERROR', 'code is required');
  const check = verifyBusinessRecord(source, code, req.user.id);
  recordLinkageAccess({
    userId: req.user.id,
    consumer,
    source,
    action: 'verify',
    count: 1,
    detail: { found: check.found, owned: check.owned, personal: check.personal },
    ip: clientIp(req),
  });
  res.json(check);
});

export default router;