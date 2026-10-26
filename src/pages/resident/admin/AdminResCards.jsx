// 居民卡管理:状态管理、冻结/解冻/注销(原因+审计)、补发与到期批量提醒。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { BellIcon, RefreshIcon, SnowflakeIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { ResAdminNav } from '../ResidentShell.jsx';
import { CARD_STATUS_COLORS, TextArea, fmtDate, toastResError } from '../shared.jsx';
import { toastSuccess } from '../../../components/toast.js';

const CARD_STATUS_OPTIONS = ['valid', 'frozen', 'expired', 'voided'];

export default function AdminResCards() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [action, setAction] = useState(null); // { kind, card }
  const [reason, setReason] = useState('');
  const [remindOpen, setRemindOpen] = useState(false);
  const [remindDays, setRemindDays] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      const data = await api.get(`/resident/admin/cards?${params.toString()}`);
      setItems(data.items);
    } catch (err) {
      toastResError(t, err);
      setItems([]);
    }
  }, [status, q, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openAction = (kind, card) => {
    setReason('');
    setAction({ kind, card });
  };

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === 'freeze') await api.post(`/resident/admin/cards/${action.card.cardNo}/freeze`, { reason });
      else if (action.kind === 'unfreeze') await api.post(`/resident/admin/cards/${action.card.cardNo}/unfreeze`, { reason });
      else if (action.kind === 'void') await api.post(`/resident/admin/cards/${action.card.cardNo}/void`, { reason });
      else if (action.kind === 'reissue') await api.post(`/resident/admin/cards/${action.card.cardNo}/reissue`, { comment: reason });
      toastSuccess(t('common.save'));
      setAction(null);
      load();
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const runRemind = async () => {
    setBusy(true);
    try {
      const data = await api.post('/resident/admin/cards/expiry-remind', {
        days: remindDays ? Number(remindDays) : undefined,
      });
      toastSuccess(t('res.admin.cards.remindSent', { count: data.count }));
      setRemindOpen(false);
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const NEED_REASON = ['freeze', 'void'];

  const ACTION_TITLE = {
    freeze: t('res.admin.cards.freeze'),
    unfreeze: t('res.admin.cards.unfreeze'),
    void: t('res.admin.cards.void'),
    reissue: t('res.admin.cards.reissue'),
  };

  const columns = [
    { title: t('res.field.cardNo'), dataIndex: 'cardNo', width: 180 },
    { title: t('res.field.applicant'), dataIndex: 'username', width: 120 },
    { title: t('res.card.type'), dataIndex: 'typeName', width: 110 },
    { title: t('res.form.nickname'), dataIndex: 'nickname', width: 120 },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 110,
      render: (v) => (
        <Tag color={CARD_STATUS_COLORS[v] || 'default'} variant="soft">
          {t(`res.cardStatus.${v}`)}
        </Tag>
      ),
    },
    { title: t('res.card.validUntil'), dataIndex: 'validUntil', width: 120, render: fmtDate },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      render: (_, record) => (
        <div className="table-actions">
          {record.status === 'valid' && (
            <Button type="default" size="small" icon={<SnowflakeIcon />} onClick={() => openAction('freeze', record)}>
              {t('res.admin.cards.freeze')}
            </Button>
          )}
          {record.status === 'frozen' && (
            <Button type="default" size="small" onClick={() => openAction('unfreeze', record)}>
              {t('res.admin.cards.unfreeze')}
            </Button>
          )}
          {['valid', 'frozen'].includes(record.status) && (
            <Button type="default" size="small" icon={<RefreshIcon />} onClick={() => openAction('reissue', record)}>
              {t('res.admin.cards.reissue')}
            </Button>
          )}
          {record.status !== 'voided' && (
            <Button type="default" size="small" danger onClick={() => openAction('void', record)}>
              {t('res.admin.cards.void')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="res-admin-page">
      <ResAdminNav />
      <div className="page-header">
        <Title size="middle">{t('res.admin.cards.title')}</Title>
        <div className="table-actions res-filter-bar">
          <Select
            value={status}
            onChange={setStatus}
            options={[{ key: '', label: t('res.admin.allStatus') }, ...CARD_STATUS_OPTIONS.map((s) => ({ key: s, label: t(`res.cardStatus.${s}`) }))]}
          />
          <Input size="middle" allowClear placeholder={t('res.admin.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="primary" icon={<BellIcon />} onClick={() => setRemindOpen(true)}>
            {t('res.admin.cards.batchRemind')}
          </Button>
        </div>
      </div>

      <Card>
        <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      </Card>

      <Modal
        open={action !== null}
        title={action ? ACTION_TITLE[action.kind] : ''}
        onClose={() => setAction(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setAction(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={NEED_REASON.includes(action?.kind) && !reason.trim()} onClick={runAction}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        {action && (
          <div className="res-action-form">
            <p>
              {action.card.cardNo} · @{action.card.username}
            </p>
            {action.kind === 'void' && <p className="res-action-warning">{t('res.admin.cards.voidWarning')}</p>}
            <p>
              {NEED_REASON.includes(action.kind) ? t('res.admin.cards.reasonRequired') : t('res.admin.commentLabel')}
            </p>
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        )}
      </Modal>

      <Modal
        open={remindOpen}
        title={t('res.admin.cards.batchRemind')}
        onClose={() => setRemindOpen(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setRemindOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={runRemind} disabled={busy}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p>{t('res.admin.cards.remindTip')}</p>
        <Input size="large" value={remindDays} onChange={(e) => setRemindDays(e.target.value)} placeholder="30" />
      </Modal>
    </div>
  );
}
