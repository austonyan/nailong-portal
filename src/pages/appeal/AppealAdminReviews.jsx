// 复核管理:复核队列、详情、受理与复核决定(维持/撤销/变更,一次终局)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Drawer,
  Input,
  Modal,
  Notification,
  Pagination,
  Select,
  Table,
  Tag,
  TextArea,
  Title,
} from 'animal-island-ui';
import { EyeIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { openAppealMaterial } from '../../../api/appeal.js';
import { DECISION_TYPE_COLORS, REVIEW_STATUS_COLORS, fmtDateTime, toastAppealError } from '../shared.jsx';

const STATUS_OPTIONS = ['', 'pending', 'reviewing', 'completed'];
const DECIDE_TYPES = ['maintain', 'undo', 'change'];

export default function AppealAdminReviews() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [action, setAction] = useState(null); // 'accept' | 'decide'
  const [decisionType, setDecisionType] = useState('maintain');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const pageSize = 10;

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/appeal/admin/reviews/queue${status ? `?status=${status}` : ''}`);
      setItems(data.items);
    } catch (err) {
      toastAppealError(t, err);
      setItems([]);
    }
  }, [status, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (r) => {
    try {
      const data = await api.get(`/appeal/admin/reviews/${r.id}`);
      setDetail(data.review);
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const runAction = async () => {
    setBusy(true);
    try {
      if (action === 'accept') {
        await api.post(`/appeal/admin/reviews/${detail.id}/accept`, {});
      } else {
        await api.post(`/appeal/admin/reviews/${detail.id}/decide`, { decisionType, reason });
      }
      Notification.success(t('common.saved'));
      setAction(null);
      const data = await api.get(`/appeal/admin/reviews/${detail.id}`);
      setDetail(data.review);
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const total = items?.length ?? 0;
  const pageItems = (items ?? []).slice((page - 1) * pageSize, page * pageSize);

  const columns = [
    { title: t('appeal.admin.colCode'), dataIndex: 'code', width: 170 },
    { title: t('appeal.admin.colApplicant'), dataIndex: 'username', width: 120 },
    { title: t('appeal.review.appealLabel'), dataIndex: 'appealCode', width: 170 },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 110,
      render: (v) => (
        <Tag color={REVIEW_STATUS_COLORS[v] || 'default'} variant="soft">
          {t(`appeal.reviewStatus.${v}`)}
        </Tag>
      ),
    },
    {
      title: t('appeal.review.decision'),
      dataIndex: 'decisionType',
      width: 110,
      render: (v) => (v ? <Tag color={DECISION_TYPE_COLORS[v] || 'default'} variant="outlined">{t(`appeal.decisionType.${v}`)}</Tag> : '-'),
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

  return (
    <div className="appeal-admin-page">
      <div className="page-header">
        <Title size="middle">{t('appeal.admin.reviewTitle')}</Title>
        <div className="table-actions appeal-filter-bar">
          <Select
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={STATUS_OPTIONS.map((s) => ({ key: s, label: s === '' ? t('appeal.admin.allStatus') : t(`appeal.reviewStatus.${s}`) }))}
          />
        </div>
      </div>

      <Card>
        <p className="muted-text appeal-review-final-tip">{t('appeal.admin.reviewFinalTip')}</p>
        <Table
          columns={columns}
          dataSource={pageItems}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('appeal.admin.queueEmpty')}
        />
        {total > pageSize && (
          <div className="appeal-pagination">
            <Pagination total={total} current={page} pageSize={pageSize} onChange={setPage} showTotal />
          </div>
        )}
      </Card>

      <Drawer open={detail !== null} title={detail?.code} onClose={() => setDetail(null)} width={600}>
        {detail && (
          <div className="appeal-detail-body">
            <div className="appeal-detail-head">
              <Tag color={REVIEW_STATUS_COLORS[detail.status] || 'default'} variant="solid">
                {t(`appeal.reviewStatus.${detail.status}`)}
              </Tag>
              <span className="muted-text">
                {detail.displayName} (@{detail.username})
              </span>
            </div>
            <dl className="appeal-field-list">
              <div>
                <dt>{t('appeal.review.appealLabel')}</dt>
                <dd>{detail.appealCode}</dd>
              </div>
              {detail.appeal && (
                <div>
                  <dt>{t('appeal.admin.originalDecision')}</dt>
                  <dd>
                    {detail.appeal.decisionType ? t(`appeal.decisionType.${detail.appeal.decisionType}`) : t(`appeal.status.${detail.appeal.status}`)}
                    {detail.appeal.decisionReason ? ` — ${detail.appeal.decisionReason}` : ''}
                  </dd>
                </div>
              )}
              <div>
                <dt>{t('appeal.review.reasonLabel')}</dt>
                <dd>{detail.reason}</dd>
              </div>
              <div>
                <dt>{t('appeal.my.submittedAtLabel')}</dt>
                <dd>{fmtDateTime(detail.submittedAt)}</dd>
              </div>
              {detail.decidedAt && (
                <div>
                  <dt>{t('appeal.review.decidedAt')}</dt>
                  <dd>
                    {fmtDateTime(detail.decidedAt)} · {detail.decidedBy}
                  </dd>
                </div>
              )}
              {detail.decisionType && (
                <div>
                  <dt>{t('appeal.review.decision')}</dt>
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
              {(detail.materials ?? []).map((m) => (
                <li key={m.id}>
                  <Tag variant="soft" color="app-blue" size="small">
                    {t(`appeal.materialKind.${m.kind}`)}
                  </Tag>
                  <span>{m.filename}</span>
                  <Button type="text" size="small" onClick={() => openAppealMaterial(m.id)}>
                    {t('appeal.my.preview')}
                  </Button>
                </li>
              ))}
              {(detail.materials ?? []).length === 0 && <li className="muted-text">{t('common.empty')}</li>}
            </ul>

            <h4>{t('appeal.detail.records')}</h4>
            <ul className="appeal-record-timeline">
              {(detail.records ?? []).map((r) => (
                <li key={r.id}>
                  <Tag variant="soft" color="app-teal" size="small">
                    {t(`appeal.recordAction.${r.action}`, { defaultValue: r.action })}
                  </Tag>
                  <span>{r.actorName}</span>
                  <span className="muted-text">{fmtDateTime(r.createdAt)}</span>
                </li>
              ))}
            </ul>

            <div className="table-actions appeal-admin-actions">
              {detail.status === 'pending' && (
                <Button type="primary" onClick={() => { setReason(''); setAction('accept'); }}>
                  {t('appeal.admin.action.reviewAccept')}
                </Button>
              )}
              {detail.status === 'reviewing' && (
                <Button type="primary" onClick={() => { setReason(''); setDecisionType('maintain'); setAction('decide'); }}>
                  {t('appeal.admin.action.reviewDecide')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={action === 'decide'}
        title={t('appeal.admin.action.reviewDecide')}
        onClose={() => setAction(null)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setAction(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={reason.trim().length < 5} onClick={runAction}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="appeal-action-form">
          <p>{t('appeal.admin.reviewDecisionLabel')}</p>
          <Select value={decisionType} onChange={setDecisionType} options={DECIDE_TYPES.map((d) => ({ key: d, label: t(`appeal.decisionType.${d}`) }))} />
          <p className="muted-text">{t(`appeal.admin.decideHint.${decisionType}`)}</p>
          <p>{t('appeal.admin.decisionReasonLabel')}</p>
          <TextArea rows={4} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
