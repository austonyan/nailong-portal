import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Input, Modal, Select, Table, Tabs, Tag, Title } from 'animal-island-ui';
import { DownloadIcon, PlusIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastApiError } from '../../../components/immigration/apiError.js';
import { ImAdminNav, exportCsv } from '../../../components/immigration/shared.jsx';
import { toastSuccess, toastError } from '../../../components/toast.js';
import { fmtDate, fmtDateTime } from '../../../lib/date.js';

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
        const rows = data.items ?? [];
        setItems(rows);
        setTotal(data.total);
        // total 变小时把页码夹回合法范围,避免停在空表。
        if (rows.length === 0 && page > 1) setPage(Math.max(1, page - 1));
      })
      .catch((err) => {
        toastApiError(err);
        setItems([]);
      });
  }, [page, actionFilter]);

  useEffect(load, [load]);

  // 动作码形如 `im:port.create`:去掉命名空间前缀并压平分隔符,再查词条。
  const actionLabel = (code) => {
    const key = String(code ?? '').replace(/^im:/, '').replace(/[.:]/g, '_');
    return code ? t(`imm.admin.audit.actionName.${key}`, { defaultValue: t('common.unknown') }) : '-';
  };

  // 对象类型码(port / declaration / pass_code …)同样查词条,导出与表格共用。
  const targetLabel = (code) => (code ? t(`imm.admin.audit.targetKind.${code}`, { defaultValue: t('common.unknown') }) : '-');

  const actionFilters = ['port', 'declaration', 'pass', 'record', 'visa', 'blacklist', 'template', 'settings', 'file', 'data'];

  const exportAll = () => {
    exportCsv(
      'im-audit-logs.csv',
      [
        { key: 'id', label: 'ID' },
        { key: 'actor', label: t('imm.admin.verify.officer') },
        { key: 'action', label: t('imm.admin.audit.action') },
        { key: 'target_type', label: t('imm.admin.audit.targetType') },
        { key: 'target_id', label: t('imm.admin.audit.targetId') },
        { key: 'detail', label: t('imm.admin.audit.detail') },
        { key: 'created_at', label: t('common.createdAt') },
      ],
      (items ?? []).map((r) => ({
        ...r,
        actor: r.actor ?? t('common.system'),
        action: actionLabel(r.action),
        target_type: targetLabel(r.target_type),
      }))
    );
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: t('imm.admin.verify.officer'), dataIndex: 'actor', width: 110, render: (v) => v ?? t('common.system') },
    {
      title: t('imm.admin.audit.action'),
      dataIndex: 'action',
      width: 220,
      render: (v) => <Tag size="small" color="app-blue" variant="soft">{actionLabel(v)}</Tag>,
    },
    { title: t('imm.admin.audit.targetType'), dataIndex: 'target_type', width: 110, render: (v) => targetLabel(v) },
    { title: t('imm.admin.audit.targetId'), dataIndex: 'target_id', width: 170 },
    {
      title: t('imm.admin.audit.detail'),
      dataIndex: 'detail',
      render: (v) => {
        if (!v || (typeof v === 'object' && Object.keys(v).length === 0)) return '-';
        const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return <span className="im-audit-detail">{text}</span>;
      },
    },
    { title: t('common.createdAt'), dataIndex: 'created_at', width: 160, render: (v) => fmtDateTime(v) },
  ];

  return (
    <>
      <div className="im-review-toolbar">
        <Select
          value={actionFilter}
          onChange={(v) => { setActionFilter(v); setPage(1); }}
          options={[
            { key: '', label: t('imm.admin.audit.allActions') },
            ...actionFilters.map((a) => ({ key: `im:${a}`, label: actionLabel(`im:${a}`) })),
          ]}
        />
        <Button type="text" size="small" icon={<DownloadIcon />} onClick={exportAll} disabled={!items?.length}>
          {t('imm.records.export')}
        </Button>
      </div>
      <Table className="table-fit"
        columns={columns}
        dataSource={items ?? []}
        loading={items === null}
        rowKey="id"
        pagination={{ current: page, pageSize, total, onChange: (p) => setPage(p), showTotal: true }}
        emptyText={t('common.empty')}
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
      toastSuccess(t('common.save'));
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
    { title: t('imm.admin.blacklist.level'), dataIndex: 'level', width: 90, render: (v) => <Tag color={v === 'block' ? 'app-red' : 'warm-peach-pink'} variant="soft">{t(`imm.admin.blacklist.${v}`)}</Tag> },
    { title: t('imm.admin.blacklist.reason'), dataIndex: 'reason' },
    { title: t('common.createdAt'), dataIndex: 'created_at', width: 150, render: (v) => fmtDate(v) },
    {
      title: t('common.actions'),
      width: 100,
      render: (_, record) => (
        <Button type="default" size="small" onClick={() => lift(record)}>{t('imm.admin.blacklist.lift')}</Button>
      ),
    },
  ];

  return (
    <>
      <div className="im-tab-toolbar">
        <Button type="primary" icon={<PlusIcon />} onClick={() => { setUserId(''); setReason(''); setLevel('warn'); setAdding(true); }}>
          {t('imm.admin.blacklist.add')}
        </Button>
      </div>
      <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      <Modal
        open={adding}
        title={t('imm.admin.blacklist.add')}
        onClose={() => {
          if (!busy) setAdding(false);
        }}
        maskClosable={false}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setAdding(false)} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={add} disabled={!userId || !reason.trim()}>{t('common.confirm')}</Button>
          </>
        }
      >
        <p className="im-field-label"><label htmlFor="im-blacklist-user-id">{t('common.userId')}</label></p>
        <Input id="im-blacklist-user-id" size="large" type="number" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="3" />
        <Select
          aria-label={t('imm.admin.blacklist.level')}
          value={level}
          onChange={setLevel}
          options={[{ key: 'warn', label: t('imm.admin.blacklist.warn') }, { key: 'block', label: t('imm.admin.blacklist.block') }]}
        />
        <p className="im-field-label"><label htmlFor="im-blacklist-reason">{t('imm.admin.blacklist.reason')}</label></p>
        <Input id="im-blacklist-reason" size="large" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
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
  const [titleTw, setTitleTw] = useState('');
  const [bodyTw, setBodyTw] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

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
    if (!title.trim() || !body.trim()) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      await api.put(`/immigration/admin/templates/${editing.id}`, { title, body, titleTw, bodyTw, enabled });
      toastSuccess(t('common.save'));
      setEditing(null);
      load();
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { title: t('common.key'), dataIndex: 'code', width: 170 },
    { title: t('imm.admin.templates.title'), dataIndex: 'title', width: 240 },
    { title: t('imm.admin.templates.variables'), dataIndex: 'variables', width: 140, render: (v) => v || '-' },
    { title: t('common.status'), dataIndex: 'enabled', width: 90, render: (v) => (v ? <Tag color="app-green" variant="soft">{t('common.enabled')}</Tag> : <Tag color="brown" variant="soft">{t('common.disabled')}</Tag>) },
    { title: t('imm.admin.templates.updatedAt'), dataIndex: 'updatedAt', width: 140, render: (v) => fmtDate(v) },
    {
      title: t('common.actions'),
      width: 90,
      render: (_, record) => (
        <Button
          type="default"
          size="small"
          onClick={() => {
            setEditing(record);
            setTitle(record.titleCn ?? record.title);
            setBody(record.bodyCn ?? record.body);
            setTitleTw(record.titleTw ?? '');
            setBodyTw(record.bodyTw ?? '');
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
      <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      <Modal
        open={editing !== null}
        title={t('imm.admin.templates.editTitle', { code: editing?.code })}
        onClose={() => {
          if (!busy) setEditing(null);
        }}
        maskClosable={false}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={busy || !title.trim() || !body.trim()} onClick={save}>{t('common.save')}</Button>
          </>
        }
        width={560}
        typewriter={false}
      >
        <p className="muted-text">{t('imm.admin.templates.varTip')}</p>
        <p className="im-field-label"><label htmlFor="im-tpl-title">{t('imm.admin.templates.title')}</label></p>
        <Input id="im-tpl-title" size="large" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        <p className="im-field-label"><label htmlFor="im-tpl-title-tw">{t('imm.admin.templates.title')} · {t('common.traditional')}</label></p>
        <Input id="im-tpl-title-tw" size="large" value={titleTw} placeholder={t('common.twOptional')} onChange={(e) => setTitleTw(e.target.value)} maxLength={120} />
        <p className="im-field-label"><label htmlFor="im-tpl-body">{t('imm.admin.templates.body')}</label></p>
        <textarea id="im-tpl-body" className="docs-textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} />
        <p className="im-field-label"><label htmlFor="im-tpl-body-tw">{t('imm.admin.templates.body')} · {t('common.traditional')}</label></p>
        <textarea id="im-tpl-body-tw" className="docs-textarea" value={bodyTw} placeholder={t('common.twOptional')} onChange={(e) => setBodyTw(e.target.value)} maxLength={600} />
        <Select
          aria-label={t('common.status')}
          value={enabled ? 'on' : 'off'}
          onChange={(v) => setEnabled(v === 'on')}
          options={[{ key: 'on', label: t('common.enabled') }, { key: 'off', label: t('common.disabled') }]}
        />
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
    { title: t('imm.admin.templates.code'), dataIndex: 'template_code', width: 170 },
    { title: t('imm.admin.templates.title'), dataIndex: 'title' },
    { title: t('common.status'), dataIndex: 'read', width: 90, render: (v) => (v ? t('imm.msg.read') : t('imm.msg.unread')) },
    { title: t('common.createdAt'), dataIndex: 'created_at', width: 160, render: (v) => fmtDateTime(v) },
  ];

  return (
    <Table className="table-fit"
      columns={columns}
      dataSource={items ?? []}
      loading={items === null}
      rowKey="id"
      pagination={{ current: page, pageSize, total, onChange: (p) => setPage(p), showTotal: true }}
      emptyText={t('common.empty')}
    />
  );
}

export default function AdminImAudit() {
  const { t } = useTranslation();
  return (
    <div className="im-page">
      <ImAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-teal">
            {t('imm.admin.audit.title')}
          </Title>
        </h1>
      </div>
      <Card>
        <Tabs
          items={[
            { key: 'audit', label: t('imm.admin.audit.tabLog'), children: <AuditTab /> },
            { key: 'blacklist', label: t('imm.admin.audit.tabBlacklist'), children: <BlacklistTab /> },
            { key: 'templates', label: t('imm.admin.audit.tabTemplates'), children: <TemplatesTab /> },
            { key: 'sendlog', label: t('imm.admin.audit.tabSendLog'), children: <SendLogTab /> },
          ]}
        />
      </Card>
    </div>
  );
}
