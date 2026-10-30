// 居民审核工作台:待审队列、申请详情(含风控标记)、通过/驳回/补件。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Drawer, Input, Modal, Pagination, Select, Table, Tag, Title } from 'animal-island-ui';
import { BanIcon, CheckCircleIcon, EyeIcon, SearchIcon, SendIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { openResidentMaterial } from '../../../api/resident.js';
import { ResAdminNav } from '../ResidentShell.jsx';
import {
  APPLICATION_STATUS_COLORS,
  REJECT_REASONS,
  TextArea,
  fmtDateTime,
  toastResError,
} from '../shared.jsx';
import { toastSuccess } from '../../../components/toast.js';

const QUEUE_STATUS_OPTIONS = ['pending_review', 'supplement_required', 'approved', 'rejected', 'withdrawn', 'closed'];

const REVIEW_ACTION_I18N = {
  approve: 'res.reviewAction.approve',
  reject: 'res.reviewAction.reject',
  require_supplement: 'res.reviewAction.requireSupplement',
};

export default function AdminResReview() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [action, setAction] = useState(null);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [supplementDays, setSupplementDays] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set('status', status);
      if (typeFilter) params.set('type', typeFilter);
      if (query) params.set('q', query);
      const data = await api.get(`/resident/admin/queue?${params.toString()}`);
      const rows = data.items ?? [];
      setItems(rows);
      setTotal(data.total);
      // total 缩小后分页器虽然不渲染,page 仍可能 >1:夹回合法页码,别把人困在空表。
      if (rows.length === 0 && page > 1) setPage(Math.max(1, page - 1));
    } catch (err) {
      toastResError(t, err);
      setItems([]);
    }
  }, [page, status, typeFilter, query, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get('/resident/admin/types')
      .then((data) => setTypes(data.items))
      .catch(() => setTypes([]));
  }, []);

  const openDetail = async (app) => {
    try {
      const data = await api.get(`/resident/admin/applications/${app.id}`);
      setDetail(data.application);
    } catch (err) {
      toastResError(t, err);
    }
  };

  const openAction = (kind) => {
    setComment('');
    setReason('');
    setSupplementDays('');
    setAction({ kind, application: detail });
  };

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const id = action.application.id;
      if (action.kind === 'approve') {
        await api.post(`/resident/admin/applications/${id}/approve`, { comment });
      } else if (action.kind === 'reject') {
        await api.post(`/resident/admin/applications/${id}/reject`, { reasonCode: reason, comment });
      } else if (action.kind === 'supplement') {
        await api.post(`/resident/admin/applications/${id}/supplement`, {
          comment,
          supplementDays: supplementDays ? Number(supplementDays) : undefined,
        });
      }
      toastSuccess(t('common.save'));
      setAction(null);
      const data = await api.get(`/resident/admin/applications/${id}`);
      setDetail(data.application);
      await load();
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { title: t('res.admin.field.appNo'), dataIndex: 'appNo', width: 180 },
    { title: t('res.admin.field.applicant'), dataIndex: 'username', width: 130 },
    { title: t('res.card.type'), dataIndex: 'typeName', width: 110 },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 130,
      render: (v) => (
        <Tag color={APPLICATION_STATUS_COLORS[v] || 'brown'} variant="soft">
          {t(`res.appStatus.${v}`)}
        </Tag>
      ),
    },
    { title: t('res.admin.field.submittedAt'), dataIndex: 'submittedAt', width: 160, render: fmtDateTime },
    { title: t('res.form.nickname'), dataIndex: 'nickname', width: 120 },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      render: (_, record) => (
        <Button type="default" size="small" icon={<EyeIcon />} onClick={() => openDetail(record)}>
          {t('res.admin.view')}
        </Button>
      ),
    },
  ];

  const ACTION_META = {
    approve: { title: t('res.admin.actions.approve'), icon: <CheckCircleIcon /> },
    reject: { title: t('res.admin.actions.reject'), icon: <BanIcon /> },
    supplement: { title: t('res.admin.actions.supplement'), icon: <SendIcon /> },
  };

  return (
    <div className="res-admin-page">
      <ResAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('res.admin.workbench.title')}</Title>
        </h1>
        <div className="table-actions res-filter-bar">
          <Select
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[{ key: '', label: t('res.admin.allStatus') }, ...QUEUE_STATUS_OPTIONS.map((s) => ({ key: s, label: t(`res.appStatus.${s}`) }))]}
          />
          <Select
            value={typeFilter}
            onChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
            options={[{ key: '', label: t('res.admin.allTypes') }, ...types.filter((tp) => tp.enabled).map((tp) => ({ key: tp.code, label: tp.name }))]}
          />
          <Input
            size="middle"
            allowClear
            prefix={<SearchIcon size={14} />}
            placeholder={t('res.admin.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setQuery(q.trim());
                setPage(1);
              }
            }}
            onClear={() => {
              setQ('');
              setQuery('');
              setPage(1);
            }}
          />
          <Button
            size="middle"
            icon={<SearchIcon />}
            onClick={() => {
              setQuery(q.trim());
              setPage(1);
            }}
          >
            {t('common.search')}
          </Button>
        </div>
      </div>

      <Card>
        <Table className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('res.admin.queueEmpty')}
        />
        {total > 0 && (
          <div className="res-pagination">
            <Pagination total={total} current={page} pageSize={10} onChange={setPage} showTotal />
          </div>
        )}
      </Card>

      <Drawer maskClosable={false} open={detail !== null} title={detail?.appNo} onClose={() => setDetail(null)} width={560}>
        {detail && (
          <div className="res-admin-detail">
            <div className="res-admin-detail-head">
              <Tag color={APPLICATION_STATUS_COLORS[detail.status] || 'brown'} variant="soft">
                {t(`res.appStatus.${detail.status}`)}
              </Tag>
              <span className="muted-text">
                {detail.displayName} (@{detail.username})
              </span>
              {detail.pastApplications > 1 && (
                <Tag color="warm-peach-pink" variant="soft" size="small">
                  {t('res.admin.pastApps', { count: detail.pastApplications })}
                </Tag>
              )}
              {detail.blacklisted && (
                <Tag color="app-red" variant="soft" size="small">
                  {t('res.admin.blacklisted')}
                </Tag>
              )}
            </div>
            <dl className="res-field-list">
              {[
                [t('res.card.type'), `${detail.typeName} (${detail.typeCode})`],
                [t('res.form.nickname'), detail.nickname],
                [t('res.form.contact'), detail.contact],
                [t('res.form.virtualAddress'), detail.virtualAddress || '-'],
                [t('res.form.purposes'), (detail.purposes || []).map((p) => t(`res.purpose.${p}`)).join('、')],
                [t('res.form.bio'), detail.bio || '-'],
                [t('res.admin.field.submittedAt'), fmtDateTime(detail.submittedAt)],
              ].map(([label, value]) => (
                <div key={label} className="res-field-row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <h2 className="block-heading">{t('res.detail.materialsTitle')}</h2>
            <ul className="res-material-list">
              {detail.materials.map((m) => (
                <li key={m.id}>
                  <Tag size="small" variant="soft" color={m.origin === 'supplement' ? 'warm-peach-pink' : 'app-blue'}>
                    {t(`res.materialKind.${m.kind}`)}
                  </Tag>
                  <span>{m.filename}</span>
                  <Button type="text" size="small" icon={<EyeIcon />} onClick={() => openResidentMaterial(m.id)}>
                    {t('res.admin.preview')}
                  </Button>
                </li>
              ))}
              {detail.materials.length === 0 && <li className="muted-text">{t('common.empty')}</li>}
            </ul>

            <h2 className="block-heading">{t('res.detail.recordsTitle')}</h2>
            <ul className="res-review-timeline">
              {detail.reviews.map((r) => (
                <li key={r.id}>
                  <div className="res-review-head">
                    <Tag variant="soft" color={r.action === 'reject' ? 'app-red' : r.action === 'approve' ? 'app-green' : 'warm-peach-pink'}>
                      {t(REVIEW_ACTION_I18N[r.action] || 'res.reviewAction.other')}
                    </Tag>
                    <span>{r.reviewerName}</span>
                    <span className="muted-text">{fmtDateTime(r.createdAt)}</span>
                  </div>
                  {r.comment && <p className="muted-text">{r.comment}</p>}
                </li>
              ))}
              {detail.reviews.length === 0 && <li className="muted-text">{t('common.empty')}</li>}
            </ul>

            {detail.supplementNote && (
              <div className="res-admin-supplement">
                <h2 className="block-heading">{t('res.detail.supplementRequired')}</h2>
                <p className="muted-text">
                  {detail.supplementNote} ({fmtDateTime(detail.supplementDeadline)})
                </p>
              </div>
            )}

            <div className="table-actions res-admin-actions">
              {detail.status === 'pending_review' && (
                <>
                  <Button type="primary" icon={<CheckCircleIcon />} onClick={() => openAction('approve')}>
                    {t('res.admin.actions.approve')}
                  </Button>
                  <Button type="default" onClick={() => openAction('supplement')}>
                    {t('res.admin.actions.supplement')}
                  </Button>
                  <Button type="default" danger onClick={() => openAction('reject')}>
                    {t('res.admin.actions.reject')}
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
        onClose={() => {
          if (!busy) setAction(null);
        }}
        maskClosable={false}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setAction(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={busy || (action?.kind === 'reject' && !reason)} onClick={runAction}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        {action?.kind === 'reject' && (
          <div className="res-action-form">
            <p>{t('res.admin.rejectReasonLabel')}</p>
            <Select value={reason} onChange={setReason} options={REJECT_REASONS.map((code) => ({ key: code, label: t(`res.rejectReason.${code}`) }))} />
          </div>
        )}
        {action?.kind === 'supplement' && (
          <div className="res-action-form">
            <p>{t('res.admin.supplementDaysLabel')}</p>
            <Input size="large" value={supplementDays} onChange={(e) => setSupplementDays(e.target.value)} placeholder="7" />
          </div>
        )}
        <p>{t('res.admin.commentLabel')}</p>
        <TextArea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
      </Modal>
    </div>
  );
}
