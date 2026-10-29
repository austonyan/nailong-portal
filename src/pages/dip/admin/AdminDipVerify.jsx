// 验真管理: 验真记录查询 / 限流配置 / 风控与黑名单。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { PlusIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { DipAdminNav, TextArea, fmtDateTime, toastDipError } from '../../../components/dip/shared.jsx';
import { toastSuccess, toastError } from '../../../components/toast.js';
import { useConfirmAction } from '../../../components/ConfirmAction.jsx';

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
      maskClosable={false}
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
  const [query, setQuery] = useState('');
  const [blacklist, setBlacklist] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [limit, setLimit] = useState('');
  const { confirm, dialog } = useConfirmAction();

  const loadLogs = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (kind) params.set('kind', kind);
    if (result) params.set('result', result);
    if (query) params.set('q', query);
    api
      .get(`/dip/admin/verify-logs?${params.toString()}`)
      .then((data) => {
        const rows = data.items ?? [];
        setLogs(rows);
        setLogsTotal(data.total);
        // total 变小时把页码夹回合法范围,避免停在空表。
        if (rows.length === 0 && page > 1) setPage(Math.max(1, page - 1));
      })
      .catch((err) => {
        toastDipError(t, err);
        setLogs([]);
      });
  }, [page, kind, result, query, t]);

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

  const lift = (row) =>
    confirm({
      title: t('dip.blacklist.lift'),
      tip: t('dip.blacklist.liftConfirm', { user: `${row.display_name || row.username} (#${row.user_id})` }),
      confirmText: t('dip.blacklist.lift'),
      action: () => api.post(`/dip/admin/blacklist/${row.id}/lift`),
      success: t('dip.blacklist.lifted'),
      onDone: loadBlacklist,
      onError: (err) => toastDipError(t, err),
    });

  const saveLimit = () => {
    // 1–1000 的整数:空值 / 0 / 1e9 都直接拒绝,不再悄悄写进配置。
    const value = String(limit).trim();
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 1000) {
      toastError(t('protocol.admin.limitRange'));
      return;
    }
    confirm({
      danger: false,
      title: t('dip.verifyAdmin.limitTitle'),
      tip: t('dip.verifyAdmin.limitConfirm', { count: value }),
      confirmText: t('common.save'),
      action: () => api.put('/dip/admin/config/settings', { items: [{ key: 'verify_limit_per_5min', value }] }),
      success: t('dip.verifyAdmin.limitSaved', { count: value }),
      onError: (err) => toastDipError(t, err),
    });
  };

  const logColumns = [
    { title: t('dip.verifyLog.query'), dataIndex: 'query', width: 200 },
    { title: t('dip.verifyLog.kind'), dataIndex: 'kind', width: 100, render: (v) => (v ? t(`dip.verify.kind${v.charAt(0).toUpperCase()}${v.slice(1)}`, { defaultValue: v }) : '-') },
    { title: t('dip.verifyLog.result'), dataIndex: 'result', width: 140, render: (v) => (
      <Tag size="small" color={v === 'valid' ? 'app-green' : v === 'not_found' ? 'brown' : 'app-red'} variant="soft">
        {t(`dip.verifyLog.result_${v}`, { defaultValue: v })}
      </Tag>
    ) },
    { title: 'IP', dataIndex: 'ip', width: 130, render: (v) => v || '-' },
    { title: t('dip.verifyLog.at'), dataIndex: 'created_at', width: 160, render: (v) => fmtDateTime(v) },
  ];

  const blColumns = [
    { title: t('dip.blacklist.user'), width: 140, render: (_, r) => `${r.display_name || r.username} (#${r.user_id})` },
    { title: t('dip.blacklist.level'), dataIndex: 'level', width: 90, render: (v) => (
      <Tag color={v === 'block' ? 'app-red' : 'warm-peach-pink'} variant="soft">{t(`dip.blacklist.${v}`)}</Tag>
    ) },
    { title: t('dip.blacklist.reason'), dataIndex: 'reason' },
    { title: t('dip.blacklist.since'), dataIndex: 'created_at', width: 150, render: (v) => fmtDateTime(v) },
    { title: t('common.actions'), width: 100, render: (_, r) => <Button size="small" onClick={() => lift(r)}>{t('dip.blacklist.lift')}</Button> },
  ];

  return (
    <div className="dip-page">
      <DipAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="purple">{t('dip.verifyAdmin.title')}</Title>
        </h1>
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
              <Select value={result} onChange={(v) => { setResult(v); setPage(1); }} options={[{ key: '', label: t('dip.verifyAdmin.allResults') }, { key: 'valid', label: t('dip.verifyLog.result_valid') }, { key: 'not_found', label: t('dip.verifyLog.result_not_found') }]} />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onClear={() => { setQ(''); setQuery(''); setPage(1); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setQuery(q.trim());
                    setPage(1);
                  }
                }}
                placeholder={t('dip.verifyLog.query')}
                allowClear
                maxLength={40}
              />
              <Button
                onClick={() => {
                  setQuery(q.trim());
                  setPage(1);
                }}
              >
                {t('common.search')}
              </Button>
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
      {dialog}
    </div>
  );
}
