// 接待方认证管理:队列、材料、通过/驳回/补件、冻结/撤销与权限配置。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Drawer,
  Input,
  Modal,
  Pagination,
  Select,
  Switch,
  Table,
  Tag,
  Title,
} from 'animal-island-ui';
import { BanIcon, CheckCircleIcon, EyeIcon, LockIcon, SearchIcon, SendIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import {
  DescList,
  StatusTag,
  TextArea,
  fmtDateTime,
  openProtocolMaterial,
  toastProtocolError,
} from '../shared.jsx';
import { toastSuccess } from '../shared.jsx';

const HOST_STATUSES = ['pending_review', 'supplement_required', 'certified', 'frozen', 'rejected', 'revoked', 'draft'];
const REASONS = ['info_missing', 'material_invalid', 'qualification', 'duplicate', 'other'];

export default function AdminProtocolHosts() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending_review');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [days, setDays] = useState('7');
  const [canPublish, setCanPublish] = useState(false);
  const [canInvite, setCanInvite] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      const data = await api.get(`/protocol/admin/hosts?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toastProtocolError(t, err);
      setItems([]);
    }
  }, [page, status, q, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (row) => {
    try {
      const data = await api.get(`/protocol/admin/hosts/${row.id}`);
      setDetail(data.host);
      setCanPublish(!!data.host.canPublish);
      setCanInvite(!!data.host.canInvite);
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const refresh = async (id) => {
    const data = await api.get(`/protocol/admin/hosts/${id}`);
    setDetail(data.host);
    setCanPublish(!!data.host.canPublish);
    setCanInvite(!!data.host.canInvite);
    await load();
  };

  const openAction = (kind) => {
    setReason('');
    setComment('');
    setDays('7');
    setAction({ kind });
  };

  const runAction = async () => {
    if (!action || !detail) return;
    setBusy(true);
    try {
      const id = detail.id;
      if (action.kind === 'approve') await api.post(`/protocol/admin/hosts/${id}/approve`, { comment });
      else if (action.kind === 'reject') await api.post(`/protocol/admin/hosts/${id}/reject`, { reasonCode: reason || 'other', comment });
      else if (action.kind === 'supplement') await api.post(`/protocol/admin/hosts/${id}/supplement`, { comment, days: Number(days) || 7 });
      else if (action.kind === 'freeze') await api.post(`/protocol/admin/hosts/${id}/freeze`, { reason });
      else if (action.kind === 'unfreeze') await api.post(`/protocol/admin/hosts/${id}/unfreeze`);
      else if (action.kind === 'revoke') await api.post(`/protocol/admin/hosts/${id}/revoke`, { reason });
      toastSuccess(t('common.save'));
      setAction(null);
      await refresh(id);
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const savePermissions = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await api.patch(`/protocol/admin/hosts/${detail.id}/permissions`, { canPublish, canInvite });
      toastSuccess(t('common.save'));
      await refresh(detail.id);
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { title: t('protocol.field.hostNo'), dataIndex: 'hostNo', width: 180 },
    { title: t('protocol.field.name'), dataIndex: 'name', width: 160 },
    { title: t('protocol.field.hostType'), dataIndex: 'type', width: 120, render: (v) => <Tag variant="outlined" size="small">{t(`protocol.hostType.${v}`)}</Tag> },
    { title: t('protocol.field.contactNickname'), dataIndex: 'contactNickname', width: 110 },
    { title: t('common.status'), dataIndex: 'status', width: 120, render: (v) => <StatusTag status={v} /> },
    { title: t('protocol.field.submittedAt'), dataIndex: 'submittedAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      render: (_, row) => (
        <Button type="text" size="small" icon={<EyeIcon />} onClick={() => openDetail(row)}>
          {t('protocol.action.view')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('protocol.admin.hostsTitle')}</Title>
        <p className="muted-text">{t('protocol.admin.hostsSubtitle')}</p>
      </div>

      <div className="protocol-filter-bar">
        <Select
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[{ key: '', label: t('protocol.common.allStatus') }, ...HOST_STATUSES.map((s) => ({ key: s, label: t(`protocol.status.${s}`) }))]}
        />
        <Input allowClear prefix={<SearchIcon size={14} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('protocol.admin.searchHost')} />
      </div>

      <Card>
        <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} emptyText={t('protocol.admin.queueEmpty')} />
        {total > 20 && (
          <div className="protocol-pagination">
            <Pagination total={total} current={page} pageSize={20} onChange={setPage} showTotal />
          </div>
        )}
      </Card>

      <Drawer
        maskClosable={false}
        open={detail !== null}
        title={detail?.hostNo}
        width={640}
        onClose={() => setDetail(null)}
        footer={
          detail && (
            <div className="protocol-drawer-footer">
              {['pending_review', 'supplement_required'].includes(detail.status) && (
                <>
                  <Button type="primary" icon={<CheckCircleIcon />} onClick={() => openAction('approve')}>{t('protocol.admin.approve')}</Button>
                  <Button icon={<SendIcon />} onClick={() => openAction('supplement')}>{t('protocol.admin.supplement')}</Button>
                  <Button danger icon={<BanIcon />} onClick={() => openAction('reject')}>{t('protocol.admin.reject')}</Button>
                </>
              )}
              {can('evt:manage') && ['certified', 'frozen'].includes(detail.status) && (
                <>
                  {detail.status === 'certified' ? (
                    <Button icon={<LockIcon />} onClick={() => openAction('freeze')}>{t('protocol.admin.freeze')}</Button>
                  ) : (
                    <Button onClick={() => openAction('unfreeze')}>{t('protocol.admin.unfreeze')}</Button>
                  )}
                  <Button danger onClick={() => openAction('revoke')}>{t('protocol.admin.revokeHost')}</Button>
                </>
              )}
            </div>
          )
        }
      >
        {detail && (
          <div className="protocol-detail-body">
            <div className="protocol-detail-status">
              <StatusTag status={detail.status} />
              <Tag color="app-teal" variant="solid">{t(`protocol.hostType.${detail.type}`)}</Tag>
              {detail.certNo && <Tag color="app-green" variant="soft">{detail.certNo}</Tag>}
            </div>
            <DescList
              rows={[
                [t('protocol.field.name'), detail.name],
                [t('protocol.field.contactNickname'), detail.contactNickname],
                [t('protocol.field.contact'), detail.contact],
                [t('protocol.field.intro'), detail.intro || '-'],
                [t('protocol.field.account'), `${detail.user?.displayName || ''} (@${detail.user?.username || ''})`],
                [t('protocol.field.submittedAt'), fmtDateTime(detail.submittedAt)],
                [t('protocol.field.supplementNote'), detail.supplementNote || '-'],
                [t('protocol.field.reviewNote'), detail.reviewNote || '-'],
              ]}
            />
            <h4>{t('protocol.field.materials')}</h4>
            <ul className="protocol-material-list">
              {detail.materials.map((m) => (
                <li key={m.id}>
                  <Tag size="small" variant="soft" color="app-blue">{t(`protocol.materialKind.${m.kind}`, { defaultValue: m.kind })}</Tag>
                  <span className="protocol-material-name">{m.filename}</span>
                  <Button type="text" size="small" icon={<EyeIcon />} onClick={() => openProtocolMaterial(m.id)}>
                    {t('protocol.action.preview')}
                  </Button>
                </li>
              ))}
              {detail.materials.length === 0 && <li className="muted-text">{t('protocol.apply.noMaterials')}</li>}
            </ul>
            {detail.rejectComment && (
              <Card color="app-red">
                <strong>{t('protocol.field.rejectReason')}</strong>
                <p>{detail.rejectComment}</p>
              </Card>
            )}
            {detail.status === 'certified' && can('evt:manage') && (
              <>
                <h4>{t('protocol.admin.hostPermissions')}</h4>
                <div className="protocol-switch-grid">
                  <label>
                    <span>{t('protocol.hosts.canPublish')}</span>
                    <Switch checked={canPublish} onChange={setCanPublish} />
                  </label>
                  <label>
                    <span>{t('protocol.hosts.canInvite')}</span>
                    <Switch checked={canInvite} onChange={setCanInvite} />
                  </label>
                </div>
                <Button type="dashed" size="small" loading={busy} onClick={savePermissions} disabled={busy}>
                  {t('protocol.action.save')}
                </Button>
              </>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={action !== null}
        title={action ? t(`protocol.admin.hostAction_${action.kind}`) : ''}
        onClose={() => {
          if (!busy) setAction(null);
        }}
        maskClosable={false}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setAction(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button
              type="primary"
              danger={['reject', 'revoke'].includes(action?.kind)}
              loading={busy}
              disabled={busy || (['freeze', 'revoke'].includes(action?.kind) && !reason.trim())}
              onClick={runAction}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        {['reject', 'supplement'].includes(action?.kind) && (
          <label className="protocol-field">
            <span>{t('protocol.field.reason')}</span>
            {action.kind === 'reject' ? (
              <Select value={reason} onChange={setReason} options={REASONS.map((r) => ({ key: r, label: t(`protocol.hostReject.${r}`) }))} />
            ) : null}
          </label>
        )}
        {action?.kind === 'supplement' && (
          <label className="protocol-field">
            <span>{t('protocol.admin.supplementDays')}</span>
            <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
        )}
        {['freeze', 'revoke'].includes(action?.kind) && (
          <label className="protocol-field">
            <span>{t('protocol.field.reason')}</span>
            <TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
        {['approve', 'reject', 'supplement'].includes(action?.kind) && (
          <label className="protocol-field">
            <span>{t('protocol.field.comment')}</span>
            <TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
        )}
        <p className="muted-text">{t('protocol.admin.hostActionTip')}</p>
      </Modal>
    </div>
  );
}