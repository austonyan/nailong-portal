// 验真与风控面板:验真记录、限流配置、黑名单、工单与报表导出。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Input,
  Modal,
  Pagination,
  Select,
  Table,
  Tag,
  Title,
} from 'animal-island-ui';
import { BanIcon, DownloadIcon, MailIcon, PlusIcon, SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { TextArea, exportProtocolCsv, fmtDateTime, toastProtocolError } from '../shared.jsx';
import { toastSuccess } from '../shared.jsx';

const RESULTS = ['valid', 'not_found', 'status_used', 'status_expired', 'status_voided', 'status_revoked'];
const KINDS = ['invitation', 'pass', 'host'];

export default function AdminProtocolRisk() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState(null);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const [logQ, setLogQ] = useState('');
  const [logResult, setLogResult] = useState('');
  const [limit, setLimit] = useState('30');
  const [blacklist, setBlacklist] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [blackForm, setBlackForm] = useState({ username: '', reason: '', level: 'warn' });
  const [ticketTarget, setTicketTarget] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(logPage) });
      if (logQ.trim()) params.set('q', logQ.trim());
      if (logResult) params.set('result', logResult);
      const data = await api.get(`/protocol/admin/verify-logs?${params.toString()}`);
      setLogs(data.items);
      setLogTotal(data.total);
    } catch (err) {
      toastProtocolError(t, err);
      setLogs([]);
    }
  }, [logPage, logQ, logResult, t]);

  const loadRest = useCallback(async () => {
    try {
      const [config, bl, tk] = await Promise.all([
        api.get('/protocol/admin/config'),
        api.get('/protocol/admin/blacklist'),
        api.get('/protocol/admin/tickets'),
      ]);
      const row = config.items.find((c) => c.key === 'verify_limit_per_5min');
      if (row) setLimit(row.value);
      setBlacklist(bl.items);
      setTickets(tk.items);
    } catch (err) {
      toastProtocolError(t, err);
    }
  }, [t]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { loadRest(); }, [loadRest]);

  const saveLimit = async () => {
    try {
      await api.patch('/protocol/admin/config', { key: 'verify_limit_per_5min', value: limit });
      toastSuccess(t('common.save'));
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const addBlacklist = async () => {
    setBusy(true);
    try {
      await api.post('/protocol/admin/blacklist', blackForm);
      toastSuccess(t('common.save'));
      setBlacklistOpen(false);
      setBlackForm({ username: '', reason: '', level: 'warn' });
      await loadRest();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const lift = async (row) => {
    try {
      await api.del(`/protocol/admin/blacklist/${row.id}`);
      toastSuccess(t('common.deleted'));
      await loadRest();
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const closeTicket = async () => {
    if (!ticketTarget) return;
    setBusy(true);
    try {
      await api.post(`/protocol/admin/tickets/${ticketTarget.id}/close`, { reply });
      toastSuccess(t('common.save'));
      setTicketTarget(null);
      setReply('');
      await loadRest();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const exportFile = async (kind, name) => {
    try {
      await exportProtocolCsv(`/protocol/admin/export/${kind}`, name);
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const logColumns = [
    { title: t('protocol.field.createdAt'), dataIndex: 'created_at', width: 160, render: fmtDateTime },
    { title: t('protocol.admin.verifyQuery'), dataIndex: 'query', width: 190 },
    { title: t('protocol.field.type'), dataIndex: 'kind', width: 100, render: (v) => (v ? t(`protocol.verifyKind.${v}`, { defaultValue: v }) : '-') },
    {
      title: t('protocol.admin.verifyResult'),
      dataIndex: 'result',
      width: 130,
      render: (v) => (
        <Tag color={v === 'valid' ? 'app-green' : v === 'not_found' ? 'app-red' : 'app-yellow'} variant="soft" size="small">
          {v}
        </Tag>
      ),
    },
    { title: t('protocol.admin.verifyIp'), dataIndex: 'ip', width: 130 },
  ];

  const blacklistColumns = [
    { title: t('protocol.field.account'), width: 150, render: (_, r) => `${r.display_name || ''} (@${r.username})` },
    { title: t('protocol.field.reason'), dataIndex: 'reason' },
    {
      title: t('protocol.field.level'),
      dataIndex: 'level',
      width: 90,
      render: (v) => <Tag color={v === 'block' ? 'app-red' : 'app-yellow'} variant="soft" size="small">{t(`protocol.admin.blacklist_${v}`)}</Tag>,
    },
    { title: t('protocol.field.createdAt'), dataIndex: 'created_at', width: 160, render: fmtDateTime },
    { title: t('common.actions'), width: 90, render: (_, r) => <Button type="text" size="small" onClick={() => lift(r)}>{t('protocol.admin.lift')}</Button> },
  ];

  const ticketColumns = [
    { title: t('protocol.field.subject'), dataIndex: 'subject', width: 190 },
    { title: t('protocol.field.account'), width: 150, render: (_, r) => `${r.display_name || ''} (@${r.username})` },
    { title: t('protocol.field.body'), dataIndex: 'body' },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 90,
      render: (v) => <Tag color={v === 'closed' ? 'app-green' : 'app-yellow'} variant="soft" size="small">{t(`protocol.messages.ticket_${v}`)}</Tag>,
    },
    { title: t('protocol.field.createdAt'), dataIndex: 'created_at', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      width: 90,
      render: (_, r) => (
        <Button type="text" size="small" icon={<MailIcon />} onClick={() => { setTicketTarget(r); setReply(r.reply || ''); }}>
          {t('protocol.admin.reply')}
        </Button>
      ),
    },
  ];

  return (
    <div className="protocol-risk-panel">
      <div className="protocol-section">
        <div className="protocol-inline-between">
          <Title size="small" color="app-blue">{t('protocol.admin.verifyLogs')}</Title>
          <div className="protocol-inline-gap">
            <Input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: 100 }} />
            <Button type="dashed" size="small" onClick={saveLimit}>{t('protocol.admin.saveLimit')}</Button>
          </div>
        </div>
        <div className="protocol-filter-bar">
          <Select
            value={logResult}
            onChange={(v) => { setLogResult(v); setLogPage(1); }}
            options={[{ key: '', label: t('protocol.common.allStatus') }, ...RESULTS.map((r) => ({ key: r, label: r }))]}
          />
          <Input allowClear prefix={<SearchIcon size={14} />} value={logQ} onChange={(e) => setLogQ(e.target.value)} placeholder={t('protocol.admin.searchVerify')} />
        </div>
        <Card>
          <Table className="table-fit" columns={logColumns} dataSource={logs ?? []} loading={logs === null} rowKey="id" pagination={false} emptyText={t('protocol.common.noData')} />
          {logTotal > 20 && (
            <div className="protocol-pagination">
              <Pagination total={logTotal} current={logPage} pageSize={20} onChange={setLogPage} showTotal />
            </div>
          )}
        </Card>
        <p className="muted-text">{t('protocol.admin.verifyKindHint', { kinds: KINDS.map((k) => t(`protocol.verifyKind.${k}`)).join(' / ') })}</p>
      </div>

      <div className="protocol-section">
        <div className="protocol-inline-between">
          <Title size="small" color="app-red">{t('protocol.admin.blacklistTitle')}</Title>
          <Button type="primary" size="small" icon={<PlusIcon />} onClick={() => setBlacklistOpen(true)}>
            {t('protocol.admin.blacklistAdd')}
          </Button>
        </div>
        <Card>
          <Table className="table-fit" columns={blacklistColumns} dataSource={blacklist} rowKey="id" pagination={false} emptyText={t('protocol.common.noData')} />
        </Card>
      </div>

      <div className="protocol-section">
        <Title size="small" color="app-orange">{t('protocol.admin.tickets')}</Title>
        <Card>
          <Table className="table-fit" columns={ticketColumns} dataSource={tickets} rowKey="id" pagination={{ pageSize: 10 }} emptyText={t('protocol.common.noData')} />
        </Card>
      </div>

      <div className="protocol-section">
        <Title size="small" color="purple">{t('protocol.admin.exports')}</Title>
        <Card>
          <div className="protocol-export-grid">
            {[
              ['registrations', 'protocol-registrations.csv', t('protocol.admin.exportRegistrations')],
              ['events', 'protocol-events.csv', t('protocol.admin.exportEvents')],
              ['verify', 'protocol-verify.csv', t('protocol.admin.exportVerify')],
              ['checkins', 'protocol-checkins.csv', t('protocol.admin.exportCheckins')],
              ['audit', 'protocol-audit.csv', t('protocol.admin.exportAudit')],
            ].map(([kind, name, label]) => (
              <Button key={kind} type="dashed" icon={<DownloadIcon />} onClick={() => exportFile(kind, name)}>
                {label}
              </Button>
            ))}
          </div>
        </Card>
      </div>

      <Modal
        maskClosable={false}
        open={blacklistOpen}
        title={t('protocol.admin.blacklistAdd')}
        onClose={() => setBlacklistOpen(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setBlacklistOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!blackForm.username || !blackForm.reason} onClick={addBlacklist}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="protocol-modal-form">
          <label className="protocol-field">
            <span>{t('protocol.field.account')}</span>
            <Input value={blackForm.username} onChange={(e) => setBlackForm((p) => ({ ...p, username: e.target.value }))} placeholder={t('protocol.admin.usernamePlaceholder')} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.reason')}</span>
            <TextArea rows={3} value={blackForm.reason} onChange={(e) => setBlackForm((p) => ({ ...p, reason: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.level')}</span>
            <Select
              value={blackForm.level}
              onChange={(v) => setBlackForm((p) => ({ ...p, level: v }))}
              options={[
                { key: 'warn', label: t('protocol.admin.blacklist_warn') },
                { key: 'block', label: t('protocol.admin.blacklist_block') },
              ]}
            />
          </label>
        </div>
      </Modal>

      <Modal
        maskClosable={false}
        open={ticketTarget !== null}
        title={t('protocol.admin.replyTicket')}
        onClose={() => setTicketTarget(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setTicketTarget(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={closeTicket}>{t('protocol.admin.closeTicket')}</Button>
          </>
        }
      >
        {ticketTarget && (
          <>
            <p><strong>{ticketTarget.subject}</strong></p>
            <p className="muted-text">{ticketTarget.body}</p>
            <label className="protocol-field">
              <span>{t('protocol.field.reply')}</span>
              <TextArea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} />
            </label>
            <p className="muted-text"><BanIcon size={14} /> {t('protocol.admin.closeTicketTip')}</p>
          </>
        )}
      </Modal>
    </div>
  );
}