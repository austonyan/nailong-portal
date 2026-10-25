// 审核工作台:待审队列、申请详情、通过/驳回/补件、签发与签注状态管理。
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
  Title,
} from 'animal-island-ui';
import { BanIcon, CheckCircleIcon, EyeIcon, SearchIcon, SendIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { openVisaMaterial } from '../../api/visa.js';
import {
  APPLICATION_STATUS_COLORS,
  PERMIT_STATUS_COLORS,
  REJECT_REASONS,
  TextArea,
  fmtDateTime,
  toastVisaError,
} from './shared.jsx';

const QUEUE_STATUS_OPTIONS = [
  { key: '', label: 'all' },
  { key: 'pending_review', label: 'pending_review' },
  { key: 'supplement_required', label: 'supplement_required' },
  { key: 'approved', label: 'approved' },
  { key: 'issued', label: 'issued' },
  { key: 'rejected', label: 'rejected' },
  { key: 'withdrawn', label: 'withdrawn' },
  { key: 'closed', label: 'closed' },
];

export default function VisaAdminWorkbench() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [types, setTypes] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [action, setAction] = useState(null); // { kind, application }
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [supplementDays, setSupplementDays] = useState('');
  const [validDays, setValidDays] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set('status', status);
      if (typeFilter) params.set('type', typeFilter);
      if (q.trim()) params.set('q', q.trim());
      const data = await api.get(`/visa/admin/queue?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toastVisaError(t, err);
      setItems([]);
    }
  }, [page, status, typeFilter, q, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get('/visa/admin/types')
      .then((data) => setTypes(data.items))
      .catch(() => setTypes([]));
  }, []);

  const openDetail = async (app) => {
    try {
      const data = await api.get(`/visa/admin/applications/${app.id}`);
      setDetail(data.application);
    } catch (err) {
      toastVisaError(t, err);
    }
  };

  const openAction = (kind) => {
    setComment('');
    setReason('');
    setSupplementDays('');
    setValidDays('');
    setAction({ kind, application: detail });
  };

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const id = action.application.id;
      if (action.kind === 'approve') {
        await api.post(`/visa/admin/applications/${id}/approve`, { comment });
      } else if (action.kind === 'reject') {
        await api.post(`/visa/admin/applications/${id}/reject`, { reasonCode: reason, comment });
      } else if (action.kind === 'supplement') {
        await api.post(`/visa/admin/applications/${id}/supplement`, {
          comment,
          supplementDays: supplementDays ? Number(supplementDays) : undefined,
        });
      } else if (action.kind === 'issue') {
        await api.post(`/visa/admin/applications/${id}/issue`, {
          comment,
          validDays: validDays ? Number(validDays) : undefined,
        });
      } else if (action.kind === 'void') {
        await api.post(`/visa/admin/permits/${action.application.permit.visaNo}/void`, { comment });
      } else if (action.kind === 'markUsed') {
        await api.post(`/visa/admin/permits/${action.application.permit.visaNo}/mark-used`, { comment });
      }
      Notification.success(t('common.save'));
      setAction(null);
      const data = await api.get(`/visa/admin/applications/${id}`);
      setDetail(data.application);
      await load();
    } catch (err) {
      toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { title: t('visa.field.appNo'), dataIndex: 'appNo', width: 180 },
    { title: t('visa.field.applicant'), dataIndex: 'username', width: 130 },
    { title: t('visa.field.type'), dataIndex: 'typeName', width: 100 },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 120,
      render: (v) => (
        <Tag color={APPLICATION_STATUS_COLORS[v] || 'default'} variant="soft">
          {t(`visa.status.${v}`)}
        </Tag>
      ),
    },
    { title: t('visa.field.submittedAt'), dataIndex: 'submittedAt', width: 160, render: fmtDateTime },
    { title: t('visa.form.nickname'), dataIndex: 'nickname', width: 120 },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      render: (_, record) => (
        <Button type="default" size="small" icon={<EyeIcon />} onClick={() => openDetail(record)}>
          {t('visa.my.view')}
        </Button>
      ),
    },
  ];

  const ACTION_META = {
    approve: { title: t('visa.admin.actions.approve'), icon: <CheckCircleIcon /> },
    reject: { title: t('visa.admin.actions.reject'), icon: <BanIcon /> },
    supplement: { title: t('visa.admin.actions.supplement'), icon: <SendIcon /> },
    issue: { title: t('visa.admin.actions.issue'), icon: <SendIcon /> },
    void: { title: t('visa.admin.actions.void'), icon: <BanIcon /> },
    markUsed: { title: t('visa.admin.actions.markUsed'), icon: <CheckCircleIcon /> },
  };

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('visa.admin.workbench.title')}</Title>
        <div className="table-actions visa-filter-bar">
          <Select
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={QUEUE_STATUS_OPTIONS.map((o) => ({ key: o.key, label: o.key === '' ? t('visa.admin.allStatus') : t(`visa.status.${o.label}`) }))}
          />
          <Select
            value={typeFilter}
            onChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
            options={[{ key: '', label: t('visa.admin.allTypes') }, ...types.map((tp) => ({ key: tp.code, label: tp.name }))]}
          />
          <Input
            size="middle"
            allowClear
            prefix={<SearchIcon size={14} />}
            placeholder={t('visa.admin.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('visa.admin.queueEmpty')}
        />
        {total > 10 && (
          <div className="visa-pagination">
            <Pagination total={total} current={page} pageSize={10} onChange={setPage} showTotal />
          </div>
        )}
      </Card>

      <Drawer open={detail !== null} title={detail?.appNo} onClose={() => setDetail(null)} width={560}>
        {detail && (
          <div className="visa-admin-detail">
            <div className="visa-admin-detail-head">
              <Tag color={APPLICATION_STATUS_COLORS[detail.status]} variant="solid">
                {t(`visa.status.${detail.status}`)}
              </Tag>
              <span className="muted-text">
                {detail.displayName} (@{detail.username})
              </span>
            </div>
            <dl className="visa-field-list">
              {[
                [t('visa.field.type'), `${detail.typeName} (${detail.typeCode})`],
                [t('visa.form.nickname'), detail.nickname],
                [t('visa.form.contact'), detail.contact],
                [t('visa.form.virtualId'), detail.virtualId || '-'],
                [t('visa.form.purpose'), detail.purpose],
                [t('visa.field.trip'), `${fmtDateTime(detail.planArrive).slice(0, 10)} ~ ${fmtDateTime(detail.planLeave).slice(0, 10)}`],
                [t('visa.form.itinerary'), detail.itinerary],
                [t('visa.form.inviterName'), detail.inviterName || '-'],
                [t('visa.form.companions'), detail.companions || '-'],
                [t('visa.field.submittedAt'), fmtDateTime(detail.submittedAt)],
              ].map(([label, value]) => (
                <div key={label} className="visa-field-row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <h4>{t('visa.detail.materials')}</h4>
            <ul className="visa-material-list">
              {detail.materials.map((m) => (
                <li key={m.id}>
                  <Tag size="small" variant="soft" color={m.origin === 'supplement' ? 'app-orange' : 'app-blue'}>
                    {t(`visa.materialKind.${m.kind}`)}
                  </Tag>
                  <span>{m.filename}</span>
                  <Button type="text" size="small" icon={<EyeIcon />} onClick={() => openVisaMaterial(m.id)}>
                    {t('visa.my.preview')}
                  </Button>
                </li>
              ))}
            </ul>

            <h4>{t('visa.detail.reviews')}</h4>
            <ul className="visa-review-timeline">
              {detail.reviews.map((r) => (
                <li key={r.id}>
                  <div className="visa-review-head">
                    <Tag variant="soft" color={r.action === 'reject' ? 'app-red' : r.action === 'approve' ? 'app-green' : 'app-yellow'}>
                      {t(`visa.reviewAction.${r.action}`)}
                    </Tag>
                    <span>{r.reviewerName}</span>
                    <span className="muted-text">{fmtDateTime(r.createdAt)}</span>
                  </div>
                  {r.comment && <p className="muted-text">{r.comment}</p>}
                </li>
              ))}
            </ul>

            {detail.permit && (
              <div className="visa-admin-permit">
                <h4>{t('visa.permit.title')}</h4>
                <p>
                  <Tag color={PERMIT_STATUS_COLORS[detail.permit.status]} variant="solid">
                    {t(`visa.permitStatus.${detail.permit.status}`)}
                  </Tag>
                  {detail.permit.visaNo}
                </p>
              </div>
            )}

            <div className="table-actions visa-admin-actions">
              {detail.status === 'pending_review' && (
                <>
                  <Button type="primary" icon={<CheckCircleIcon />} onClick={() => openAction('approve')}>
                    {t('visa.admin.actions.approve')}
                  </Button>
                  <Button type="default" onClick={() => openAction('supplement')}>
                    {t('visa.admin.actions.supplement')}
                  </Button>
                  <Button type="default" danger onClick={() => openAction('reject')}>
                    {t('visa.admin.actions.reject')}
                  </Button>
                </>
              )}
              {detail.status === 'approved' && (
                <Button type="primary" icon={<SendIcon />} onClick={() => openAction('issue')}>
                  {t('visa.admin.actions.issue')}
                </Button>
              )}
              {detail.permit && ['valid', 'used'].includes(detail.permit.status) && (
                <>
                  {detail.permit.status === 'valid' && (
                    <Button type="default" onClick={() => openAction('markUsed')}>
                      {t('visa.admin.actions.markUsed')}
                    </Button>
                  )}
                  <Button type="default" danger onClick={() => openAction('void')}>
                    {t('visa.admin.actions.void')}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={action !== null}
        title={action ? ACTION_META[action.kind]?.title : ''}
        onClose={() => setAction(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setAction(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={action?.kind === 'reject' && !reason} onClick={runAction}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        {action?.kind === 'reject' && (
          <div className="visa-action-form">
            <p>{t('visa.admin.rejectReasonLabel')}</p>
            <Select
              value={reason}
              onChange={setReason}
              options={REJECT_REASONS.map((code) => ({ key: code, label: t(`visa.rejectReason.${code}`) }))}
            />
          </div>
        )}
        {action?.kind === 'supplement' && (
          <div className="visa-action-form">
            <p>{t('visa.admin.supplementDaysLabel')}</p>
            <Input size="large" value={supplementDays} onChange={(e) => setSupplementDays(e.target.value)} placeholder="7" />
          </div>
        )}
        {action?.kind === 'issue' && (
          <div className="visa-action-form">
            <p>{t('visa.admin.validDaysLabel')}</p>
            <Input size="large" value={validDays} onChange={(e) => setValidDays(e.target.value)} placeholder="90" />
          </div>
        )}
        <p>{t('visa.admin.commentLabel')}</p>
        <TextArea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
      </Modal>
    </div>
  );
}
