// 奶龙国皇家外交事务署服务间接口。
// 同进程内部联动已直接走 server/linkage.js(签注署校验外交身份、文书署校验
// 建交/身份编号、入境署礼遇通道);本路由保留给独立部署的服务,以固定服务
// 令牌(DIP_INTER_SERVICE_TOKEN)调用。
import { Router } from 'express';
import { db } from '../db.js';
import { forbidden } from '../http.js';
import { audit, maskAgreement, maskIdentity, maskRelation, sweepAll } from './util.js';

const router = Router();

function requireServiceToken(req, _res, next) {
  const expected = process.env.DIP_INTER_SERVICE_TOKEN;
  if (!expected) return next(forbidden('SERVICE_DISABLED', 'DIP_INTER_SERVICE_TOKEN is not configured'));
  const provided = req.get('x-nailong-service-token');
  if (!provided || provided !== expected) return next(forbidden('SERVICE_FORBIDDEN', 'Invalid service token'));
  next();
}

router.use(requireServiceToken);

// 外交身份有效性校验(签注署外交签注审核用):active 才算有效,冻结/失效/注销同步失效
router.post('/identity/check', (req, res) => {
  sweepAll();
  const no = String(req.body?.no || '').trim().toUpperCase();
  const identity = db.prepare('SELECT * FROM dip_identities WHERE no = ? AND deleted_at IS NULL').get(no);
  if (!identity) {
    audit(null, 'inter_identity_miss', 'identity', no);
    return res.json({ found: false, valid: false });
  }
  audit(null, 'inter_identity_check', 'identity', identity.no, { status: identity.status });
  res.json({ found: true, ...maskIdentity(identity) });
});

// 建交关系校验(文书署认证建交公报/国书时用)
router.post('/relation/check', (req, res) => {
  sweepAll();
  const no = String(req.body?.no || '').trim().toUpperCase();
  const relation = db.prepare('SELECT * FROM dip_relations WHERE no = ? AND deleted_at IS NULL').get(no);
  if (!relation) {
    audit(null, 'inter_relation_miss', 'relation', no);
    return res.json({ found: false, valid: false });
  }
  audit(null, 'inter_relation_check', 'relation', relation.no, { status: relation.status });
  res.json({ found: true, ...maskRelation(relation) });
});

// 互免协议校验
router.post('/agreement/check', (req, res) => {
  sweepAll();
  const no = String(req.body?.no || '').trim().toUpperCase();
  const agreement = db.prepare('SELECT * FROM dip_agreements WHERE no = ?').get(no);
  if (!agreement) return res.json({ found: false, valid: false });
  audit(null, 'inter_agreement_check', 'agreement', agreement.no, { status: agreement.status });
  res.json({ found: true, ...maskAgreement(agreement) });
});

// 礼遇通道查询(入境署联动):按外交身份编号返回可享礼遇
router.get('/courtesies/:no', (req, res) => {
  sweepAll();
  const no = String(req.params.no || '').toUpperCase();
  const identity = db.prepare('SELECT * FROM dip_identities WHERE no = ? AND deleted_at IS NULL').get(no);
  if (!identity || identity.status !== 'active') {
    return res.json({ found: false, eligible: false });
  }
  const types = db.prepare('SELECT code, name, description FROM dip_courtesy_types WHERE enabled = 1 ORDER BY sort_order').all();
  res.json({ found: true, eligible: true, identityNo: identity.no, entityName: identity.entity_name, courtesies: types });
});

export default router;
