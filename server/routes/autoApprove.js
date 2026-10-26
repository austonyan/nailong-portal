// 跨署自动审批设置 — 每个署只允许拥有该署 manage 权限的管理员读写。
import { Router } from 'express';
import { authenticate } from '../auth.js';
import { forbidden, notFound } from '../http.js';
import {
  AUTO_APPROVE_SERVICES,
  getAutoApproveSettings,
  setAutoApproveSettings,
} from '../autoApprove.js';

const router = Router();

router.use(authenticate);

function resolveService(req) {
  const serviceKey = String(req.params.service || '');
  const def = AUTO_APPROVE_SERVICES[serviceKey];
  if (!def) throw notFound('Unknown service');
  const owned = new Set(req.user?.permissions || []);
  if (!owned.has(def.permission)) {
    throw forbidden('FORBIDDEN', `Missing permission: ${def.permission}`);
  }
  return serviceKey;
}

router.get('/:service', (req, res) => {
  const serviceKey = resolveService(req);
  res.json({ settings: getAutoApproveSettings(serviceKey) });
});

router.patch('/:service', (req, res) => {
  const serviceKey = resolveService(req);
  const settings = setAutoApproveSettings(
    serviceKey,
    { mode: req.body?.mode, delayMinutes: req.body?.delayMinutes },
    req.user
  );
  res.json({ settings });
});

export default router;