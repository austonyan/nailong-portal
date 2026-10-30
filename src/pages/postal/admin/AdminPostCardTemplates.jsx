// 明信片模板管理:用户写明信片时挑选的卡片款式(编码、场景、配色、双语名称与描述)。
// 与「通知模板」是两回事:通知模板渲染站内消息文本,这里管理的是卡片样式。
// 支持新建、编辑、启停与删除;已被明信片引用的模板由服务端拒绝删除。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Switch, Table, Tag, Title } from 'animal-island-ui';
import { EditIcon, PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastError, toastSuccess } from '../../../components/toast.js';
import { CARD_COLORS, CARD_SCENES, PostTextarea, toastPostError } from '../shared.jsx';

const CODE_RE = /^[A-Z0-9_]+$/;

const EMPTY_TPL = {
  id: null,
  code: '',
  name: '',
  nameTw: '',
  scene: 'festival',
  color: 'app-teal',
  description: '',
  descriptionTw: '',
  sortOrder: 0,
  enabled: true,
};

export default function AdminPostCardTemplates() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_TPL);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/postal/admin/card-templates');
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
      code: row.code,
      name: row.nameCn ?? row.name,
      nameTw: row.nameTw ?? '',
      scene: row.scene,
      color: row.color,
      description: row.descriptionCn ?? row.description,
      descriptionTw: row.descriptionTw ?? '',
      sortOrder: row.sortOrder ?? 0,
      enabled: !!row.enabled,
    });
    setFormOpen(true);
  };

  const saveTemplate = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toastError(t('common.required'));
      return;
    }
    if (!CODE_RE.test(form.code.trim())) {
      toastError(t('post.admin.cardTemplates.codeRule'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (form.id) await api.patch(`/postal/admin/card-templates/${form.id}`, payload);
      else await api.post('/postal/admin/card-templates', payload);
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
      await api.patch(`/postal/admin/card-templates/${row.id}`, { enabled: !row.enabled });
      await load();
    } catch (err) {
      toastPostError(t, err);
    }
  };

  const removeTemplate = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.del(`/postal/admin/card-templates/${deleteTarget.id}`);
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
      title: t('post.admin.cardTemplates.name'),
      dataIndex: 'name',
      width: 160,
      render: (value, row) => ((row.nameCn ?? row.nameTw) ? `${value} / ${row.nameCn ?? row.nameTw}` : value),
    },
    {
      title: t('post.admin.cardTemplates.code'),
      dataIndex: 'code',
      width: 150,
      render: (value) => (
        <Tag color="brown" variant="outlined">
          {value}
        </Tag>
      ),
    },
    {
      title: t('post.admin.cardTemplates.scene'),
      dataIndex: 'scene',
      width: 90,
      render: (value) => t(`post.admin.cardTemplates.scene_${value}`, { defaultValue: t('common.unknown') }),
    },
    {
      title: t('post.admin.cardTemplates.color'),
      dataIndex: 'color',
      width: 140,
      render: (value) => (
        <Tag color={value} variant="solid" size="small">
          {t(`post.admin.cardTemplates.color_${value}`, { defaultValue: t('common.unknown') })}
        </Tag>
      ),
    },
    { title: t('post.admin.cardTemplates.description'), dataIndex: 'description' },
    { title: t('post.admin.cardTemplates.sortOrder'), dataIndex: 'sortOrder', width: 80 },
    {
      title: t('common.enabled'),
      dataIndex: 'enabled',
      width: 90,
      render: (value, row) => <Switch checked={!!value} onChange={() => toggleEnabled(row)} />,
    },
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
        <h1 className="page-title">
          <Title size="middle" color="app-orange">
            {t('post.admin.cardTemplates.title')}
          </Title>
        </h1>
      </div>

      <Card>
        <p className="muted-text">{t('post.admin.cardTemplates.tip')}</p>
        <div className="postal-filter-bar">
          <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
            {t('post.admin.cardTemplates.create')}
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
        title={form.id ? t('post.admin.cardTemplates.edit') : t('post.admin.cardTemplates.create')}
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
            <Button
              type="primary"
              loading={busy}
              disabled={busy || !form.code.trim() || !form.name.trim()}
              onClick={saveTemplate}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="postal-form">
          <label className="postal-field">
            <span>{t('post.admin.cardTemplates.code')} *</span>
            <Input
              size="large"
              value={form.code}
              maxLength={40}
              placeholder={t('post.admin.cardTemplates.codePlaceholder')}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </label>
          <label className="postal-field">
            <span>{t('post.admin.cardTemplates.sortOrder')}</span>
            <Input
              size="large"
              value={String(form.sortOrder)}
              maxLength={4}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value.replace(/\D/g, '') })}
            />
          </label>
          <label className="postal-field postal-field-wide">
            <span>{t('post.admin.cardTemplates.name')} *</span>
            <Input
              size="large"
              value={form.name}
              maxLength={60}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="postal-field postal-field-wide">
            <span>
              {t('post.admin.cardTemplates.name')} · {t('common.traditional')}
            </span>
            <Input
              size="large"
              value={form.nameTw ?? ''}
              placeholder={t('common.twOptional')}
              maxLength={60}
              onChange={(e) => setForm({ ...form, nameTw: e.target.value })}
            />
          </label>
          <label className="postal-field">
            <span>{t('post.admin.cardTemplates.scene')}</span>
            <Select
              value={form.scene}
              onChange={(key) => setForm({ ...form, scene: key })}
              options={CARD_SCENES.map((value) => ({
                key: value,
                label: t(`post.admin.cardTemplates.scene_${value}`, { defaultValue: t('common.unknown') }),
              }))}
            />
          </label>
          <label className="postal-field">
            <span>{t('post.admin.cardTemplates.color')}</span>
            <Select
              value={form.color}
              onChange={(key) => setForm({ ...form, color: key })}
              options={CARD_COLORS.map((value) => ({
                key: value,
                label: t(`post.admin.cardTemplates.color_${value}`, { defaultValue: t('common.unknown') }),
              }))}
            />
          </label>
          <label className="postal-field postal-field-wide">
            <span>{t('post.admin.cardTemplates.description')}</span>
            <PostTextarea
              rows={2}
              maxLength={200}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="postal-field postal-field-wide">
            <span>
              {t('post.admin.cardTemplates.description')} · {t('common.traditional')}
            </span>
            <PostTextarea
              rows={2}
              maxLength={200}
              value={form.descriptionTw ?? ''}
              placeholder={t('common.twOptional')}
              onChange={(e) => setForm({ ...form, descriptionTw: e.target.value })}
            />
          </label>
          <label className="postal-field">
            <span>{t('common.enabled')}</span>
            <Switch checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} />
          </label>
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
        <p className="muted-text">{t('post.admin.cardTemplates.deleteTip', { code: deleteTarget?.code ?? '' })}</p>
      </Modal>
    </div>
  );
}
