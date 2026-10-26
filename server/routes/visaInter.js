// 皇家口岸入境署联动接口(服务间接口)。
// 同进程的入境署已改为直接调用 server/visa.js 的联动函数;本路由保留给
// 未来独立部署的服务,以固定服务令牌(VISA_INTER_SERVICE_TOKEN)调用。
import { Router } from 'express';
import { db } from '../db.js';
import { forbidden, notFound } from '../http.js';
import { audit, lookupPermit, markPermitUsed, maskPermit } from '../visa.js';

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
  const no = String(req.body?.no || '').trim().toUpperCase();
  const token = String(req.body?.token || '').trim();
  const { permit, typeRow } = lookupPermit({ no, token });
  if (!permit) {
    audit({ name: 'port-authority' }, 'inter_check_miss', 'permit', no);
    return res.json({ found: false });
  }
  audit({ name: 'port-authority' }, 'inter_check', 'permit', permit.visa_no, { status: permit.status });
  res.json(maskPermit(permit, typeRow));
});

// 入境署回写"已使用",避免重复使用
router.post('/mark-used', (req, res) => {
  const no = String(req.body?.no || '').trim().toUpperCase();
  const result = markPermitUsed(no);
  if (!result.found) throw notFound('Permit not found');
  res.json({ ok: result.ok, status: result.status });
});

// 签注类型与有效期查询
router.get('/types', (_req, res) => {
  const rows = db.prepare('SELECT code, name, stay_days, valid_days, enabled FROM visa_types ORDER BY sort_order').all();
  res.json({ items: rows });
});

export default router;
