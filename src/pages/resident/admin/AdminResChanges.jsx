// 变更与升级审批:信息变更/类型升级/续期申请的审批队列。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { BanIcon, CheckCircleIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { ResAdminNav } from '../ResidentShell.jsx';
import { CHANGE_TYPES, TextArea, fmtDateTime, toastResError } from '../shared.jsx';
import { toastSuccess } from '../../../components/toast.js';

const CHANGE_STATUS_COLORS = {
  pending_review: 'warm-peach-pink',
  approved: 'app-green',
  rejected: 'app-red',
  cancelled: 'brown',
};

export default function AdminResChanges() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState('pending_review');
  const [action, setAction] = useState(null); // { kind, change }
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('other');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/resident/admin/changes?status=${status}`);
      setItems(data.items);
    } catch (err) {
      toastResError(t, err);
      setItems([]);
    }
  }, [status, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openAction = (kind, change) => {
    setNote('');
    setReason('other');
    setAction({ kind, change });
  };

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === 'approve') {
        await api.post(`/resident/admin/changes/${action.change.id}/approve`, {});
      } else {
        await api.post(`/resident/admin/changes/${action.change.id}/reject`, { reasonCode: reason, note });
      }
      toastSuccess(t('common.save'));
      setAction(null);
      load();
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const summary = (row) => {
    if (row.type === 'info') {
      const p = row.payload || {};
      const parts = [];
      if (p.contact !== undefined) parts.push(`${t('res.form.contact')}: ${p.contact || '-'}`);
      if (p.virtualAddress !== undefined) parts.push(`${t('res.form.virtualAddress')}: ${p.virtualAddress || '-'}`);
      if (p.bio !== undefined) parts.push(`${t('res.form.bio')}: ${p.bio || '-'}`);
      return parts.join(' · ') || '-';
    }
    if (row.type === 'upgrade') {
      return `${t('res.changes.targetType')}: ${row.payload?.targetTypeName || row.payload?.targetTypeCode || '-'}`;
    }
    return t('res.changes.renewalExplainShort');
  };

  const columns = [
    { title: t('res.admin.field.changeNo'), dataIndex: 'no', width: 170 },
    { title: t('res.admin.field.applicant'), dataIndex: 'username', width: 120 },
    {
      title: t('res.admin.field.changeType'),
      dataIndex: 'type',
      width: 100,
      render: (v) => (
        <Tag variant="soft" color="app-teal">
          {t(`res.changeType.${v}`)}
        </Tag>
      ),
    },
    { title: t('res.admin.field.cardNo'), dataIndex: 'cardNo', width: 160 },
    { title: t('res.admin.field.summary'), dataIndex: 'summary', render: (_, row) => summary(row) },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 110,
      render: (v) => (
        <Tag color={CHANGE_STATUS_COLORS[v] || 'brown'} variant="soft">
          {t(`res.changeStatus.${v}`)}
        </Tag>
      ),
    },
    { title: t('res.admin.field.createdAt'), dataIndex: 'createdAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 170,
      render: (_, record) =>
        record.status === 'pending_review' ? (
          <div className="table-actions">
            <Button type="primary" size="small" icon={<CheckCircleIcon />} onClick={() => openAction('approve', record)}>
              {t('res.admin.actions.approve')}
            </Button>
            <Button type="default" size="small" danger icon={<BanIcon />} onClick={() => openAction('reject', record)}>
              {t('res.admin.actions.reject')}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="res-admin-page">
      <ResAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('res.admin.changes.title')}</Title>
        </h1>
        <div className="table-actions res-filter-bar">
          <Select
            value={status}
            onChange={setStatus}
            options={[
              { key: 'pending_review', label: t('res.changeStatus.pending_review') },
              { key: 'approved', label: t('res.changeStatus.approved') },
              { key: 'rejected', label: t('res.changeStatus.rejected') },
              { key: 'cancelled', label: t('res.changeStatus.cancelled') },
              { key: 'all', label: t('res.admin.allStatus') },
            ]}
          />
        </div>
      </div>

      <Card>
        <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      </Card>

      <Modal
        maskClosable={false}
        open={action !== null}
        title={action ? (action.kind === 'approve' ? t('res.admin.actions.approve') : t('res.admin.actions.reject')) : ''}
        onClose={() => setAction(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setAction(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={runAction} disabled={busy}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        {action && (
          <div className="res-action-form">
            <p>
              {action.change.no} · {t(`res.changeType.${action.change.type}`)}
            </p>
            {action.kind === 'approve' ? (
              <p className="muted-text">{t('res.admin.changes.approveTip')}</p>
            ) : (
              <>
                <p>{t('res.admin.rejectReasonLabel')}</p>
                <Select
                  value={reason}
                  onChange={setReason}
                  options={['incomplete', 'false_info', 'duplicate', 'other'].map((code) => ({ key: code, label: t(`res.rejectReason.${code}`) }))}
                />
                <p>{t('res.admin.commentLabel')}</p>
                <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
