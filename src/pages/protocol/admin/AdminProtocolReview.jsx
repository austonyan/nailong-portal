// 报名审核工作台:待审队列、详情、身份校验结果、通过/候补/拒绝与导出。
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
  Table,
  Tag,
  Title,
} from 'animal-island-ui';
import { CheckCircleIcon, DownloadIcon, EyeIcon, SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import {
  DescList,
  StatusTag,
  TextArea,
  exportProtocolCsv,
  fmtDateTime,
  openProtocolMaterial,
  toastProtocolError,
} from '../shared.jsx';
import { toastSuccess } from '../shared.jsx';
import { useDebouncedValue } from '../../../lib/useDebouncedValue.js';

const STATUS_OPTIONS = ['pending_review', 'waitlisted', 'approved', 'rejected', 'checked_in', 'finished', 'cancelled', 'draft'];
const REASONS = ['info_missing', 'identity_mismatch', 'duplicate', 'full', 'rule_violation', 'other'];
const IDENTITY_OPTIONS = ['ordinary', 'resident', 'diplomatic', 'foreign'];

export default function AdminProtocolReview() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending_review');
  const [identity, setIdentity] = useState('');
  const [q, setQ] = useState('');
  // 检索词 300ms 防抖:逐键输入不再每字打一次接口。
  const dq = useDebouncedValue(q, 300);
  const [detail, setDetail] = useState(null);
  const [action, setAction] = useState(null);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set('status', status);
      if (identity) params.set('identityType', identity);
      if (dq.trim()) params.set('q', dq.trim());
      const data = await api.get(`/protocol/admin/registrations?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toastProtocolError(t, err);
      setItems([]);
    }
  }, [page, status, identity, dq, t]);

  useEffect(() => {
    load();
  }, [load]);

  // 检索词变化时回到第一页,避免停在越界页看到空表。
  useEffect(() => {
    setPage(1);
  }, [dq]);

  const openDetail = async (row) => {
    try {
      const data = await api.get(`/protocol/admin/registrations/${row.id}`);
      setDetail(data.registration);
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const openAction = (kind, reg = detail) => {
    setComment('');
    setReason('');
    setAction({ kind, reg });
  };

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const id = action.reg.id;
      const endpoint = {
        approve: 'approve',
        waitlist: 'waitlist',
        reject: 'reject',
        promote: 'promote',
      }[action.kind];
      const body = { comment };
      if (action.kind === 'reject') body.reasonCode = reason || 'other';
      const data = await api.post(`/protocol/admin/registrations/${id}/${endpoint}`, body);
      if (data.waitlisted) toastSuccess(t('protocol.admin.becameWaitlist'));
      else toastSuccess(t('common.save'));
      setAction(null);
      const refreshed = await api.get(`/protocol/admin/registrations/${id}`);
      setDetail(refreshed.registration);
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    try {
      await exportProtocolCsv('/protocol/admin/export/registrations', 'protocol-registrations.csv');
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const columns = [
    { title: t('protocol.field.regNo'), dataIndex: 'regNo', width: 180 },
    { title: t('protocol.field.event'), dataIndex: 'eventTitle', width: 200 },
    { title: t('protocol.field.account'), dataIndex: 'username', width: 120 },
    { title: t('protocol.field.nickname'), dataIndex: 'nickname', width: 110 },
    {
      title: t('protocol.field.identityType'),
      dataIndex: 'identityType',
      width: 110,
      render: (v) => <Tag variant="outlined" size="small">{t(`protocol.identity.${v}`)}</Tag>,
    },
    { title: t('common.status'), dataIndex: 'status', width: 110, render: (v) => <StatusTag status={v} /> },
    { title: t('protocol.field.submittedAt'), dataIndex: 'submittedAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      render: (_, row) => (
        <div className="protocol-row-actions">
          <Button type="text" size="small" icon={<EyeIcon />} onClick={() => openDetail(row)}>
            {t('protocol.action.view')}
          </Button>
          {['pending_review', 'waitlisted'].includes(row.status) && (
            <Button type="text" size="small" icon={<CheckCircleIcon />} onClick={() => openAction('approve', row)}>
              {t('protocol.admin.approve')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('protocol.admin.reviewTitle')}</Title>
        <p className="muted-text">{t('protocol.admin.reviewSubtitle')}</p>
      </div>

      <div className="protocol-filter-bar">
        <Select
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[{ key: '', label: t('protocol.common.allStatus') }, ...STATUS_OPTIONS.map((s) => ({ key: s, label: t(`protocol.status.${s}`) }))]}
        />
        <Select
          value={identity}
          onChange={(v) => { setIdentity(v); setPage(1); }}
          options={[{ key: '', label: t('protocol.common.allIdentities') }, ...IDENTITY_OPTIONS.map((s) => ({ key: s, label: t(`protocol.identity.${s}`) }))]}
        />
        <Input
          allowClear
          prefix={<SearchIcon size={14} />}
          placeholder={t('protocol.admin.searchReg')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {can('evt:manage') && (
          <Button type="default" icon={<DownloadIcon />} onClick={exportCsv}>
            {t('protocol.action.export')}
          </Button>
        )}
      </div>

      <Card>
        <Table className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('protocol.admin.queueEmpty')}
        />
        {total > 20 && (
          <div className="protocol-pagination">
            <Pagination total={total} current={page} pageSize={20} onChange={setPage} showTotal />
          </div>
        )}
      </Card>

      <Drawer
        maskClosable={false}
        open={detail !== null}
        title={detail?.regNo}
        width={640}
        onClose={() => setDetail(null)}
        footer={
          detail && (
            <div className="protocol-drawer-footer">
              {['pending_review', 'waitlisted'].includes(detail.status) && (
                <>
                  <Button type="primary" icon={<CheckCircleIcon />} onClick={() => openAction('approve')}>
                    {t('protocol.admin.approve')}
                  </Button>
                  {detail.status === 'pending_review' && (
                    <Button onClick={() => openAction('waitlist')}>{t('protocol.admin.waitlist')}</Button>
                  )}
                  <Button danger onClick={() => openAction('reject')}>{t('protocol.admin.reject')}</Button>
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
              <span className="muted-text">
                {detail.user?.displayName} (@{detail.user?.username})
              </span>
            </div>
            <h4>{t('protocol.field.event')}</h4>
            <Card>
              <strong>{detail.event.title}</strong>
              <p className="muted-text">{fmtDateTime(detail.event.startsAt)} · {detail.event.venueName}</p>
            </Card>
            <h4>{t('protocol.admin.formAndIdentity')}</h4>
            <DescList
              rows={[
                [t('protocol.field.nickname'), detail.nickname],
                [t('protocol.field.contact'), detail.contact],
                [t('protocol.field.identityType'), t(`protocol.identity.${detail.identityType}`)],
                [t('protocol.field.identityNo'), detail.identityNo || '-'],
                [t('protocol.field.identityCheck'), t(`protocol.identityCheck.${detail.identityCheck}`, { defaultValue: t('common.unknown') })],
                [t('protocol.field.partySize'), detail.partySize],
                [t('protocol.field.companions'), detail.companions.map((c) => c.nickname).join('、') || '-'],
                [t('protocol.field.invitationNo'), detail.invitationNo || '-'],
                [t('protocol.field.note'), detail.note || '-'],
                [t('protocol.field.submittedAt'), fmtDateTime(detail.submittedAt)],
              ]}
            />
            <h4>{t('protocol.field.materials')}</h4>
            <ul className="protocol-material-list">
              {detail.materials.map((m) => (
                <li key={m.id}>
                  <Tag size="small" variant="soft" color="app-blue">{t(`protocol.materialKind.${m.kind}`, { defaultValue: t('common.unknown') })}</Tag>
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
            {detail.pass && (
              <p className="protocol-status-note">{t('protocol.admin.passIssued', { no: detail.pass.passNo, status: t(`protocol.status.${detail.pass.status}`) })}</p>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={action !== null}
        title={action ? t(`protocol.admin.action_${action.kind}`) : ''}
        onClose={() => {
          if (!busy) setAction(null);
        }}
        maskClosable={false}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setAction(null)} disabled={busy}>{t('protocol.action.back')}</Button>
            <Button type="primary" danger={action?.kind === 'reject'} loading={busy} disabled={busy || (action?.kind === 'reject' && !reason)} onClick={runAction}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        {action?.kind === 'reject' && (
          <label className="protocol-field">
            <span>{t('protocol.field.rejectReason')}</span>
            <Select value={reason} onChange={setReason} options={REASONS.map((r) => ({ key: r, label: t(`protocol.admin.rejectReason.${r}`) }))} />
          </label>
        )}
        <label className="protocol-field">
          <span>{t('protocol.field.comment')}</span>
          <TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        {action?.kind === 'approve' && <p className="muted-text">{t('protocol.admin.approveTip')}</p>}
      </Modal>
    </div>
  );
}