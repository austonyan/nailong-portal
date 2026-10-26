// 验真管理: 验真记录查询 / 限流配置 / 风控与黑名单。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { PlusIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { DipAdminNav, TextArea, fmtDateTime, toastDipError } from '../../../components/dip/shared.jsx';
import { toastSuccess } from '../../../components/toast.js';

function BlacklistModal({ onClose, onSaved }) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState('');
  const [level, setLevel] = useState('warn');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/dip/admin/blacklist', { userId: Number(userId), level, reason: reason.trim() });
      toastSuccess(t('common.save'));
      onSaved();
      onClose();
    } catch (err) {
      toastDipError(t, err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={t('dip.blacklist.add')}
      onClose={onClose}
      typewriter={false}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" loading={busy} disabled={!userId || reason.trim().length < 2} onClick={save}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="dip-form-row">
        <Input value={userId} onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))} placeholder={t('dip.blacklist.userId')} />
        <Select value={level} onChange={setLevel} options={[{ key: 'warn', label: t('dip.blacklist.warn') }, { key: 'block', label: t('dip.blacklist.block') }]} />
      </div>
      <TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('dip.blacklist.reason')} maxLength={200} />
    </Modal>
  );
}

export default function AdminDipVerify() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('logs'); // logs | risk
  const [logs, setLogs] = useState(null);
  const [logsTotal, setLogsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState('');
  const [result, setResult] = useState('');
  const [q, setQ] = useState('');
  const [blacklist, setBlacklist] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [limit, setLimit] = useState('');

  const loadLogs = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (kind) params.set('kind', kind);
    if (result) params.set('result', result);
    if (q.trim()) params.set('q', q.trim());
    api
      .get(`/dip/admin/verify-logs?${params.toString()}`)
      .then((data) => {
        setLogs(data.items);
        setLogsTotal(data.total);
      })
      .catch((err) => {
        toastDipError(t, err);
        setLogs([]);
      });
  }, [page, kind, result, q, t]);

  const loadBlacklist = useCallback(() => {
    api
      .get('/dip/admin/blacklist')
      .then((data) => setBlacklist(data.items))
      .catch((err) => {
        toastDipError(t, err);
        setBlacklist([]);
      });
  }, [t]);

  useEffect(() => {
    if (tab === 'logs') loadLogs();
    else loadBlacklist();
  }, [tab, loadLogs, loadBlacklist]);

  const lift = async (row) => {
    try {
      await api.post(`/dip/admin/blacklist/${row.id}/lift`);
      loadBlacklist();
    } catch (err) {
      toastDipError(t, err);
    }
  };

  const saveLimit = async () => {
    try {
      await api.put('/dip/admin/config/settings', { items: [{ key: 'verify_limit_per_5min', value: limit }] });
      toastSuccess(t('common.save'));
    } catch (err) {
      toastDipError(t, err);
    }
  };

  const logColumns = [
    { title: t('dip.verifyLog.query'), dataIndex: 'query', width: 200 },
    { title: t('dip.verifyLog.kind'), dataIndex: 'kind', width: 100, render: (v) => (v ? t(`dip.verify.kind${v.charAt(0).toUpperCase()}${v.slice(1)}`) : '-') },
    { title: t('dip.verifyLog.result'), dataIndex: 'result', width: 120, render: (v) => (
      <Tag size="small" color={v === 'valid' ? 'app-green' : v === 'not_found' ? 'default' : 'app-orange'} variant="soft">{v}</Tag>
    ) },
    { title: 'IP', dataIndex: 'ip', width: 130, render: (v) => v || '-' },
    { title: t('dip.verifyLog.at'), dataIndex: 'created_at', width: 160, render: (v) => fmtDateTime(v) },
  ];

  const blColumns = [
    { title: t('dip.blacklist.user'), width: 140, render: (_, r) => `${r.display_name || r.username} (#${r.user_id})` },
    { title: t('dip.blacklist.level'), dataIndex: 'level', width: 90, render: (v) => (
      <Tag color={v === 'block' ? 'app-red' : 'app-yellow'} variant="soft">{t(`dip.blacklist.${v}`)}</Tag>
    ) },
    { title: t('dip.blacklist.reason'), dataIndex: 'reason' },
    { title: t('dip.blacklist.since'), dataIndex: 'created_at', width: 150, render: (v) => fmtDateTime(v) },
    { title: t('common.actions'), width: 100, render: (_, r) => <Button size="small" onClick={() => lift(r)}>{t('dip.blacklist.lift')}</Button> },
  ];

  return (
    <div className="dip-page">
      <DipAdminNav />
      <div className="page-header">
        <Title size="middle" color="purple">{t('dip.verifyAdmin.title')}</Title>
        <div className="dip-msg-filter">
          <Button type={tab === 'logs' ? 'primary' : 'default'} size="small" onClick={() => setTab('logs')}>{t('dip.verifyAdmin.tabLogs')}</Button>
          <Button type={tab === 'risk' ? 'primary' : 'default'} size="small" onClick={() => setTab('risk')}>{t('dip.verifyAdmin.tabRisk')}</Button>
        </div>
      </div>

      {tab === 'logs' && (
        <>
          <Card>
            <div className="dip-admin-filter">
              <Select value={kind} onChange={(v) => { setKind(v); setPage(1); }} options={[{ key: '', label: t('dip.verifyAdmin.allKinds') }, { key: 'relation', label: t('dip.verify.kindRelation') }, { key: 'identity', label: t('dip.verify.kindIdentity') }, { key: 'agreement', label: t('dip.verify.kindAgreement') }]} />
              <Select value={result} onChange={(v) => { setResult(v); setPage(1); }} options={[{ key: '', label: t('dip.verifyAdmin.allResults') }, { key: 'valid', label: 'valid' }, { key: 'not_found', label: 'not_found' }]} />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('dip.verifyLog.query')} allowClear maxLength={40} />
              <Button onClick={loadLogs}>{t('common.search')}</Button>
            </div>
            <Table className="table-fit"
              columns={logColumns}
              dataSource={logs ?? []}
              loading={logs === null}
              rowKey="id"
              pagination={{ current: page, defaultPageSize: 20, total: logsTotal, showTotal: true, onChange: setPage }}
            />
          </Card>
          <Card>
            <b>{t('dip.verifyAdmin.limitTitle')}</b>
            <p className="muted-text">{t('dip.verifyAdmin.limitTip')}</p>
            <div className="dip-admin-filter">
              <Input value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))} placeholder="30" style={{ maxWidth: 140 }} />
              <Button type="primary" onClick={saveLimit}>{t('common.save')}</Button>
            </div>
          </Card>
        </>
      )}

      {tab === 'risk' && (
        <Card>
          <div className="page-header">
            <Title size="small">{t('dip.verifyAdmin.tabRisk')}</Title>
            <Button type="primary" size="small" icon={<PlusIcon />} onClick={() => setAddOpen(true)}>{t('dip.blacklist.add')}</Button>
          </div>
          <Table className="table-fit" columns={blColumns} dataSource={blacklist ?? []} loading={blacklist === null} rowKey="id" pagination={false} />
        </Card>
      )}

      {addOpen && <BlacklistModal onClose={() => setAddOpen(false)} onSaved={loadBlacklist} />}
    </div>
  );
}
