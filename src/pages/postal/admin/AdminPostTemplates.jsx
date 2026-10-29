// 通知模板管理:type、简繁标题/正文(含 {{变量}})与启停。
// 启用后 sendPostalMessage 命中相同 source+type 时会渲染模板并随消息存储。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Switch, Table, Tag, Title } from 'animal-island-ui';
import { EditIcon, PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastError, toastSuccess } from '../../../components/toast.js';
import { POSTAL_SOURCES, PostTextarea, fmtDateTime, toastPostError } from '../shared.jsx';

const EMPTY_TPL = {
  id: null,
  source: 'postal',
  type: '',
  titleTemplate: '',
  titleTemplateTw: '',
  bodyTemplate: '',
  bodyTemplateTw: '',
  variables: '',
  enabled: true,
};

const TYPE_RE = /^[a-z0-9_]+$/;

export default function AdminPostTemplates() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_TPL);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/postal/admin/templates');
      setItems(data.items);
    } catch (err) {
      toastPostError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_TPL);
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setForm({
      id: row.id,
      source: row.source,
      type: row.type,
      titleTemplate: row.titleTemplateCn ?? row.titleTemplate,
      titleTemplateTw: row.titleTemplateTw ?? '',
      bodyTemplate: row.bodyTemplateCn ?? row.bodyTemplate,
      bodyTemplateTw: row.bodyTemplateTw ?? '',
      variables: row.variables ?? '',
      enabled: !!row.enabled,
    });
    setFormOpen(true);
  };

  const saveTemplate = async () => {
    if (!form.type.trim() || !form.titleTemplate.trim()) {
      toastError(t('common.required'));
      return;
    }
    if (!TYPE_RE.test(form.type.trim())) {
      toastError(t('post.admin.templates.typeRule'));
      return;
    }
    setBusy(true);
    try {
      const payload = { ...form, type: form.type.trim(), source: form.source };
      if (form.id) await api.patch(`/postal/admin/templates/${form.id}`, payload);
      else await api.post('/postal/admin/templates', payload);
      setFormOpen(false);
      toastSuccess(t('common.saved'));
      await load();
    } catch (err) {
      toastPostError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (row) => {
    try {
      await api.patch(`/postal/admin/templates/${row.id}`, { enabled: !row.enabled });
      await load();
    } catch (err) {
      toastPostError(t, err);
    }
  };

  const removeTemplate = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.del(`/postal/admin/templates/${deleteTarget.id}`);
      setDeleteTarget(null);
      toastSuccess(t('common.deleted'));
      await load();
    } catch (err) {
      toastPostError(t, err);
    } finally {
      setDeleteBusy(false);
    }
  };

  const columns = [
    {
      title: t('post.admin.templates.source'),
      dataIndex: 'source',
      width: 120,
      render: (value) =>
        value === '*' ? (
          <Tag color="app-red" variant="soft" size="small">
            {t('post.admin.templates.anySource')}
          </Tag>
        ) : (
          <Tag color="app-blue" variant="soft" size="small">
            {t(`post.source.${value}`, { defaultValue: t('common.unknown') })}
          </Tag>
        ),
    },
    { title: t('post.admin.templates.type'), dataIndex: 'type', width: 200 },
    { title: t('post.admin.templates.titleTemplate'), dataIndex: 'titleTemplate' },
    { title: t('post.admin.templates.variables'), dataIndex: 'variables', width: 150, render: (v) => v || '-' },
    {
      title: t('common.enabled'),
      dataIndex: 'enabled',
      width: 90,
      render: (value, row) => <Switch checked={!!value} onChange={() => toggleEnabled(row)} />,
    },
    { title: t('post.admin.templates.updatedAt'), dataIndex: 'updatedAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 150,
      render: (_, row) => (
        <div className="table-actions">
          <Button size="small" icon={<EditIcon />} onClick={() => openEdit(row)}>
            {t('common.edit')}
          </Button>
          <Button size="small" type="text" danger icon={<TrashIcon />} onClick={() => setDeleteTarget(row)}>
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="postal-section">
      <div className="postal-section-head">
        <Title size="middle" color="app-orange">
          {t('post.admin.templates.title')}
        </Title>
      </div>

      <Card>
        <p className="muted-text">{t('post.admin.templates.tip')}</p>
        <div className="postal-filter-bar">
          <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
            {t('post.admin.templates.create')}
          </Button>
        </div>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('common.empty')}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={formOpen}
        title={form.id ? t('post.admin.templates.edit') : t('post.admin.templates.create')}
        onClose={() => {
          if (busy) return;
          setFormOpen(false);
        }}
        typewriter={false}
        width={620}
        footer={
          <>
            <Button onClick={() => setFormOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" loading={busy} disabled={busy || !form.titleTemplate.trim() || !form.type.trim()} onClick={saveTemplate}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="postal-form">
          <label className="postal-field">
            <span>{t('post.admin.templates.source')}</span>
            <Select
              value={form.source}
              onChange={(key) => setForm({ ...form, source: key })}
              options={[
                ...POSTAL_SOURCES.map((value) => ({ key: value, label: t(`post.source.${value}`, { defaultValue: t('common.unknown') }) })),
                { key: '*', label: t('post.admin.templates.anySource') },
              ]}
            />
          </label>
          <label className="postal-field">
            <span>{t('post.admin.templates.type')} *</span>
            <Input
              size="large"
              value={form.type}
              maxLength={60}
              placeholder={t('post.admin.templates.typePlaceholder')}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            />
          </label>
          <label className="postal-field postal-field-wide">
            <span>{t('post.admin.templates.titleTemplate')} *</span>
            <Input
              size="large"
              value={form.titleTemplate}
              maxLength={120}
              onChange={(e) => setForm({ ...form, titleTemplate: e.target.value })}
            />
          </label>
          <label className="postal-field postal-field-wide">
            <span>
              {t('post.admin.templates.titleTemplate')} · {t('common.traditional')}
            </span>
            <Input
              size="large"
              value={form.titleTemplateTw ?? ''}
              placeholder={t('common.twOptional')}
              maxLength={120}
              onChange={(e) => setForm({ ...form, titleTemplateTw: e.target.value })}
            />
          </label>
          <label className="postal-field postal-field-wide">
            <span>{t('post.admin.templates.bodyTemplate')}</span>
            <PostTextarea
              rows={4}
              maxLength={1000}
              value={form.bodyTemplate}
              onChange={(e) => setForm({ ...form, bodyTemplate: e.target.value })}
            />
          </label>
          <label className="postal-field postal-field-wide">
            <span>
              {t('post.admin.templates.bodyTemplate')} · {t('common.traditional')}
            </span>
            <PostTextarea
              rows={4}
              maxLength={1000}
              value={form.bodyTemplateTw ?? ''}
              placeholder={t('common.twOptional')}
              onChange={(e) => setForm({ ...form, bodyTemplateTw: e.target.value })}
            />
          </label>
          <label className="postal-field">
            <span>{t('post.admin.templates.variables')}</span>
            <Input
              size="large"
              value={form.variables}
              maxLength={120}
              placeholder={t('post.admin.templates.variablesPlaceholder')}
              onChange={(e) => setForm({ ...form, variables: e.target.value })}
            />
          </label>
          <label className="postal-field">
            <span>{t('common.enabled')}</span>
            <Switch checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} />
          </label>
          <p className="muted-text postal-field-wide">{t('post.admin.templates.varTip')}</p>
        </div>
      </Modal>

      <Modal
        maskClosable={false}
        open={!!deleteTarget}
        title={t('common.confirmDeleteTitle')}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteTarget(null);
        }}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" danger loading={deleteBusy} disabled={deleteBusy} onClick={removeTemplate}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="muted-text">{t('post.admin.templates.deleteTip', { type: deleteTarget?.type ?? '' })}</p>
      </Modal>
    </div>
  );
}