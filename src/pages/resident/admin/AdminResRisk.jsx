// 风控与黑名单:重复登记识别、验真限流概况与黑名单管理。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Table, Tag, Title } from 'animal-island-ui';
import { BanIcon, PlusIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { ResAdminNav } from '../ResidentShell.jsx';
import { TextArea, fmtDateTime, toastResError } from '../shared.jsx';
import { useConfirmAction } from '../../../components/ConfirmAction.jsx';
import { toastSuccess } from '../../../components/toast.js';

export default function AdminResRisk() {
  const { t } = useTranslation();
  const [risk, setRisk] = useState(null);
  const [blacklist, setBlacklist] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirmAction();

  const load = useCallback(async () => {
    try {
      const data = await api.get('/resident/admin/risk');
      setRisk(data);
    } catch (err) {
      toastResError(t, err);
      setRisk({ duplicates: [], rateLimitedVerify: 0, blacklisted: 0 });
    }
    try {
      const data = await api.get('/resident/admin/blacklist');
      setBlacklist(data.items);
    } catch (err) {
      toastResError(t, err);
      setBlacklist([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const addBlacklist = async () => {
    setBusy(true);
    try {
      await api.post('/resident/admin/blacklist', { userId: Number(userId), reason });
      toastSuccess(t('common.save'));
      setAddOpen(false);
      setUserId('');
      setReason('');
      load();
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const askRemove = (row) => confirm({
    title: t('res.admin.risk.removeTitle'),
    tip: t('res.admin.risk.removeConfirm', { username: row.username, userId: row.userId }),
    confirmText: t('res.admin.risk.remove'),
    action: () => api.del(`/resident/admin/blacklist/${row.userId}`),
    success: t('common.deleted'),
    onDone: load,
    onError: (err) => toastResError(t, err),
  });

  const dupColumns = [
    { title: 'User ID', dataIndex: 'user_id', width: 90 },
    { title: t('res.field.applicant'), dataIndex: 'username', width: 140 },
    {
      title: t('res.admin.risk.applications'),
      dataIndex: 'applications',
      width: 120,
      render: (v) => (
        <Tag color={v >= 3 ? 'app-red' : 'app-yellow'} variant="soft">
          {v}
        </Tag>
      ),
    },
  ];

  const blacklistColumns = [
    { title: 'User ID', dataIndex: 'userId', width: 90 },
    { title: t('res.field.applicant'), dataIndex: 'username', width: 140 },
    { title: t('res.admin.risk.reason'), dataIndex: 'reason' },
    { title: t('res.field.createdAt'), dataIndex: 'createdAt', width: 160, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 100,
      render: (_, record) => (
        <Button type="text" size="small" danger icon={<BanIcon />} onClick={() => askRemove(record)}>
          {t('res.admin.risk.remove')}
        </Button>
      ),
    },
  ];

  return (
    <div className="res-admin-page">
      <ResAdminNav />
      <div className="page-header">
        <Title size="middle">{t('res.admin.risk.title')}</Title>
        <Button type="primary" icon={<PlusIcon />} onClick={() => { setUserId(''); setReason(''); setAddOpen(true); }}>
          {t('res.admin.risk.add')}
        </Button>
      </div>

      <div className="portal-stats">
        <Card className="stat-card">
          <span className="stat-label">{t('res.admin.risk.duplicates')}</span>
          <span className="stat-number">{risk?.duplicates?.length ?? '…'}</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('res.admin.risk.rateLimited')}</span>
          <span className="stat-number">{risk?.rateLimitedVerify ?? '…'}</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('res.admin.risk.blacklisted')}</span>
          <span className="stat-number">{risk?.blacklisted ?? '…'}</span>
        </Card>
      </div>

      <Card>
        <h4>{t('res.admin.risk.duplicateTitle')}</h4>
        <p className="muted-text">{t('res.admin.risk.duplicateTip')}</p>
        <Table className="table-fit" columns={dupColumns} dataSource={risk?.duplicates ?? []} loading={risk === null} rowKey="user_id" pagination={false} emptyText={t('common.empty')} />
      </Card>

      <Card>
        <h4>{t('res.admin.risk.blacklistTitle')}</h4>
        <Table className="table-fit" columns={blacklistColumns} dataSource={blacklist ?? []} loading={blacklist === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      </Card>

      <Modal
        open={addOpen}
        title={t('res.admin.risk.add')}
        onClose={() => {
          if (!busy) {
            setAddOpen(false);
            setUserId('');
            setReason('');
          }
        }}
        maskClosable={false}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => { setAddOpen(false); setUserId(''); setReason(''); }} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={busy || !Number(userId)} onClick={addBlacklist}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="res-type-form">
          <label>
            <span>User ID *</span>
            <Input size="large" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="123" />
          </label>
          <label>
            <span>{t('res.admin.risk.reason')}</span>
            <TextArea rows={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
      </Modal>
      {dialog}
    </div>
  );
}
