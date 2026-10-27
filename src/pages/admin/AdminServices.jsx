import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Form, FormItem, Input, Modal, Select, Switch, Table, Tag, Title, useForm } from 'animal-island-ui';
import { EditIcon, PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { SERVICE_COLORS, SERVICE_ICONS, serviceIcon } from '../../components/icons.js';
import { toastSuccess, toastError } from '../../components/toast.js';

const ICON_OPTIONS = Object.keys(SERVICE_ICONS).map((name) => ({ key: name, label: name.replace(/Icon$/, '') }));
const COLOR_OPTIONS = SERVICE_COLORS.map((c) => ({ key: c, label: c }));

export default function AdminServices() {
  const { t } = useTranslation();
  const [services, setServices] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [editing, setEditing] = useState(null); // {} | service | null
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form] = useForm();

  const loadServices = useCallback(async () => {
    const data = await api.get('/services/admin');
    setServices(data.items.map((s) => ({ ...s, key: s.key })));
  }, []);

  useEffect(() => {
    Promise.all([loadServices(), api.get('/roles/permissions').then((d) => setPermissions(d.items))]).catch((err) => {
      toastError(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
      setServices([]);
    });
  }, [loadServices, t]);

  const openCreate = () => {
    setEditing({});
    form.resetFields();
    form.setFieldsValue({ icon: 'RocketIcon', color: 'app-teal', enabled: true });
  };

  const openEdit = (service) => {
    setEditing(service);
    form.resetFields();
    form.setFieldsValue({
      ...service,
      name: service.nameCn ?? service.name,
      description: service.descriptionCn ?? service.description,
      requiredPermission: service.requiredPermission ?? '',
      enabled: service.enabled,
    });
  };

  const closeModal = () => {
    setEditing(null);
    form.resetFields();
  };

  const submit = async (values) => {
    setBusy(true);
    try {
      const payload = {
        name: values.name?.trim(),
        nameTw: values.nameTw?.trim() || '',
        url: values.url?.trim(),
        description: values.description?.trim() ?? '',
        descriptionTw: values.descriptionTw?.trim() || '',
        icon: values.icon,
        color: values.color,
        requiredPermission: values.requiredPermission || null,
        enabled: !!values.enabled,
      };
      if (editing?.id) {
        await api.patch(`/services/${editing.id}`, payload);
      } else {
        await api.post('/services', { ...payload, key: values.key?.trim() });
      }
      toastSuccess(t('common.save'));
      closeModal();
      await loadServices();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/services/${deleteTarget.id}`);
      toastSuccess(t('common.deleted'));
      setDeleteTarget(null);
      await loadServices();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
    }
  };

  const toggleEnabled = async (service, checked) => {
    try {
      await api.patch(`/services/${service.id}`, { enabled: checked });
      await loadServices();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
    }
  };

  const columns = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      width: 180,
      render: (value, record) => {
        const Icon = serviceIcon(record.icon);
        return (
          <span className="service-name-cell">
            <Tag color={record.color} variant="solid">
              <Icon size={16} />
            </Tag>
            <span>{value}</span>
          </span>
        );
      },
    },
    { title: t('common.key'), dataIndex: 'key', width: 120, render: (v) => <Tag color="default" variant="outlined">{v}</Tag> },
    {
      title: t('admin.services.url'),
      dataIndex: 'url',
      render: (value) => (
        <a href={value} target="_blank" rel="noopener noreferrer" className="service-url">
          {value}
        </a>
      ),
    },
    {
      title: t('admin.services.requiredPermission'),
      dataIndex: 'requiredPermission',
      width: 150,
      render: (value) => (value ? <Tag color="purple" variant="soft">{value}</Tag> : <span className="muted-text">-</span>),
    },
    {
      title: t('common.status'),
      dataIndex: 'enabled',
      width: 100,
      align: 'center',
      render: (value, record) => (
        <Switch size="small" checked={value} onChange={(checked) => toggleEnabled(record, checked)} />
      ),
    },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 200,
      render: (_, record) => (
        <div className="table-actions">
          <Button type="default" size="small" icon={<EditIcon />} onClick={() => openEdit(record)}>
            {t('common.edit')}
          </Button>
          <Button type="default" size="small" danger icon={<TrashIcon />} onClick={() => setDeleteTarget(record)}>
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('admin.services.title')}</Title>
        <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
          {t('admin.services.create')}
        </Button>
      </div>
      <Card>
        <Table className="table-fit" columns={columns} dataSource={services ?? []} loading={services === null} rowKey="key" pagination={false} />
      </Card>

      <Modal maskClosable={false} open={editing !== null} title={editing?.id ? t('admin.services.edit') : t('admin.services.create')} onClose={closeModal} footer={null} typewriter={false} width={540}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <FormItem name="name" label={t('common.name')} rules={[{ required: true, message: t('common.name') }]}>
            <Input size="large" allowClear />
          </FormItem>
          <FormItem name="nameTw" label={`${t('common.name')} · ${t('common.traditional')}`}>
            <Input size="large" placeholder={t('common.twOptional')} allowClear />
          </FormItem>
          <FormItem name="key" label={t('common.key')} help={t('admin.roles.keyTip')} rules={[{ required: true, message: t('admin.roles.keyTip') }]}>
            <Input size="large" disabled={!!editing?.id} placeholder="wiki" />
          </FormItem>
          <FormItem name="url" label={t('admin.services.url')} rules={[{ required: true, message: t('admin.services.url') }, { pattern: /^https?:\/\/.+/i, message: t('api.VALIDATION_ERROR') }]}>
            <Input size="large" placeholder="https://example.com" allowClear />
          </FormItem>
          <FormItem name="description" label={t('common.description')}>
            <Input size="large" allowClear />
          </FormItem>
          <FormItem name="descriptionTw" label={`${t('common.description')} · ${t('common.traditional')}`}>
            <Input size="large" placeholder={t('common.twOptional')} allowClear />
          </FormItem>
          <FormItem name="icon" label={t('admin.services.icon')} rules={[{ required: true, message: t('admin.services.icon') }]}>
            <Select options={ICON_OPTIONS} />
          </FormItem>
          <FormItem name="color" label={t('admin.services.color')} rules={[{ required: true, message: t('admin.services.color') }]}>
            <Select options={COLOR_OPTIONS} />
          </FormItem>
          <FormItem
            name="requiredPermission"
            label={t('admin.services.requiredPermission')}
            help={t('admin.services.requiredPermissionTip')}
          >
            <Select
              options={[{ key: '', label: '-' }, ...permissions.map((p) => ({ key: p.key, label: p.name }))]}
              allowClear
            />
          </FormItem>
          <FormItem name="enabled" label={t('common.status')} valuePropName="checked">
            <Switch checkedChildren={t('common.enabled')} unCheckedChildren={t('common.disabled')} />
          </FormItem>
          <FormItem>
            <div className="form-actions">
              <Button onClick={closeModal} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button type="primary" htmlType="submit" loading={busy} disabled={busy}>
                {t('common.save')}
              </Button>
            </div>
          </FormItem>
        </Form>
      </Modal>

      <Modal
        maskClosable={false}
        open={deleteTarget !== null}
        title={t('common.confirmDeleteTitle')}
        onClose={() => setDeleteTarget(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button type="primary" danger onClick={confirmDelete}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {deleteTarget ? t('admin.services.deleteConfirm', { name: deleteTarget.name }) : ''}
      </Modal>
    </div>
  );
}
