import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Switch, Table, Tag, Title } from 'animal-island-ui';
import { PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import DocsTextarea from '../../../components/DocsTextarea.jsx';
import { toastSuccess, toastError } from '../../../components/toast.js';
import { fmtDate } from '../../../lib/date.js';

const LEVEL_COLORS = { info: 'app-red', policy: 'app-teal', event: 'app-blue' };

export default function DocsNotices() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} | notice
  const [form, setForm] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // 管理端要看全部(含已下线的公告)
      const d = await api.get('/docs/admin/notices');
      setItems(d.items);
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing({});
    setForm({ title: '', titleTw: '', body: '', bodyTw: '', level: 'info', enabled: true });
  };

  const openEdit = (n) => {
    setEditing(n);
    setForm({
      title: n.titleCn ?? n.title,
      titleTw: n.titleTw ?? '',
      body: n.bodyCn ?? n.body,
      bodyTw: n.bodyTw ?? '',
      level: n.level,
      enabled: !!n.enabled,
    });
  };

  const submit = async () => {
    if (!form?.title?.trim() || !form?.body?.trim()) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      if (editing?.id) await api.patch(`/docs/admin/notices/${editing.id}`, form);
      else await api.post('/docs/admin/notices', form);
      toastSuccess(t('common.save'));
      setEditing(null);
      load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (n) => {
    try {
      await api.patch(`/docs/admin/notices/${n.id}`, { enabled: !n.enabled });
      load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/docs/admin/notices/${deleteTarget.id}`);
      toastSuccess(t('common.deleted'));
      setDeleteTarget(null);
      load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
    }
  };

  const setF = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const columns = [
    { title: t('docs.admin.notices.titleCol'), dataIndex: 'title', width: 220 },
    { title: t('common.description'), dataIndex: 'body', render: (v) => <span className="docs-cell-clip">{v}</span> },
    {
      title: t('docs.admin.notices.level'),
      dataIndex: 'level',
      width: 100,
      render: (v) => (
        <Tag color={LEVEL_COLORS[v] || 'brown'} variant="soft">
          {t(`docs.noticeLevel.${v}`)}
        </Tag>
      ),
    },
    {
      title: t('common.status'),
      dataIndex: 'enabled',
      width: 90,
      render: (v, row) => <Switch size="small" checked={!!v} onChange={() => toggle(row)} />,
    },
    { title: t('common.createdAt'), dataIndex: 'created_at', width: 110, render: (v) => fmtDate(v) },
    {
      title: t('common.actions'),
      width: 120,
      render: (_, row) => (
        <div className="table-actions">
          <Button size="small" onClick={() => openEdit(row)}>
            {t('common.edit')}
          </Button>
          <Button size="small" danger icon={<TrashIcon />} aria-label={t('common.delete')} onClick={() => setDeleteTarget(row)} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('docs.admin.notices.title')}</Title>
        </h1>
        <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
          {t('docs.admin.notices.create')}
        </Button>
      </div>
      <Card>
        <Table className="table-fit" columns={columns} dataSource={items || []} rowKey="id" loading={items === null} emptyText={t('common.empty')} pagination={false} />
      </Card>

      <Modal
        maskClosable={false}
        open={!!editing}
        title={editing?.id ? t('docs.admin.notices.edit') : t('docs.admin.notices.create')}
        width={640}
        typewriter={false}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={busy || !form?.title?.trim() || !form?.body?.trim()} onClick={submit}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {form && (
          <div className="docs-field-col">
            <label className="docs-field">
              <span className="docs-field-label">{t('docs.admin.notices.titleCol')}</span>
              <Input value={form.title} onChange={(e) => setF('title', e.target.value)} maxLength={120} />
            </label>
            <label className="docs-field">
              <span className="docs-field-label">{t('docs.admin.notices.titleCol')} · {t('common.traditional')}</span>
              <Input value={form.titleTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setF('titleTw', e.target.value)} maxLength={120} />
            </label>
            <label className="docs-field">
              <span className="docs-field-label">{t('docs.admin.notices.level')}</span>
              <Select value={form.level} onChange={(v) => setF('level', v)} options={['info', 'policy', 'event'].map((l) => ({ key: l, label: t(`docs.noticeLevel.${l}`) }))} />
            </label>
            <label className="docs-field docs-field-wide">
              <span className="docs-field-label">{t('common.description')}</span>
              <DocsTextarea value={form.body} onChange={(v) => setF('body', v)} rows={5} maxLength={2000} />
            </label>
            <label className="docs-field docs-field-wide">
              <span className="docs-field-label">{t('common.description')} · {t('common.traditional')}</span>
              <DocsTextarea value={form.bodyTw ?? ''} onChange={(v) => setF('bodyTw', v)} rows={5} maxLength={2000} placeholder={t('common.twOptional')} />
            </label>
            <label className="docs-field">
              <span className="docs-field-label">{t('common.enabled')}</span>
              <Switch checked={form.enabled} onChange={(v) => setF('enabled', v)} />
            </label>
          </div>
        )}
      </Modal>

      <Modal
        maskClosable={false}
        open={!!deleteTarget}
        title={t('common.confirmDeleteTitle')}
        typewriter={false}
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button type="primary" danger onClick={doDelete}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p>{t('docs.admin.notices.deleteConfirm', { title: deleteTarget?.title })}</p>
      </Modal>
    </div>
  );
}
