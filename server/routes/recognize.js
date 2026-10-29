// 跨署互认规则:用户端资格查询 + 管理端增删改查。
import { Router } from 'express';
import { authenticate, requirePermission } from '../auth.js';
import { notFound } from '../http.js';
import {
  createRecognizeRule,
  deleteRecognizeRule,
  getRecognition,
  listRecognizeRules,
  updateRecognizeRule,
} from '../recognize.js';

const router = Router();
router.use(authenticate);

// 用户端:当前登录用户在某个业务署可享受的互认资格(登录即可)。
router.get('/me/:serviceKey', (req, res) => {
  res.json(getRecognition(req.user.id, String(req.params.serviceKey || '')));
});

// 管理端:列出 / 新建 / 更新 / 删除规则。
router.get('/', requirePermission('services:read'), (_req, res) => {
  res.json({ items: listRecognizeRules() });
});

router.post('/', requirePermission('services:write'), (req, res) => {
  res.status(201).json({ item: createRecognizeRule(req.body || {}) });
});

router.patch('/:id', requirePermission('services:write'), (req, res) => {
  const item = updateRecognizeRule(req.params.id, req.body || {});
  if (!item) throw notFound('Recognition rule not found');
  res.json({ item });
});

router.delete('/:id', requirePermission('services:write'), (req, res) => {
  if (!deleteRecognizeRule(req.params.id)) throw notFound('Recognition rule not found');
  res.json({ ok: true });
});

export default router;
