// 申诉处理工作台:待受理队列(业务类型/状态筛选)、详情抽屉、受理/不予受理/
// 分派/要求补件/处理决定(维持/撤销/变更/转交)/关闭/合并重复申诉。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Drawer, Input, Modal, Pagination, Select, Table, Tag, Title } from 'animal-island-ui';
import { EyeIcon, SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { openAppealMaterial } from '../../api/appeal.js';
import {
  APPEAL_STATUS_COLORS,
  BIZ_TYPES,
  DECISION_TYPE_COLORS,
  PRIORITY_COLORS,
  TextArea,
  fmtDateTime,
  toastAppealError,
} from './shared.jsx';
import { toastSuccess } from '../../components/toast.js';

const QUEUE_STATUS = ['', 'pending_accept', 'accepted', 'processing', 'supplement_required', 'resolved', 'rejected', 'withdrawn', 'closed'];
const DECIDE_TYPES = ['maintain', 'undo', 'change', 'transfer'];

export default function AppealAdminWorkbench() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [bizType, setBizType] = useState('');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);
  const [action, setAction] = useState(null); // 'accept' | 'refuse' | 'dispatch' | 'supplement' | 'decide' | 'close' | 'merge'
  const [comment, setComment] = useState('');
  const [decisionType, setDecisionType] = useState('maintain');
  const [supplementDays, setSupplementDays] = useState('');
  const [priority, setPriority] = useState('normal');
  const [handlers, setHandlers] = useState([]);
  const [assignee, setAssignee] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [counters, setCounters] = useState({});

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set('status', status);
      if (bizType) params.set('bizType', bizType);
      if (q.trim()) params.set('q', q.trim());
      const data = await api.get(`/appeal/admin/appeals/queue?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
      setCounters({ pending: data.pending, processing: data.processing, supplementing: data.supplementing, overdue: data.overdue });
    } catch (err) {
      toastAppealError(t, err);
      setItems([]);
    }
  }, [page, status, bizType, q, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get('/appeal/admin/handlers')
      .then((data) => setHandlers(data.items))
      .catch(() => setHandlers([]));
  }, []);

  const openDetail = async (a) => {
    try {
      const data = await api.get(`/appeal/admin/appeals/${a.id}`);
      setDetail(data.appeal);
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const openAction = (kind) => {
    setComment('');
    setDecisionType('maintain');
    setSupplementDays('');
    setPriority(detail?.priority || 'normal');
    setAssignee('');
    setMergeTarget('');
    setAction(kind);
  };

  const runAction = async () => {
    if (!action || !detail) return;
    setBusy(true);
    try {
      if (action === 'accept') {
        await api.post(`/appeal/admin/appeals/${detail.id}/accept`, { comment });
      } else if (action === 'refuse') {
        await api.post(`/appeal/admin/appeals/${detail.id}/reject-accept`, { reason: comment });
      } else if (action === 'dispatch') {
        await api.post(`/appeal/admin/appeals/${detail.id}/dispatch`, { assigneeId: Number(assignee), priority });
      } else if (action === 'supplement') {
        await api.post(`/appeal/admin/appeals/${detail.id}/supplement`, {
          comment,
          days: supplementDays ? Number(supplementDays) : undefined,
        });
      } else if (action === 'decide') {
        await api.post(`/appeal/admin/appeals/${detail.id}/decide`, { decisionType, reason: comment });
      } else if (action === 'close') {
        await api.post(`/appeal/admin/appeals/${detail.id}/close`, { comment });
      } else if (action === 'merge') {
        await api.post('/appeal/admin/appeals/merge', { sourceId: detail.id, targetCode: mergeTarget.trim().toUpperCase() });
      }
      toastSuccess(t('common.saved'));
      setAction(null);
      const data = await api.get(`/appeal/admin/appeals/${detail.id}`);
      setDetail(data.appeal);
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { title: t('appeal.admin.colCode'), dataIndex: 'code', width: 170 },
    { title: t('appeal.admin.colApplicant'), dataIndex: 'username', width: 120 },
    {
      title: t('appeal.apply.bizType'),
      dataIndex: 'bizType',
      width: 100,
      render: (v) => t(`appeal.bizType.${v}`),
    },
    { title: t('appeal.apply.bizCode'), dataIndex: 'bizCode', width: 160 },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 110,
      render: (v) => (
        <Tag color={APPEAL_STATUS_COLORS[v] || 'default'} variant="soft">
          {t(`appeal.status.${v}`)}
        </Tag>
      ),
    },
    {
      title: t('appeal.admin.colPriority'),
      dataIndex: 'priority',
      width: 90,
      render: (v) => (
        <Tag color={PRIORITY_COLORS[v] || 'default'} variant="outlined">
          {t(`appeal.priority.${v}`)}
        </Tag>
      ),
    },
    { title: t('appeal.my.submittedAtLabel'), dataIndex: 'submittedAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      render: (_v, record) => (
        <Button type="default" size="small" icon={<EyeIcon />} onClick={() => openDetail(record)}>
          {t('appeal.my.view')}
        </Button>
      ),
    },
  ];

  const ACTION_META = {
    accept: t('appeal.admin.action.accept'),
    refuse: t('appeal.admin.action.refuse'),
    dispatch: t('appeal.admin.action.dispatch'),
    supplement: t('appeal.admin.action.supplement'),
    decide: t('appeal.admin.action.decide'),
    close: t('appeal.admin.action.close'),
    merge: t('appeal.admin.action.merge'),
  };

  return (
    <div className="appeal-admin-page">
      <div className="page-header">
        <Title size="middle">{t('appeal.admin.workbenchTitle')}</Title>
        <div className="table-actions appeal-admin-counters">
          <Tag variant="soft" color="app-yellow">{t('appeal.admin.counterPending', { count: counters.pending ?? 0 })}</Tag>
          <Tag variant="soft" color="app-blue">{t('appeal.admin.counterProcessing', { count: counters.processing ?? 0 })}</Tag>
          <Tag variant="soft" color="app-orange">{t('appeal.admin.counterSupplement', { count: counters.supplementing ?? 0 })}</Tag>
          {counters.overdue > 0 && <Tag variant="solid" color="app-red">{t('appeal.admin.counterOverdue', { count: counters.overdue })}</Tag>}
        </div>
      </div>

      <div className="table-actions appeal-filter-bar">
        <Select
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={QUEUE_STATUS.map((s) => ({ key: s, label: s === '' ? t('appeal.admin.allStatus') : t(`appeal.status.${s}`) }))}
        />
        <Select
          value={bizType}
          onChange={(v) => {
            setBizType(v);
            setPage(1);
          }}
          options={[{ key: '', label: t('appeal.admin.allBiz') }, ...BIZ_TYPES.map((b) => ({ key: b, label: t(`appeal.bizType.${b}`) }))]}
        />
        <Input
          size="middle"
          allowClear
          prefix={<SearchIcon size={14} />}
          placeholder={t('appeal.admin.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Card>
        <Table className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('appeal.admin.queueEmpty')}
        />
        {total > 10 && (
          <div className="appeal-pagination">
            <Pagination total={total} current={page} pageSize={10} onChange={setPage} showTotal />
          </div>
        )}
      </Card>

      <Drawer open={detail !== null} title={detail?.code} onClose={() => setDetail(null)} width={600}>
        {detail && (
          <div className="appeal-detail-body">
            <div className="appeal-detail-head">
              <Tag color={APPEAL_STATUS_COLORS[detail.status] || 'default'} variant="solid">
                {t(`appeal.status.${detail.status}`)}
              </Tag>
              <span className="muted-text">
                {detail.displayName} (@{detail.username})
              </span>
            </div>
            <dl className="appeal-field-list">
              <div>
                <dt>{t('appeal.apply.bizType')}</dt>
                <dd>
                  {t(`appeal.bizType.${detail.bizType}`)} · {detail.bizCode}
                </dd>
              </div>
              <div>
                <dt>{t('appeal.apply.reason')}</dt>
                <dd>{detail.reason}</dd>
              </div>
              <div>
                <dt>{t('appeal.apply.expected')}</dt>
                <dd>{detail.expected}</dd>
              </div>
              <div>
                <dt>{t('appeal.apply.contact')}</dt>
                <dd>{detail.contact}</dd>
              </div>
              <div>
                <dt>{t('appeal.my.submittedAtLabel')}</dt>
                <dd>{fmtDateTime(detail.submittedAt)}</dd>
              </div>
              {detail.handlerName && (
                <div>
                  <dt>{t('appeal.admin.handler')}</dt>
                  <dd>{detail.handlerName}</dd>
                </div>
              )}
              {detail.rejectReason && (
                <div>
                  <dt>{t('appeal.admin.refuseReason')}</dt>
                  <dd>{detail.rejectReason}</dd>
                </div>
              )}
              {detail.status === 'supplement_required' && (
                <div>
                  <dt>{t('appeal.detail.supplementDeadline')}</dt>
                  <dd>{fmtDateTime(detail.supplementDeadline)} · {detail.supplementNote}</dd>
                </div>
              )}
              {detail.decisionType && (
                <div>
                  <dt>{t('appeal.detail.decisionTitle')}</dt>
                  <dd>
                    <Tag color={DECISION_TYPE_COLORS[detail.decisionType] || 'default'} variant="soft">
                      {t(`appeal.decisionType.${detail.decisionType}`)}
                    </Tag>
                    {detail.decisionReason}
                  </dd>
                </div>
              )}
            </dl>

            <h4>{t('appeal.detail.materials')}</h4>
            <ul className="appeal-material-list">
              {detail.materials.map((m) => (
                <li key={m.id}>
                  <Tag variant="soft" color={m.origin === 'supplement' ? 'app-orange' : 'app-blue'} size="small">
                    {t(`appeal.materialKind.${m.kind}`)}
                  </Tag>
                  <span>{m.filename}</span>
                  <Button type="text" size="small" onClick={() => openAppealMaterial(m.id)}>
                    {t('appeal.my.preview')}
                  </Button>
                </li>
              ))}
              {detail.materials.length === 0 && <li className="muted-text">{t('common.empty')}</li>}
            </ul>

            <h4>{t('appeal.admin.bizLink')}</h4>
            {detail.bizLink?.integrated && detail.bizLink.found ? (
              <div className="appeal-biz-link">
                <div className="appeal-dist-row">
                  <Tag color="app-green" variant="soft">{detail.bizLink.office}</Tag>
                  <b>{detail.bizLink.title}</b>
                  <span className="muted-text">
                    {detail.bizLink.code} · {detail.bizLink.status}
                  </span>
                </div>
                {detail.bizLink.timeline?.length > 0 && (
                  <ul className="appeal-record-timeline">
                    {detail.bizLink.timeline.map((r, idx) => (
                      <li key={`${r.createdAt}-${idx}`}>
                        <Tag variant="soft" color="app-teal" size="small">{r.action}</Tag>
                        <span className="muted-text">{fmtDateTime(r.createdAt)}</span>
                        {r.comment && <p className="muted-text">{r.comment}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="muted-text">{t('appeal.admin.bizLinkMissing')}</p>
            )}

            <h4>{t('appeal.detail.records')}</h4>
            <ul className="appeal-record-timeline">
              {detail.records.map((r) => (
                <li key={r.id}>
                  <Tag variant="soft" color="app-teal" size="small">
                    {t(`appeal.recordAction.${r.action}`, { defaultValue: r.action })}
                  </Tag>
                  <span>{r.actorName}</span>
                  <span className="muted-text">{fmtDateTime(r.createdAt)}</span>
                  {r.comment && <p className="muted-text">{r.comment}</p>}
                </li>
              ))}
            </ul>

            <div className="table-actions appeal-admin-actions">
              {detail.status === 'pending_accept' && (
                <>
                  <Button type="primary" onClick={() => openAction('accept')}>
                    {t('appeal.admin.action.accept')}
                  </Button>
                  <Button danger onClick={() => openAction('refuse')}>
                    {t('appeal.admin.action.refuse')}
                  </Button>
                </>
              )}
              {['accepted', 'processing'].includes(detail.status) && (
                <>
                  <Button type="primary" onClick={() => openAction('decide')}>
                    {t('appeal.admin.action.decide')}
                  </Button>
                  <Button onClick={() => openAction('supplement')}>{t('appeal.admin.action.supplement')}</Button>
                  <Button onClick={() => openAction('dispatch')}>{t('appeal.admin.action.dispatch')}</Button>
                </>
              )}
              {['resolved', 'rejected'].includes(detail.status) && (
                <Button onClick={() => openAction('close')}>{t('appeal.admin.action.close')}</Button>
              )}
              {['draft', 'pending_accept', 'accepted', 'processing', 'supplement_required'].includes(detail.status) && (
                <Button danger onClick={() => openAction('merge')}>
                  {t('appeal.admin.action.merge')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={action !== null}
        title={action ? ACTION_META[action] : ''}
        onClose={() => {
          if (!busy) setAction(null);
        }}
        maskClosable={!busy}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setAction(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button
              type="primary"
              loading={busy}
              disabled={
                busy ||
                (action === 'refuse' && !comment.trim()) ||
                (action === 'decide' && !comment.trim()) ||
                (action === 'supplement' && !comment.trim()) ||
                (action === 'dispatch' && !assignee) ||
                (action === 'merge' && !mergeTarget.trim())
              }
              onClick={runAction}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        {action === 'decide' && (
          <div className="appeal-action-form">
            <p>{t('appeal.admin.decisionTypeLabel')}</p>
            <Select value={decisionType} onChange={setDecisionType} options={DECIDE_TYPES.map((d) => ({ key: d, label: t(`appeal.decisionType.${d}`) }))} />
            <p className="muted-text">{t(`appeal.admin.decideHint.${decisionType}`)}</p>
          </div>
        )}
        {action === 'supplement' && (
          <div className="appeal-action-form">
            <p>{t('appeal.admin.supplementDaysLabel')}</p>
            <Input size="large" value={supplementDays} onChange={(e) => setSupplementDays(e.target.value)} placeholder="7" />
          </div>
        )}
        {action === 'dispatch' && (
          <div className="appeal-action-form">
            <p>{t('appeal.admin.assigneeLabel')}</p>
            <Select
              value={assignee}
              onChange={setAssignee}
              placeholder={t('appeal.admin.assigneePlaceholder')}
              options={handlers.map((h) => ({ key: String(h.id), label: `${h.displayName || h.username} (@${h.username})` }))}
            />
            <p>{t('appeal.admin.priorityLabel')}</p>
            <Select
              value={priority}
              onChange={setPriority}
              options={['low', 'normal', 'high', 'urgent'].map((p) => ({ key: p, label: t(`appeal.priority.${p}`) }))}
            />
          </div>
        )}
        {action === 'merge' && (
          <div className="appeal-action-form">
            <p>{t('appeal.admin.mergeTargetLabel')}</p>
            <Input size="large" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} placeholder="NAA-…" />
            <p className="muted-text">{t('appeal.admin.mergeTargetTip')}</p>
          </div>
        )}
        {(action === 'accept' || action === 'refuse' || action === 'supplement' || action === 'decide' || action === 'close') && (
          <>
            <p>{action === 'refuse' ? t('appeal.admin.refuseReasonLabel') : action === 'decide' ? t('appeal.admin.decisionReasonLabel') : t('appeal.admin.commentLabel')}</p>
            <TextArea rows={action === 'decide' || action === 'refuse' ? 4 : 3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
          </>
        )}
      </Modal>
    </div>
  );
}
