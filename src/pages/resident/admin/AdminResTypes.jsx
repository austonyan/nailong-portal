// 居民类型与规则配置:类型 CRUD、材料要求、有效期与开放状态。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Checkbox, Input, Modal, Notification, Switch, Table, Tag, Title } from 'animal-island-ui';
import { EditIcon, PlusIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { ResAdminNav } from '../ResidentShell.jsx';
import { TextArea, toastResError } from '../shared.jsx';

const EMPTY_FORM = {
  id: null,
  code: '',
  name: '',
  description: '',
  guide: '',
  benefits: '',
  duties: '',
  validYears: '1',
  requireAvatar: true,
  requireAddressProof: false,
  enabled: true,
  sortOrder: '0',
};

export default function AdminResTypes() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/resident/admin/types');
      setItems(data.items);
    } catch (err) {
      toastResError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setForm({
      id: row.id,
      code: row.code,
      name: row.nameCn ?? row.name,
      nameTw: row.nameTw ?? '',
      description: row.descriptionCn ?? row.description,
      descriptionTw: row.descriptionTw ?? '',
      guide: row.guideCn ?? row.guide,
      guideTw: row.guideTw ?? '',
      benefits: row.benefitsCn ?? row.benefits,
      benefitsTw: row.benefitsTw ?? '',
      duties: row.dutiesCn ?? row.duties,
      dutiesTw: row.dutiesTw ?? '',
      validYears: String(row.validYears),
      requireAvatar: row.requireAvatar,
      requireAddressProof: row.requireAddressProof,
      enabled: row.enabled,
      sortOrder: String(row.sortOrder),
    });
    setModalOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        code: form.code,
        name: form.name,
        nameTw: form.nameTw,
        description: form.description,
        descriptionTw: form.descriptionTw,
        guide: form.guide,
        guideTw: form.guideTw,
        benefits: form.benefits,
        benefitsTw: form.benefitsTw,
        duties: form.duties,
        dutiesTw: form.dutiesTw,
        validYears: Number(form.validYears) || 1,
        requireAvatar: form.requireAvatar,
        requireAddressProof: form.requireAddressProof,
        enabled: form.enabled,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (form.id) await api.patch(`/resident/admin/types/${form.id}`, body);
      else await api.post('/resident/admin/types', body);
      Notification.success(t('common.save'));
      setModalOpen(false);
      load();
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { title: t('res.admin.types.code'), dataIndex: 'code', width: 130 },
    { title: t('res.admin.types.name'), dataIndex: 'name', width: 120 },
    { title: t('res.admin.types.description'), dataIndex: 'description', render: (v) => v || '-' },
    { title: t('res.admin.types.validYears'), dataIndex: 'validYears', width: 90 },
    {
      title: t('res.admin.types.materials'),
      dataIndex: 'requireAvatar',
      width: 170,
      render: (_, row) => (
        <div className="res-type-reqs">
          {row.requireAvatar && <Tag size="small" variant="soft" color="app-teal">{t('res.materialKind.avatar')}</Tag>}
          {row.requireAddressProof && <Tag size="small" variant="soft" color="app-blue">{t('res.materialKind.address_proof')}</Tag>}
        </div>
      ),
    },
    {
      title: t('res.admin.types.enabled'),
      dataIndex: 'enabled',
      width: 90,
      render: (v) => (
        <Tag color={v ? 'app-green' : 'default'} variant="soft">
          {v ? t('res.type.open') : t('res.type.closed')}
        </Tag>
      ),
    },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 90,
      render: (_, record) => (
        <Button type="default" size="small" icon={<EditIcon />} onClick={() => openEdit(record)}>
          {t('common.edit')}
        </Button>
      ),
    },
  ];

  return (
    <div className="res-admin-page">
      <ResAdminNav />
      <div className="page-header">
        <Title size="middle">{t('res.admin.types.title')}</Title>
        <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
          {t('res.admin.types.create')}
        </Button>
      </div>
      <p className="muted-text">{t('res.admin.types.tip')}</p>

      <Card>
        <Table columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      </Card>

      <Modal
        open={modalOpen}
        title={form.id ? t('res.admin.types.edit') : t('res.admin.types.create')}
        onClose={() => setModalOpen(false)}
        typewriter={false}
        width={620}
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!form.code.trim() || !form.name.trim()} onClick={save}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="res-type-form">
          <div className="res-config-grid">
            <label>
              <span>{t('res.admin.types.code')} *</span>
              <Input size="large" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="TEMPORARY" disabled={!!form.id} />
            </label>
            <label>
              <span>{t('res.admin.types.name')} *</span>
              <Input size="large" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              <span>{t('res.admin.types.name')} · {t('common.traditional')}</span>
              <Input size="large" value={form.nameTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setForm({ ...form, nameTw: e.target.value })} />
            </label>
          </div>
          <label>
            <span>{t('res.admin.types.description')}</span>
            <TextArea rows={2} maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label>
            <span>{t('res.admin.types.description')} · {t('common.traditional')}</span>
            <TextArea rows={2} maxLength={300} value={form.descriptionTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setForm({ ...form, descriptionTw: e.target.value })} />
          </label>
          <label>
            <span>{t('res.type.guide')}</span>
            <TextArea rows={3} maxLength={2000} value={form.guide} onChange={(e) => setForm({ ...form, guide: e.target.value })} />
          </label>
          <label>
            <span>{t('res.type.guide')} · {t('common.traditional')}</span>
            <TextArea rows={3} maxLength={2000} value={form.guideTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setForm({ ...form, guideTw: e.target.value })} />
          </label>
          <label>
            <span>{t('res.type.benefits')}</span>
            <TextArea rows={2} maxLength={1000} value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} />
          </label>
          <label>
            <span>{t('res.type.benefits')} · {t('common.traditional')}</span>
            <TextArea rows={2} maxLength={1000} value={form.benefitsTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setForm({ ...form, benefitsTw: e.target.value })} />
          </label>
          <label>
            <span>{t('res.type.duties')}</span>
            <TextArea rows={2} maxLength={1000} value={form.duties} onChange={(e) => setForm({ ...form, duties: e.target.value })} />
          </label>
          <label>
            <span>{t('res.type.duties')} · {t('common.traditional')}</span>
            <TextArea rows={2} maxLength={1000} value={form.dutiesTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setForm({ ...form, dutiesTw: e.target.value })} />
          </label>
          <div className="res-config-grid">
            <label>
              <span>{t('res.admin.types.validYears')}</span>
              <Input size="large" value={form.validYears} onChange={(e) => setForm({ ...form, validYears: e.target.value })} />
            </label>
            <label>
              <span>{t('res.admin.types.sortOrder')}</span>
              <Input size="large" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            </label>
          </div>
          <div className="res-type-switches">
            <Checkbox
              options={[{ label: t('res.admin.types.requireAvatar'), value: 'avatar' }]}
              value={form.requireAvatar ? ['avatar'] : []}
              onChange={(vals) => setForm({ ...form, requireAvatar: vals.includes('avatar') })}
            />
            <Checkbox
              options={[{ label: t('res.admin.types.requireProof'), value: 'proof' }]}
              value={form.requireAddressProof ? ['proof'] : []}
              onChange={(vals) => setForm({ ...form, requireAddressProof: vals.includes('proof') })}
            />
            <div className="res-type-switch">
              <span>{t('res.admin.types.enabled')}</span>
              <Switch value={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
