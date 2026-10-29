import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Checkbox, Form, FormItem, Input, Modal, Table, Tag, Title, useForm } from 'animal-island-ui';
import { EditIcon, PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastSuccess, toastError } from '../../components/toast.js';

export default function AdminRoles() {
  const { t } = useTranslation();
  const [roles, setRoles] = useState(null);
  const [permissionGroups, setPermissionGroups] = useState({});
  const [editing, setEditing] = useState(null); // {} | role | null
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form] = useForm();

  const loadRoles = useCallback(async () => {
    const data = await api.get('/roles');
    setRoles(data.items.map((r) => ({ ...r, key: r.key })));
  }, []);

  useEffect(() => {
    Promise.all([loadRoles(), api.get('/roles/permissions').then((d) => setPermissionGroups(d.groups))]).catch((err) => {
      toastError(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
      setRoles([]);
    });
  }, [loadRoles, t]);

  const openCreate = () => {
    setEditing({});
    form.resetFields();
  };

  const openEdit = (role) => {
    setEditing(role);
    form.resetFields();
    form.setFieldsValue({
      key: role.key,
      name: role.nameCn ?? role.name,
      nameTw: role.nameTw ?? '',
      description: role.descriptionCn ?? role.description,
      descriptionTw: role.descriptionTw ?? '',
      permissions: role.permissions,
    });
  };

  const closeModal = () => {
    setEditing(null);
    form.resetFields();
  };

  const submit = async (values) => {
    setBusy(true);
    try {
      if (editing?.id) {
        const payload = {
          name: values.name?.trim(),
          nameTw: values.nameTw?.trim() || '',
          description: values.description?.trim() ?? '',
          descriptionTw: values.descriptionTw?.trim() || '',
        };
        if (editing.key !== 'admin') payload.permissions = values.permissions ?? [];
        await api.patch(`/roles/${editing.id}`, payload);
      } else {
        await api.post('/roles', {
          key: values.key?.trim(),
          name: values.name?.trim(),
          nameTw: values.nameTw?.trim() || '',
          description: values.description?.trim() ?? '',
          descriptionTw: values.descriptionTw?.trim() || '',
          permissions: values.permissions ?? [],
        });
      }
      toastSuccess(t('common.save'));
      closeModal();
      await loadRoles();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/roles/${deleteTarget.id}`);
      toastSuccess(t('common.deleted'));
      setDeleteTarget(null);
      await loadRoles();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
    }
  };

  const isAdminRole = editing?.key === 'admin';

  const columns = [
    { title: t('admin.roles.key'), dataIndex: 'key', width: 120, render: (v) => <Tag color="app-teal" variant="outlined">{v}</Tag> },
    { title: t('admin.roles.name'), dataIndex: 'name', width: 140 },
    { title: t('common.description'), dataIndex: 'description' },
    {
      title: t('admin.roles.permissions'),
      dataIndex: 'permissions',
      render: (perms) => perms.map((p) => (
        <Tag key={p} color="app-blue" variant="soft" size="small">
          {p}
        </Tag>
      )),
    },
    { title: t('admin.roles.userCount'), dataIndex: 'userCount', width: 90, align: 'center' },
    {
      title: t('common.system'),
      dataIndex: 'isSystem',
      width: 80,
      align: 'center',
      render: (v) => (v ? <Tag color="purple" variant="soft">{t('common.yes')}</Tag> : '-'),
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
          <Button
            type="default"
            size="small"
            danger
            icon={<TrashIcon />}
            disabled={record.isSystem}
            onClick={() => setDeleteTarget(record)}
          >
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('admin.roles.title')}</Title>
        </h1>
        <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
          {t('admin.roles.create')}
        </Button>
      </div>
      <Card>
        <Table className="table-fit" columns={columns} dataSource={roles ?? []} loading={roles === null} rowKey="key" pagination={false} />
      </Card>

      <Modal maskClosable={false} open={editing !== null} title={editing?.id ? t('admin.roles.edit') : t('admin.roles.create')} onClose={closeModal} footer={null} typewriter={false} width={560}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <FormItem name="key" label={t('admin.roles.key')} help={t('admin.roles.keyTip')} rules={[{ required: true, message: t('admin.roles.keyTip') }]}>
            <Input size="large" disabled={!!editing?.id} placeholder="editor" />
          </FormItem>
          <FormItem name="name" label={t('admin.roles.name')} rules={[{ required: true, message: t('admin.roles.name') }]}>
            <Input size="large" allowClear />
          </FormItem>
          <FormItem name="nameTw" label={`${t('admin.roles.name')} · ${t('common.traditional')}`}>
            <Input size="large" placeholder={t('common.twOptional')} allowClear />
          </FormItem>
          <FormItem name="description" label={t('common.description')}>
            <Input size="large" allowClear />
          </FormItem>
          <FormItem name="descriptionTw" label={`${t('common.description')} · ${t('common.traditional')}`}>
            <Input size="large" placeholder={t('common.twOptional')} allowClear />
          </FormItem>
          <FormItem
            name="permissions"
            label={t('admin.roles.permissions')}
            help={isAdminRole ? t('admin.roles.adminLockedTip') : undefined}
          >
            <Checkbox
              options={Object.entries(permissionGroups).flatMap(([grp, perms]) =>
                perms.map((p) => ({ label: `${t(`admin.roles.group.${grp}`)} · ${p.name} (${p.key})`, value: p.key }))
              )}
              direction="vertical"
              disabled={isAdminRole}
            />
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
        {deleteTarget ? t('admin.roles.deleteConfirm', { name: deleteTarget.name }) : ''}
      </Modal>
    </div>
  );
}
