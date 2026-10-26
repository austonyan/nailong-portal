// 礼遇管理:类型配置、礼遇申请审核、使用记录与统计入口。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Input,
  Modal,
  Pagination,
  Select,
  Switch,
  Table,
  Tabs,
  Tag,
  Title,
} from 'animal-island-ui';
import { CheckCircleIcon, PlusIcon, SearchIcon, StarIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import {
  StatusTag,
  TextArea,
  fmtDateTime,
  toastProtocolError,
} from '../shared.jsx';
import { toastSuccess } from '../shared.jsx';

const STATUSES = ['pending_review', 'approved', 'rejected', 'used', 'cancelled', 'expired'];
const REASONS = ['info_missing', 'identity_mismatch', 'duplicate', 'rule_violation', 'other'];

export default function AdminProtocolCourtesy() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('applications');
  const [types, setTypes] = useState([]);
  const [apps, setApps] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending_review');
  const [q, setQ] = useState('');
  const [records, setRecords] = useState(null);
  const [typeEdit, setTypeEdit] = useState(null);
  const [typeForm, setTypeForm] = useState({ code: '', name: '', description: '', requirements: '', enabled: true, sortOrder: 99 });
  const [action, setAction] = useState(null);
  const [validDays, setValidDays] = useState('14');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const loadTypes = useCallback(async () => {
    try {
      const data = await api.get('/protocol/admin/courtesy/types');
      setTypes(data.items);
    } catch (err) {
      toastProtocolError(t, err);
    }
  }, [t]);

  const loadApps = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      const data = await api.get(`/protocol/admin/courtesy/applications?${params.toString()}`);
      setApps(data.items);
      setTotal(data.total);
    } catch (err) {
      toastProtocolError(t, err);
      setApps([]);
    }
  }, [page, status, q, t]);

  const loadRecords = useCallback(async () => {
    try {
      const data = await api.get('/protocol/admin/courtesy/records?pageSize=50');
      setRecords(data.items);
    } catch (err) {
      toastProtocolError(t, err);
      setRecords([]);
    }
  }, [t]);

  useEffect(() => { loadTypes(); }, [loadTypes]);
  useEffect(() => { loadApps(); }, [loadApps]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  const saveType = async () => {
    setBusy(true);
    try {
      if (typeEdit === 'new') await api.post('/protocol/admin/courtesy/types', typeForm);
      else await api.patch(`/protocol/admin/courtesy/types/${typeEdit.id}`, typeForm);
      toastSuccess(t('common.save'));
      setTypeEdit(null);
      await loadTypes();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const id = action.app.id;
      if (action.kind === 'approve') await api.post(`/protocol/admin/courtesy/applications/${id}/approve`, { validDays: Number(validDays) || 14, comment });
      else if (action.kind === 'reject') await api.post(`/protocol/admin/courtesy/applications/${id}/reject`, { reasonCode: reason || 'other', comment });
      else if (action.kind === 'used') await api.post(`/protocol/admin/courtesy/applications/${id}/mark-used`);
      toastSuccess(t('common.save'));
      setAction(null);
      await loadApps();
      await loadRecords();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const typeColumns = [
    { title: t('protocol.field.code'), dataIndex: 'code', width: 150 },
    { title: t('protocol.field.name'), dataIndex: 'name', width: 160 },
    { title: t('protocol.field.description'), dataIndex: 'description' },
    { title: t('common.status'), dataIndex: 'enabled', width: 90, render: (v) => <Tag color={v ? 'app-green' : 'default'} variant="soft">{v ? t('common.enabled') : t('common.disabled')}</Tag> },
    {
      title: t('common.actions'),
      width: 100,
      render: (_, row) => (
        <Button
          type="text"
          size="small"
          onClick={() => {
            setTypeForm({ code: row.code, name: row.nameCn ?? row.name, nameTw: row.nameTw ?? '', description: row.descriptionCn ?? row.description, descriptionTw: row.descriptionTw ?? '', requirements: row.requirementsCn ?? row.requirements, requirementsTw: row.requirementsTw ?? '', enabled: !!row.enabled, sortOrder: row.sort_order });
            setTypeEdit(row);
          }}
        >
          {t('protocol.action.edit')}
        </Button>
      ),
    },
  ];

  const appColumns = [
    { title: t('protocol.field.appNo'), dataIndex: 'appNo', width: 180 },
    { title: t('protocol.field.type'), dataIndex: 'typeName', width: 110 },
    { title: t('protocol.field.account'), dataIndex: 'username', width: 110 },
    { title: t('protocol.field.basis'), width: 180, render: (_, r) => `${t(`protocol.basisType.${r.basisType}`)} · ${r.basisNo}` },
    { title: t('common.status'), dataIndex: 'status', width: 110, render: (v) => <StatusTag status={v} /> },
    { title: t('protocol.field.submittedAt'), dataIndex: 'submittedAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      render: (_, row) => (
        <div className="protocol-row-actions">
          {row.status === 'pending_review' && (
            <>
              <Button type="text" size="small" icon={<CheckCircleIcon />} onClick={() => { setAction({ kind: 'approve', app: row }); setValidDays('14'); setComment(''); }}>
                {t('protocol.admin.approve')}
              </Button>
              <Button type="text" size="small" danger onClick={() => { setAction({ kind: 'reject', app: row }); setReason(''); setComment(''); }}>
                {t('protocol.admin.reject')}
              </Button>
            </>
          )}
          {row.status === 'approved' && (
            <Button type="text" size="small" icon={<StarIcon />} onClick={() => setAction({ kind: 'used', app: row })}>
              {t('protocol.admin.markUsed')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const recordColumns = [
    { title: t('protocol.field.createdAt'), dataIndex: 'created_at', width: 160, render: fmtDateTime },
    { title: t('protocol.field.type'), dataIndex: 'type_name', width: 130 },
    { title: t('protocol.field.account'), dataIndex: 'display_name', width: 130 },
    { title: t('protocol.field.appNo'), dataIndex: 'app_no', width: 180 },
    { title: t('protocol.field.note'), dataIndex: 'note' },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('protocol.admin.courtesyTitle')}</Title>
        <p className="muted-text">{t('protocol.admin.courtesySubtitle')}</p>
      </div>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'applications',
            label: t('protocol.admin.applicationsTab'),
            children: (
              <div>
                <div className="protocol-filter-bar">
                  <Select
                    value={status}
                    onChange={(v) => { setStatus(v); setPage(1); }}
                    options={[{ key: '', label: t('protocol.common.allStatus') }, ...STATUSES.map((s) => ({ key: s, label: t(`protocol.status.${s}`) }))]}
                  />
                  <Input allowClear prefix={<SearchIcon size={14} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('protocol.admin.searchCourtesy')} />
                </div>
                <Card>
                  <Table className="table-fit" columns={appColumns} dataSource={apps ?? []} loading={apps === null} rowKey="id" pagination={false} emptyText={t('protocol.admin.queueEmpty')} />
                  {total > 20 && (
                    <div className="protocol-pagination">
                      <Pagination total={total} current={page} pageSize={20} onChange={setPage} showTotal />
                    </div>
                  )}
                </Card>
              </div>
            ),
          },
          {
            key: 'types',
            label: t('protocol.admin.typesTab'),
            children: (
              <div>
                <div className="protocol-filter-bar">
                  <Button
                    type="primary"
                    icon={<PlusIcon />}
                    onClick={() => {
                      setTypeForm({ code: '', name: '', nameTw: '', description: '', descriptionTw: '', requirements: '', requirementsTw: '', enabled: true, sortOrder: 99 });
                      setTypeEdit('new');
                    }}
                  >
                    {t('protocol.admin.addType')}
                  </Button>
                </div>
                <Card>
                  <Table className="table-fit" columns={typeColumns} dataSource={types} rowKey="id" pagination={false} emptyText={t('protocol.common.noData')} />
                </Card>
              </div>
            ),
          },
          {
            key: 'records',
            label: t('protocol.admin.recordsTab'),
            children: (
              <Card>
                <Table className="table-fit" columns={recordColumns} dataSource={records ?? []} loading={records === null} rowKey="id" pagination={{ pageSize: 20 }} emptyText={t('protocol.common.noData')} />
              </Card>
            ),
          },
        ]}
      />

      <Modal
        open={typeEdit !== null}
        title={typeEdit === 'new' ? t('protocol.admin.addType') : t('protocol.admin.editType')}
        onClose={() => setTypeEdit(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setTypeEdit(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!typeForm.code || !typeForm.name} onClick={saveType}>{t('protocol.action.save')}</Button>
          </>
        }
      >
        <div className="protocol-modal-form">
          <label className="protocol-field">
            <span>{t('protocol.field.code')}</span>
            <Input value={typeForm.code} onChange={(e) => setTypeForm((p) => ({ ...p, code: e.target.value }))} disabled={typeEdit !== 'new'} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.name')}</span>
            <Input value={typeForm.name} onChange={(e) => setTypeForm((p) => ({ ...p, name: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.name')} · {t('common.traditional')}</span>
            <Input value={typeForm.nameTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setTypeForm((p) => ({ ...p, nameTw: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.description')}</span>
            <Input value={typeForm.description} onChange={(e) => setTypeForm((p) => ({ ...p, description: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.description')} · {t('common.traditional')}</span>
            <Input value={typeForm.descriptionTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setTypeForm((p) => ({ ...p, descriptionTw: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.requirements')}</span>
            <TextArea rows={3} value={typeForm.requirements} onChange={(e) => setTypeForm((p) => ({ ...p, requirements: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.requirements')} · {t('common.traditional')}</span>
            <TextArea rows={3} value={typeForm.requirementsTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setTypeForm((p) => ({ ...p, requirementsTw: e.target.value }))} />
          </label>
          <label className="protocol-inline-gap">
            <span>{t('common.enabled')}</span>
            <Switch checked={typeForm.enabled} onChange={(v) => setTypeForm((p) => ({ ...p, enabled: v }))} />
          </label>
        </div>
      </Modal>

      <Modal
        open={action !== null}
        title={action ? t(`protocol.admin.courtesyAction_${action.kind}`) : ''}
        onClose={() => setAction(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setAction(null)}>{t('common.cancel')}</Button>
            <Button type="primary" danger={action?.kind === 'reject'} loading={busy} onClick={runAction}>{t('common.confirm')}</Button>
          </>
        }
      >
        {action?.app && <p className="muted-text">{action.app.appNo} · {action.app.typeName} · {action.app.basisNo}</p>}
        {action?.kind === 'approve' && (
          <label className="protocol-field">
            <span>{t('protocol.admin.validDays')}</span>
            <Input type="number" value={validDays} onChange={(e) => setValidDays(e.target.value)} />
          </label>
        )}
        {action?.kind === 'reject' && (
          <label className="protocol-field">
            <span>{t('protocol.field.rejectReason')}</span>
            <Select value={reason} onChange={setReason} options={REASONS.map((r) => ({ key: r, label: t(`protocol.rejectReason.${r}`) }))} />
          </label>
        )}
        {['approve', 'reject'].includes(action?.kind) && (
          <label className="protocol-field">
            <span>{t('protocol.field.comment')}</span>
            <TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
        )}
      </Modal>
    </div>
  );
}