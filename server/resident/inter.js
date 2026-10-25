// 其他署联动预留(服务间接口)— 签注申请署 / 入境署 / 活动署可凭服务令牌
// 校验居民编号。约定:调用方以固定服务令牌(RESIDENT_INTER_SERVICE_TOKEN)
// 调用,MVP 阶段各署尚未接入,这里先把校验接口立起来,保证未来对接零改动。
import { Router } from 'express';
import { db, now } from '../db.js';
import { forbidden } from '../http.js';
import { ensureResidentSchema } from './schema.js';
import { audit, maskCard, sweepAll } from './util.js';

const router = Router();

ensureResidentSchema();

function requireServiceToken(req, _res, next) {
  const expected = process.env.RESIDENT_INTER_SERVICE_TOKEN;
  if (!expected) return next(forbidden('SERVICE_DISABLED', 'RESIDENT_INTER_SERVICE_TOKEN is not configured'));
  const provided = req.get('x-nailong-service-token');
  if (!provided || provided !== expected) return next(forbidden('SERVICE_FORBIDDEN', 'Invalid service token'));
  next();
}

router.use(requireServiceToken);

// 居民编号/登记申请编号校验:有效/过期/冻结/注销(结果脱敏,不含个人信息)
router.post('/check', (req, res) => {
  sweepAll();
  const no = String(req.body?.no || '').trim().toUpperCase();
  const token = String(req.body?.token || '').trim();
  const card = token
    ? db.prepare('SELECT * FROM res_cards WHERE verify_token = ?').get(token)
    : db
        .prepare('SELECT * FROM res_cards WHERE card_no = ?')
        .get(no) ||
        db
          .prepare('SELECT * FROM res_cards WHERE application_id = (SELECT id FROM res_applications WHERE app_no = ?)')
          .get(no);
  if (!card) {
    audit({ name: 'inter-service' }, 'inter_check_miss', 'card', no);
    return res.json({ found: false });
  }
  const typeRow = db.prepare('SELECT name FROM res_types WHERE code = ?').get(card.type_code);
  audit({ name: 'inter-service' }, 'inter_check', 'card', card.card_no, { status: card.status });
  db.prepare('INSERT INTO res_verify_logs (query, ip, result, source, created_at) VALUES (?, ?, ?, ?, ?)').run(
    `inter:${card.card_no}`, '', card.status === 'valid' ? 'valid' : card.status, 'api', now()
  );
  res.json(maskCard(card, typeRow));
});

// 居民类型与开放状态查询(供各署配置联动表单)
router.get('/types', (_req, res) => {
  const rows = db.prepare('SELECT code, name, valid_years, enabled FROM res_types ORDER BY sort_order').all();
  res.json({ items: rows });
});

export default router;
