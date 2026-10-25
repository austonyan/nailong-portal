import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Checkbox, Form, FormItem, Input, Modal, Notification, Switch, Table, Tag, Title, useForm } from 'animal-island-ui';
import { EditIcon, TrashIcon, UserPlusIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';

export default function AdminUsers() {
  const { t } = useTranslation();
  const { user: me, can } = useAuth();
  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null); // null | {} (create) | user (edit)
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form] = useForm();

  const loadUsers = useCallback(async () => {
    const data = await api.get('/users?pageSize=100');
    setUsers(data.items.map((u) => ({ ...u, key: String(u.id) })));
  }, []);

  useEffect(() => {
    Promise.all([loadUsers(), api.get('/roles').then((d) => setRoles(d.items))]).catch((err) => {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
      setUsers([]);
    });
  }, [loadUsers, t]);

  const openCreate = () => {
    setEditing({});
    form.resetFields();
    form.setFieldsValue({ roleKeys: ['user'] });
  };

  const openEdit = (record) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue({
      username: record.username,
      displayName: record.displayName,
      email: record.email ?? '',
      roleKeys: record.roles.map((r) => r.key),
      status: record.status === 'active',
      password: '',
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
          displayName: values.displayName?.trim(),
          email: values.email?.trim() || '',
        };
        if (!isSelf) {
          payload.roleKeys = values.roleKeys ?? [];
          payload.status = values.status ? 'active' : 'disabled';
        }
        if (values.password) payload.password = values.password;
        await api.patch(`/users/${editing.id}`, payload);
      } else {
        await api.post('/users', {
          username: values.username.trim(),
          password: values.password,
          displayName: values.displayName?.trim() || undefined,
          email: values.email?.trim() || undefined,
          roleKeys: values.roleKeys ?? [],
        });
      }
      Notification.success(t('common.save'));
      closeModal();
      await loadUsers();
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/users/${deleteTarget.id}`);
      Notification.success(t('common.save'));
      setDeleteTarget(null);
      await loadUsers();
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
    }
  };

  const isSelf = editing?.id === me?.id;

  const columns = [
    { title: t('admin.users.username'), dataIndex: 'username', width: 140 },
    { title: t('admin.users.displayName'), dataIndex: 'displayName', width: 140 },
    {
      title: t('admin.users.roles'),
      dataIndex: 'roles',
      render: (_, record) =>
        record.roles.map((r) => (
          <Tag key={r.key} color="app-blue" variant="soft">
            {r.name}
          </Tag>
        )),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 90,
      render: (value) =>
        value === 'active' ? (
          <Tag color="app-green" variant="solid">
            {t('common.enabled')}
          </Tag>
        ) : (
          <Tag color="app-red" variant="soft">
            {t('common.disabled')}
          </Tag>
        ),
    },
    {
      title: t('common.lastLogin'),
      dataIndex: 'lastLoginAt',
      width: 150,
      render: (value) => (value ? new Date(value).toLocaleString() : '-'),
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
            disabled={record.id === me?.id}
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
        <Title size="middle">{t('admin.users.title')}</Title>
        {can('users:write') && (
          <Button type="primary" icon={<UserPlusIcon />} onClick={openCreate}>
            {t('admin.users.create')}
          </Button>
        )}
      </div>
      <Card>
        <Table
          columns={columns}
          dataSource={users ?? []}
          loading={users === null}
          rowKey="key"
          pagination={{ defaultPageSize: 10, showTotal: true }}
        />
      </Card>

      <Modal open={editing !== null} title={editing?.id ? t('admin.users.edit') : t('admin.users.create')} onClose={closeModal} footer={null} typewriter={false} width={520}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <FormItem name="username" label={t('admin.users.username')} rules={[{ required: true, message: t('auth.usernamePlaceholder') }]}>
            <Input size="large" disabled={!!editing?.id} placeholder={t('auth.usernamePlaceholder')} />
          </FormItem>
          <FormItem name="displayName" label={t('admin.users.displayName')}>
            <Input size="large" allowClear />
          </FormItem>
          <FormItem name="email" label={`${t('admin.users.email')}(${t('common.optional')})`} rules={[{ type: 'email', message: t('api.VALIDATION_ERROR') }]}>
            <Input size="large" type="email" allowClear />
          </FormItem>
          <FormItem name="password" label={editing?.id ? t('admin.users.resetPassword') : t('auth.password')} rules={editing?.id ? [] : [{ required: true, message: t('auth.passwordPlaceholder') }, { min: 8, message: t('auth.passwordPlaceholder') }]}>
            <Input size="large" type="password" placeholder={editing?.id ? t('admin.users.newPasswordTip') : t('auth.passwordPlaceholder')} />
          </FormItem>
          <FormItem name="roleKeys" label={t('admin.users.roles')}>
            <Checkbox options={roles.map((r) => ({ label: r.name, value: r.key }))} direction="horizontal" disabled={isSelf} />
          </FormItem>
          {editing?.id && (
            <FormItem name="status" label={t('admin.users.keepStatus')} valuePropName="checked">
              <Switch checkedChildren={t('common.enabled')} unCheckedChildren={t('common.disabled')} disabled={isSelf} />
            </FormItem>
          )}
          <FormItem>
            <Button type="primary" htmlType="submit" block loading={busy}>
              {t('common.save')}
            </Button>
          </FormItem>
        </Form>
      </Modal>

      <Modal
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
        {deleteTarget ? t('admin.users.deleteConfirm', { name: deleteTarget.displayName || deleteTarget.username }) : ''}
      </Modal>
    </div>
  );
}
