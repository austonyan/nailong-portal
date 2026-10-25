// 皇家口岸入境署联动预留(服务间接口)。
// 约定:入境署以固定服务令牌调用(VISA_INTER_SERVICE_TOKEN),MVP 阶段
// 入境署尚未开发,这里先把校验/回写接口立起来,保证未来对接零改动。
import { Router } from 'express';
import { db, now } from '../db.js';
import { forbidden, notFound } from '../http.js';
import { audit, maskPermit, sendMsg, sweepAll } from '../visa.js';

const router = Router();

function requireServiceToken(req, _res, next) {
  const expected = process.env.VISA_INTER_SERVICE_TOKEN;
  if (!expected) return next(forbidden('SERVICE_DISABLED', 'VISA_INTER_SERVICE_TOKEN is not configured'));
  const provided = req.get('x-nailong-service-token');
  if (!provided || provided !== expected) return next(forbidden('SERVICE_FORBIDDEN', 'Invalid service token'));
  next();
}

router.use(requireServiceToken);

// 签注编号校验:有效/无效/过期/已注销/已使用
router.post('/check', (req, res) => {
  sweepAll();
  const no = String(req.body?.no || '').trim().toUpperCase();
  const token = String(req.body?.token || '').trim();
  const permit = token
    ? db.prepare('SELECT * FROM visa_permits WHERE verify_token = ?').get(token)
    : db.prepare('SELECT * FROM visa_permits WHERE visa_no = ?').get(no);
  if (!permit) {
    audit({ name: 'port-authority' }, 'inter_check_miss', 'permit', no);
    return res.json({ found: false });
  }
  const typeRow = db.prepare('SELECT name FROM visa_types WHERE code = ?').get(permit.type_code);
  audit({ name: 'port-authority' }, 'inter_check', 'permit', permit.visa_no, { status: permit.status });
  res.json(maskPermit(permit, typeRow));
});

// 入境署回写"已使用",避免重复使用
router.post('/mark-used', (req, res) => {
  sweepAll();
  const no = String(req.body?.no || '').trim().toUpperCase();
  const permit = db.prepare('SELECT * FROM visa_permits WHERE visa_no = ?').get(no);
  if (!permit) throw notFound('Permit not found');
  if (permit.status !== 'valid') {
    return res.json({ ok: false, status: permit.status });
  }
  db.prepare("UPDATE visa_permits SET status = 'used', updated_at = ? WHERE id = ?").run(now(), permit.id);
  sendMsg(permit.user_id, permit.application_id, 'used', { visaNo: permit.visa_no });
  audit({ name: 'port-authority' }, 'inter_mark_used', 'permit', permit.visa_no);
  res.json({ ok: true, status: 'used' });
});

// 签注类型与有效期查询
router.get('/types', (_req, res) => {
  const rows = db.prepare('SELECT code, name, stay_days, valid_days, enabled FROM visa_types ORDER BY sort_order').all();
  res.json({ items: rows });
});

export default router;
