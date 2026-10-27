// 审计与合规: 审计日志查询 / 消息模板编辑 / 发送记录。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Switch, Table, Tag, Title } from 'animal-island-ui';
import { api } from '../../../api/client.js';
import { DipAdminNav, TextArea, fmtDateTime, toastDipError } from '../../../components/dip/shared.jsx';
import { toastSuccess, toastError } from '../../../components/toast.js';

function TemplateModal({ initial, onClose, onSaved }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial.titleCn ?? initial.title);
  const [body, setBody] = useState(initial.bodyCn ?? initial.body);
  const [titleTw, setTitleTw] = useState(initial.titleTw ?? '');
  const [bodyTw, setBodyTw] = useState(initial.bodyTw ?? '');
  const [enabled, setEnabled] = useState(initial.enabled);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim() || !body.trim()) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      await api.put(`/dip/admin/templates/${initial.id}`, { title: title.trim(), body: body.trim(), titleTw: titleTw.trim(), bodyTw: bodyTw.trim(), enabled });
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
      title={t('dip.templates.editTitle', { code: initial.code })}
      onClose={onClose}
      typewriter={false}
      width={540}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button type="primary" loading={busy} disabled={busy || !title.trim() || !body.trim()} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="dip-config-form">
        <p className="dip-info-row"><span className="dip-info-label">{t('dip.templates.title')}</span><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></p>
        <p className="dip-info-row"><span className="dip-info-label">{t('dip.templates.title')} · {t('common.traditional')}</span><Input value={titleTw} placeholder={t('common.twOptional')} onChange={(e) => setTitleTw(e.target.value)} maxLength={120} /></p>
        <p className="dip-config-guide">
          <span className="dip-info-label">{t('dip.templates.body')}</span>
          <TextArea rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} />
        </p>
        <p className="dip-config-guide">
          <span className="dip-info-label">{t('dip.templates.body')} · {t('common.traditional')}</span>
          <TextArea rows={5} value={bodyTw} placeholder={t('common.twOptional')} onChange={(e) => setBodyTw(e.target.value)} maxLength={600} />
        </p>
        <p className="muted-text">{t('dip.templates.varTip')}</p>
        <p className="dip-info-row">
          <span className="dip-info-label">{t('common.status')}</span>
          <Switch checked={enabled} onChange={setEnabled} />
        </p>
      </div>
    </Modal>
  );
}

export default function AdminDipAudit() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('log'); // log | templates | sendlog
  const [action, setAction] = useState('');
  const [logs, setLogs] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [sendLog, setSendLog] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    if (tab === 'log') {
      const params = new URLSearchParams({ pageSize: '20' });
      if (action.trim()) params.set('action', action.trim());
      api
        .get(`/dip/admin/audit?${params.toString()}`)
        .then((data) => setLogs(data.items))
        .catch((err) => {
          toastDipError(t, err);
          setLogs([]);
        });
    } else if (tab === 'templates') {
      api
        .get('/dip/admin/templates')
        .then((data) => setTemplates(data.items))
        .catch((err) => {
          toastDipError(t, err);
          setTemplates([]);
        });
    } else {
      api
        .get('/dip/admin/messages?pageSize=50')
        .then((data) => setSendLog(data.items))
        .catch((err) => {
          toastDipError(t, err);
          setSendLog([]);
        });
    }
  }, [tab, action, t]);

  useEffect(load, [load]);

  const auditColumns = [
    { title: t('dip.audit.action'), dataIndex: 'action', width: 210 },
    { title: t('dip.audit.actor'), dataIndex: 'actor', width: 110, render: (v, r) => v || r.actor_name || 'system' },
    { title: t('dip.audit.targetType'), dataIndex: 'target_type', width: 100 },
    { title: t('dip.audit.targetId'), dataIndex: 'target_id', width: 200 },
    {
      title: t('dip.audit.detail'),
      dataIndex: 'detail',
      render: (v) => <code className="dip-audit-detail">{JSON.stringify(v)}</code>,
    },
    { title: t('dip.audit.at'), dataIndex: 'created_at', width: 160, render: (v) => fmtDateTime(v) },
  ];

  const templateColumns = [
    { title: t('dip.templates.code'), dataIndex: 'code', width: 220 },
    { title: t('dip.templates.title'), dataIndex: 'title', style: { maxWidth: 320 } },
    { title: t('dip.templates.variables'), dataIndex: 'variables', width: 160 },
    {
      title: t('common.status'),
      dataIndex: 'enabled',
      width: 90,
      render: (v) => <Tag size="small" color={v ? 'app-green' : 'default'} variant="soft">{v ? t('common.enabled') : t('common.disabled')}</Tag>,
    },
    { title: t('common.actions'), width: 90, render: (_, r) => <Button size="small" onClick={() => setEditing(r)}>{t('common.edit')}</Button> },
  ];

  const sendColumns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: t('dip.blacklist.user'), dataIndex: 'username', width: 120 },
    { title: t('dip.templates.code'), dataIndex: 'template_code', width: 220 },
    { title: t('dip.templates.title'), dataIndex: 'title', style: { maxWidth: 320 } },
    { title: t('dip.messages.unread'), dataIndex: 'read', width: 90, render: (v) => (v ? t('dip.messages.read') : t('dip.messages.unread')) },
    { title: t('dip.audit.at'), dataIndex: 'created_at', width: 160, render: (v) => fmtDateTime(v) },
  ];

  return (
    <div className="dip-page">
      <DipAdminNav />
      <div className="page-header">
        <Title size="middle" color="purple">{t('dip.audit.title')}</Title>
        <div className="dip-msg-filter">
          <Button type={tab === 'log' ? 'primary' : 'default'} size="small" onClick={() => setTab('log')}>{t('dip.audit.tabLog')}</Button>
          <Button type={tab === 'templates' ? 'primary' : 'default'} size="small" onClick={() => setTab('templates')}>{t('dip.audit.tabTemplates')}</Button>
          <Button type={tab === 'sendlog' ? 'primary' : 'default'} size="small" onClick={() => setTab('sendlog')}>{t('dip.audit.tabSendLog')}</Button>
        </div>
      </div>

      {tab === 'log' && (
        <Card>
          <div className="dip-admin-filter">
            <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder={t('dip.audit.actionPrefix')} allowClear maxLength={40} />
            <Button onClick={load}>{t('common.search')}</Button>
          </div>
          <Table className="table-fit" columns={auditColumns} dataSource={logs ?? []} loading={logs === null} rowKey="id" pagination={{ defaultPageSize: 20, showTotal: true }} />
        </Card>
      )}

      {tab === 'templates' && (
        <Card>
          <Table className="table-fit" columns={templateColumns} dataSource={templates ?? []} loading={templates === null} rowKey="id" pagination={false} />
        </Card>
      )}

      {tab === 'sendlog' && (
        <Card>
          <Table className="table-fit" columns={sendColumns} dataSource={sendLog ?? []} loading={sendLog === null} rowKey="id" pagination={{ defaultPageSize: 20, showTotal: true }} />
        </Card>
      )}

      {editing !== null && <TemplateModal initial={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}
