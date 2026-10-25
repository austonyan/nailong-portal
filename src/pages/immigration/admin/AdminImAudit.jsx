import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Input, Modal, Notification, Select, Table, Tabs, Tag, Title,
} from 'animal-island-ui';
import { DownloadIcon, PlusIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastApiError } from '../../../components/immigration/apiError.js';
import { ImAdminNav, exportCsv } from '../../../components/immigration/shared.jsx';

function AuditTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const pageSize = 10;

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (actionFilter) params.set('action', actionFilter);
    api
      .get(`/immigration/admin/audit?${params}`)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        toastApiError(err);
        setItems([]);
      });
  }, [page, actionFilter]);

  useEffect(load, [load]);

  const exportAll = () => {
    exportCsv(
      'im-audit-logs.csv',
      [
        { key: 'id', label: 'ID' },
        { key: 'actor', label: t('imm.verify.officer') },
        { key: 'action', label: t('imm.audit.action') },
        { key: 'target_type', label: t('imm.audit.targetType') },
        { key: 'target_id', label: t('imm.audit.targetId') },
        { key: 'detail', label: t('imm.audit.detail') },
        { key: 'created_at', label: t('common.createdAt') },
      ],
      items ?? []
    );
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: t('imm.verify.officer'), dataIndex: 'actor', width: 110, render: (v) => v ?? 'system' },
    { title: t('imm.audit.action'), dataIndex: 'action', width: 220, render: (v) => <Tag size="small" color="app-blue" variant="soft">{v}</Tag> },
    { title: t('imm.audit.targetType'), dataIndex: 'target_type', width: 110 },
    { title: t('imm.audit.targetId'), dataIndex: 'target_id', width: 170 },
    { title: t('imm.audit.detail'), dataIndex: 'detail', render: (v) => <span className="im-audit-detail">{JSON.stringify(v)}</span> },
    { title: t('common.createdAt'), dataIndex: 'created_at', width: 160, render: (v) => v?.slice(0, 19).replace('T', ' ') },
  ];

  return (
    <>
      <div className="im-review-toolbar">
        <Select
          value={actionFilter}
          onChange={(v) => { setActionFilter(v); setPage(1); }}
          options={[
            { key: '', label: t('imm.audit.allActions') },
            ...['im:port', 'im:declaration', 'im:pass', 'im:record', 'im:visa', 'im:blacklist', 'im:template', 'im:settings', 'im:file', 'im:data'].map((a) => ({ key: a, label: a })),
          ]}
        />
        <Button type="text" size="small" icon={<DownloadIcon />} onClick={exportAll} disabled={!items?.length}>
          {t('imm.records.export')}
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={items ?? []}
        loading={items === null}
        rowKey="id"
        pagination={{ current: page, pageSize, total, onChange: (p) => setPage(p), showTotal: true }}
      />
    </>
  );
}

function BlacklistTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [adding, setAdding] = useState(false);
  const [userId, setUserId] = useState('');
  const [level, setLevel] = useState('warn');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get('/immigration/admin/blacklist')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastApiError(err);
        setItems([]);
      });
  }, []);

  useEffect(load, [load]);

  const add = async () => {
    setBusy(true);
    try {
      await api.post('/immigration/admin/blacklist', { userId: Number(userId), level, reason });
      Notification.success(t('common.save'));
      setAdding(false);
      setUserId('');
      setReason('');
      load();
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const lift = async (row) => {
    try {
      await api.post(`/immigration/admin/blacklist/${row.id}/lift`);
      load();
    } catch (err) {
      toastApiError(err);
    }
  };

  const columns = [
    { title: t('admin.users.username'), dataIndex: 'username', width: 130 },
    { title: t('admin.users.displayName'), dataIndex: 'display_name', width: 120 },
    { title: t('imm.blacklist.level'), dataIndex: 'level', width: 90, render: (v) => <Tag color={v === 'block' ? 'app-red' : 'app-yellow'} variant="soft">{t(`imm.blacklist.${v}`)}</Tag> },
    { title: t('imm.blacklist.reason'), dataIndex: 'reason' },
    { title: t('common.createdAt'), dataIndex: 'created_at', width: 150, render: (v) => v?.slice(0, 10) },
    {
      title: t('common.actions'),
      width: 100,
      render: (_, record) => (
        <Button type="default" size="small" onClick={() => lift(record)}>{t('imm.blacklist.lift')}</Button>
      ),
    },
  ];

  return (
    <>
      <div className="im-tab-toolbar">
        <Button type="primary" icon={<PlusIcon />} onClick={() => setAdding(true)}>
          {t('imm.blacklist.add')}
        </Button>
      </div>
      <Table columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} />
      <Modal
        open={adding}
        title={t('imm.blacklist.add')}
        onClose={() => setAdding(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={add} disabled={!userId || !reason.trim()}>{t('common.confirm')}</Button>
          </>
        }
      >
        <p className="im-field-label">User ID</p>
        <Input size="large" type="number" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="3" />
        <p className="im-field-label">{t('imm.blacklist.level')}</p>
        <Select value={level} onChange={setLevel} options={[{ key: 'warn', label: t('imm.blacklist.warn') }, { key: 'block', label: t('imm.blacklist.block') }]} />
        <p className="im-field-label">{t('imm.blacklist.reason')}</p>
        <Input size="large" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
      </Modal>
    </>
  );
}

function TemplatesTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [enabled, setEnabled] = useState(true);

  const load = useCallback(() => {
    api
      .get('/immigration/admin/templates')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastApiError(err);
        setItems([]);
      });
  }, []);

  useEffect(load, [load]);

  const save = async () => {
    try {
      await api.put(`/immigration/admin/templates/${editing.id}`, { title, body, enabled });
      Notification.success(t('common.save'));
      setEditing(null);
      load();
    } catch (err) {
      toastApiError(err);
    }
  };

  const columns = [
    { title: t('common.key'), dataIndex: 'code', width: 170 },
    { title: t('imm.templates.title'), dataIndex: 'title', width: 240 },
    { title: t('imm.templates.variables'), dataIndex: 'variables', width: 140, render: (v) => v || '-' },
    { title: t('common.status'), dataIndex: 'enabled', width: 90, render: (v) => (v ? <Tag color="app-green" variant="soft">{t('common.enabled')}</Tag> : <Tag>{t('common.disabled')}</Tag>) },
    { title: t('imm.templates.updatedAt'), dataIndex: 'updatedAt', width: 140, render: (v) => v?.slice(0, 10) },
    {
      title: t('common.actions'),
      width: 90,
      render: (_, record) => (
        <Button
          type="default"
          size="small"
          onClick={() => {
            setEditing(record);
            setTitle(record.title);
            setBody(record.body);
            setEnabled(record.enabled);
          }}
        >
          {t('common.edit')}
        </Button>
      ),
    },
  ];

  return (
    <>
      <Table columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} />
      <Modal
        open={editing !== null}
        title={t('imm.templates.editTitle', { code: editing?.code })}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={save}>{t('common.save')}</Button>
          </>
        }
        width={560}
        typewriter={false}
      >
        <p className="muted-text">{t('imm.templates.varTip')}</p>
        <p className="im-field-label">{t('imm.templates.title')}</p>
        <Input size="large" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        <p className="im-field-label">{t('imm.templates.body')}</p>
        <textarea className="docs-textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} />
        <p className="im-field-label">{t('common.status')}</p>
        <Select value={enabled ? 'on' : 'off'} onChange={(v) => setEnabled(v === 'on')} options={[{ key: 'on', label: t('common.enabled') }, { key: 'off', label: t('common.disabled') }]} />
      </Modal>
    </>
  );
}

function SendLogTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    api
      .get(`/immigration/admin/messages?page=${page}&pageSize=${pageSize}`)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        toastApiError(err);
        setItems([]);
      });
  }, [page]);

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: t('admin.users.username'), dataIndex: 'username', width: 120 },
    { title: t('imm.templates.code'), dataIndex: 'template_code', width: 170 },
    { title: t('imm.templates.title'), dataIndex: 'title' },
    { title: t('common.status'), dataIndex: 'read', width: 90, render: (v) => (v ? t('imm.msg.read') : t('imm.msg.unread')) },
    { title: t('common.createdAt'), dataIndex: 'created_at', width: 160, render: (v) => v?.slice(0, 16).replace('T', ' ') },
  ];

  return (
    <Table
      columns={columns}
      dataSource={items ?? []}
      loading={items === null}
      rowKey="id"
      pagination={{ current: page, pageSize, total, onChange: (p) => setPage(p), showTotal: true }}
    />
  );
}

export default function AdminImAudit() {
  const { t } = useTranslation();
  return (
    <div className="im-page">
      <ImAdminNav />
      <div className="page-header">
        <Title size="middle" color="app-teal">
          {t('imm.audit.title')}
        </Title>
      </div>
      <Card>
        <Tabs
          items={[
            { key: 'audit', label: t('imm.audit.tabLog'), children: <AuditTab /> },
            { key: 'blacklist', label: t('imm.audit.tabBlacklist'), children: <BlacklistTab /> },
            { key: 'templates', label: t('imm.audit.tabTemplates'), children: <TemplatesTab /> },
            { key: 'sendlog', label: t('imm.audit.tabSendLog'), children: <SendLogTab /> },
          ]}
        />
      </Card>
    </div>
  );
}
