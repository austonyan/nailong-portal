// 删除申请处理 — 队列:受理 → 通过或驳回 → 执行并出回执。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { CheckCircleIcon, EyeIcon, SendIcon, XCircleIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { ArchAdminNav, RequestStatusTag, TextArea, fmtDateTime, toastArchError } from '../shared.jsx';
import { toastSuccess } from '../../../components/toast.js';

const STATUS_OPTIONS = [
  { key: '', labelKey: 'arch.admin.requests.allStatuses' },
  { key: 'pending', labelKey: 'arch.status.pending' },
  { key: 'reviewing', labelKey: 'arch.status.reviewing' },
  { key: 'executing', labelKey: 'arch.status.executing' },
  { key: 'completed', labelKey: 'arch.status.completed' },
  { key: 'rejected', labelKey: 'arch.status.rejected' },
];

export default function AdminArchRequests() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const pageSize = 10;

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) params.set('status', status);
    api
      .get(`/archives/admin/deletion-requests?${params}`)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        toastArchError(err);
        setItems([]);
      });
  }, [page, status]);

  useEffect(load, [load]);

  const openDetail = async (row) => {
    try {
      const data = await api.get(`/archives/admin/deletion-requests/${row.id}`);
      setDetail(data.request);
      setError('');
    } catch (err) {
      toastArchError(err);
    }
  };

  const refreshDetail = async (id) => {
    const data = await api.get(`/archives/admin/deletion-requests/${id}`);
    setDetail(data.request);
  };

  const act = async (path, body = {}) => {
    setBusy(true);
    try {
      await api.post(`/archives/admin/deletion-requests/${detail.id}/${path}`, body);
      await refreshDetail(detail.id);
      toastSuccess(t('common.saved'));
      setError('');
      setRejectOpen(false);
      setReason('');
      load();
    } catch (err) {
      toastArchError(err);
      setError(err?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const reject = () => {
    if (reason.trim().length < 2) {
      setError(t('api.ARCH_REASON_REQUIRED'));
      return;
    }
    act('reject', { reason: reason.trim() });
  };

  const columns = [
    { title: t('arch.request.no'), dataIndex: 'no', width: 180 },
    {
      title: t('arch.admin.requests.applicant'),
      dataIndex: 'applicant',
      width: 140,
      render: (v) => (v ? `${v.displayName || v.username}` : <span className="muted-text">-</span>),
    },
    {
      title: t('arch.request.scope'),
      dataIndex: 'scopeTypes',
      width: 190,
      render: (v, record) => (v ?? []).map((type) => type.name).join('、') || record.scope.join(', '),
    },
    { title: t('common.status'), dataIndex: 'status', width: 110, render: (v) => <RequestStatusTag value={v} /> },
    { title: t('common.createdAt'), dataIndex: 'createdAt', width: 150, render: (v) => fmtDateTime(v) },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 100,
      render: (_, record) => (
        <div className="table-actions">
          <Button type="default" size="small" icon={<EyeIcon />} onClick={() => openDetail(record)}>
            {t('arch.admin.requests.detail')}
          </Button>
        </div>
      ),
    },
  ];

  const st = detail?.status;

  return (
    <div className="arch-page">
      <ArchAdminNav />
      <div className="page-header">
        <Title size="middle" color="brown">
          {t('arch.admin.requests.title')}
        </Title>
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_OPTIONS.map((o) => ({ key: o.key, label: t(o.labelKey) }))} />
      </div>

      <Card>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={{ current: page, pageSize, total, onChange: (p) => setPage(p), showTotal: true }}
          emptyText={t('arch.request.empty')}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={detail !== null}
        title={t('arch.admin.requests.detailTitle', { no: detail?.no ?? '' })}
        onClose={() => (busy ? undefined : setDetail(null))}
        typewriter={false}
        width={600}
        footer={
          <>
            <Button disabled={busy} onClick={() => setDetail(null)}>
              {t('common.close')}
            </Button>
            {(st === 'pending' || st === 'reviewing') && (
              <Button danger disabled={busy} icon={<XCircleIcon />} onClick={() => { setRejectOpen(true); setReason(''); setError(''); }}>
                {t('arch.admin.requests.reject')}
              </Button>
            )}
            {st === 'pending' && (
              <Button type="primary" loading={busy} disabled={busy} icon={<CheckCircleIcon />} onClick={() => act('accept')}>
                {t('arch.admin.requests.accept')}
              </Button>
            )}
            {st === 'reviewing' && (
              <Button type="primary" loading={busy} disabled={busy} icon={<CheckCircleIcon />} onClick={() => act('approve')}>
                {t('arch.admin.requests.approve')}
              </Button>
            )}
            {st === 'executing' && (
              <Button type="primary" loading={busy} disabled={busy} icon={<SendIcon />} onClick={() => act('execute')}>
                {t('arch.admin.requests.execute')}
              </Button>
            )}
          </>
        }
      >
        {detail && (
          <div className="arch-summary">
            <div className="arch-summary-row">
              <span>{t('arch.admin.requests.applicant')}</span>
              <span>{detail.applicant ? `${detail.applicant.displayName || detail.applicant.username} (@${detail.applicant.username})` : '-'}</span>
            </div>
            <div className="arch-summary-row">
              <span>{t('arch.request.scope')}</span>
              <span className="arch-tag-row">
                {(detail.scopeTypes ?? []).map((type) => (
                  <Tag key={type.code} variant="soft" size="small">
                    {type.name}
                  </Tag>
                ))}
              </span>
            </div>
            <div className="arch-summary-row">
              <span>{t('arch.request.impact')}</span>
              <span>{detail.impact}</span>
            </div>
            {detail.reason && (
              <div className="arch-summary-row">
                <span>{t('arch.request.reason')}</span>
                <span>{detail.reason}</span>
              </div>
            )}
            <div className="arch-summary-row">
              <span>{t('common.status')}</span>
              <RequestStatusTag value={detail.status} />
            </div>
            {detail.status === 'completed' && (
              <>
                <div className="arch-summary-row">
                  <span>{t('arch.request.receipt')}</span>
                  <span>{detail.receiptNo}</span>
                </div>
                <div className="arch-summary-row">
                  <span>{t('arch.request.affected')}</span>
                  <span>{t('arch.request.affectedValue', { count: detail.affectedCount })}</span>
                </div>
              </>
            )}
            {detail.status === 'rejected' && detail.rejectReason && (
              <div className="arch-summary-row">
                <span>{t('arch.request.rejectReason')}</span>
                <span>{detail.rejectReason}</span>
              </div>
            )}
            <div>
              <p className="arch-field-label">{t('arch.request.timeline')}</p>
              <div className="arch-timeline">
                {(detail.events ?? []).map((event) => (
                  <div key={event.id} className="arch-timeline-item">
                    <div className="arch-timeline-head">
                      <Tag color="app-blue" variant="soft" size="small">
                        {t(`arch.event.${event.action}`, { defaultValue: event.action })}
                      </Tag>
                      <span className="arch-timeline-time">{fmtDateTime(event.createdAt)}</span>
                      {event.actorName && <span className="muted-text">{event.actorName}</span>}
                    </div>
                    {event.note && <p className="arch-timeline-note">{event.note}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        maskClosable={false}
        open={rejectOpen}
        title={t('arch.admin.requests.rejectTitle', { no: detail?.no ?? '' })}
        onClose={() => (busy ? undefined : setRejectOpen(false))}
        typewriter={false}
        footer={
          <>
            <Button disabled={busy} onClick={() => setRejectOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" danger loading={busy} disabled={busy} onClick={reject}>
              {t('arch.admin.requests.rejectConfirm')}
            </Button>
          </>
        }
      >
        <p>{t('arch.admin.requests.rejectTip')}</p>
        <TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('arch.admin.requests.reasonPlaceholder')} maxLength={300} />
        {error && <p className="arch-error">{error}</p>}
      </Modal>
    </div>
  );
}