// 签注管理:类型 / 公告 / 配置 / 黑名单(Tabs)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Form, FormItem, Input, Modal, Select, Switch, Table, Tabs, Tag, Title, useForm } from 'animal-island-ui';
import { PlusIcon, TrashIcon, EditIcon, BanIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import AutoApproveSettings from '../../components/AutoApproveSettings.jsx';
import { TextArea, toastVisaError } from './shared.jsx';
import { toastSuccess, toastError } from '../../components/toast.js';
import { useConfirmAction } from '../../components/ConfirmAction.jsx';

function TypesTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null); // {} | type | null
  const [busy, setBusy] = useState(false);
  const [form] = useForm();

  const load = useCallback(async () => {
    try {
      const data = await api.get('/visa/admin/types');
      setItems(data.items);
    } catch (err) {
      toastVisaError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (values) => {
    setBusy(true);
    try {
      const payload = {
        name: values.name?.trim(),
        nameTw: values.nameTw?.trim() || '',
        description: values.description?.trim() ?? '',
        descriptionTw: values.descriptionTw?.trim() || '',
        guide: values.guide?.trim() ?? '',
        guideTw: values.guideTw?.trim() || '',
        stayDays: Number(values.stayDays) || 30,
        validDays: Number(values.validDays) || 90,
        renewable: !!values.renewable,
        enabled: !!values.enabled,
        sortOrder: Number(values.sortOrder) || 0,
      };
      if (editing?.id) {
        await api.patch(`/visa/admin/types/${editing.id}`, payload);
      } else {
        await api.post('/visa/admin/types', { ...payload, code: values.code?.trim().toUpperCase() });
      }
      toastSuccess(t('common.save'));
      setEditing(null);
      await load();
    } catch (err) {
      toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row, checked) => {
    try {
      await api.patch(`/visa/admin/types/${row.id}`, { enabled: checked });
      await load();
    } catch (err) {
      toastVisaError(t, err);
    }
  };

  const columns = [
    { title: t('common.key'), dataIndex: 'code', width: 120, render: (v) => <Tag variant="outlined">{v}</Tag> },
    { title: t('common.name'), dataIndex: 'name', width: 130 },
    { title: t('visa.typeMeta.stayShort'), dataIndex: 'stayDays', width: 100 },
    { title: t('visa.typeMeta.validShort'), dataIndex: 'validDays', width: 100 },
    { title: t('visa.typeMeta.renewable.title'), dataIndex: 'renewable', width: 90, render: (v) => (v ? t('common.yes') : t('common.no')) },
    {
      title: t('common.status'),
      dataIndex: 'enabled',
      width: 100,
      render: (v, record) => <Switch size="small" checked={v} onChange={(c) => toggle(record, c)} />,
    },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      render: (_, record) => (
        <Button
          type="default"
          size="small"
          icon={<EditIcon />}
          onClick={() => {
            setEditing(record);
            form.resetFields();
            form.setFieldsValue({
              ...record,
              name: record.nameCn ?? record.name,
              description: record.descriptionCn ?? record.description,
              guide: record.guideCn ?? record.guide,
            });
          }}
        >
          {t('common.edit')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <span className="muted-text">{t('visa.admin.typesTip')}</span>
        <Button
          type="primary"
          icon={<PlusIcon />}
          onClick={() => {
            setEditing({});
            form.resetFields();
            form.setFieldsValue({ stayDays: 30, validDays: 90, enabled: true, sortOrder: 0 });
          }}
        >
          {t('visa.admin.typesCreate')}
        </Button>
      </div>
      <Card>
        <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      </Card>

      <Modal
        maskClosable={false}
        open={editing !== null}
        title={editing?.id ? t('visa.admin.typesEdit') : t('visa.admin.typesCreate')}
        onClose={() => setEditing(null)}
        typewriter={false}
        width={560}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <FormItem name="code" label={t('common.key')} rules={[{ required: true, message: t('common.key') }]}>
            <Input size="large" disabled={!!editing?.id} placeholder={t('visa.admin.typesCodePh')} />
          </FormItem>
          <FormItem name="name" label={t('common.name')} rules={[{ required: true, message: t('common.name') }]}>
            <Input size="large" />
          </FormItem>
          <FormItem name="nameTw" label={`${t('common.name')} · ${t('common.traditional')}`}>
            <Input size="large" placeholder={t('common.twOptional')} />
          </FormItem>
          <FormItem name="description" label={t('common.description')}>
            <Input size="large" />
          </FormItem>
          <FormItem name="descriptionTw" label={`${t('common.description')} · ${t('common.traditional')}`}>
            <Input size="large" placeholder={t('common.twOptional')} />
          </FormItem>
          <FormItem name="guide" label={t('visa.admin.typesGuide')}>
            <TextArea rows={3} />
          </FormItem>
          <FormItem name="guideTw" label={`${t('visa.admin.typesGuide')} · ${t('common.traditional')}`}>
            <TextArea rows={3} placeholder={t('common.twOptional')} />
          </FormItem>
          <div className="visa-form-grid">
            <FormItem name="stayDays" label={t('visa.typeMeta.stayShort')}>
              <Input size="large" type="number" />
            </FormItem>
            <FormItem name="validDays" label={t('visa.typeMeta.validShort')}>
              <Input size="large" type="number" />
            </FormItem>
            <FormItem name="sortOrder" label={t('visa.admin.sortOrder')}>
              <Input size="large" type="number" />
            </FormItem>
          </div>
          <FormItem name="renewable" label={t('visa.typeMeta.renewable.title')} valuePropName="checked">
            <Switch />
          </FormItem>
          <FormItem name="enabled" label={t('common.status')} valuePropName="checked">
            <Switch checkedChildren={t('common.enabled')} unCheckedChildren={t('common.disabled')} />
          </FormItem>
          <FormItem>
            <div className="form-actions">
              <Button onClick={() => setEditing(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button type="primary" htmlType="submit" loading={busy} disabled={busy}>
                {t('common.save')}
              </Button>
            </div>
          </FormItem>
        </Form>
      </Modal>
    </div>
  );
}

function NoticesTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [titleTw, setTitleTw] = useState('');
  const [bodyTw, setBodyTw] = useState('');
  const [level, setLevel] = useState('info');
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const load = useCallback(async () => {
    try {
      const data = await api.get('/visa/admin/notices');
      setItems(data.items);
    } catch (err) {
      toastVisaError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = (notice) => {
    setEditing(notice ?? {});
    setTitle(notice?.titleCn ?? notice?.title ?? '');
    setBody(notice?.bodyCn ?? notice?.body ?? '');
    setTitleTw(notice?.titleTw ?? '');
    setBodyTw(notice?.bodyTw ?? '');
    setLevel(notice?.level ?? 'info');
  };

  const submit = async () => {
    if (!title.trim() || !body.trim()) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      if (editing?.id) {
        await api.patch(`/visa/admin/notices/${editing.id}`, { title, body, titleTw, bodyTw, level });
      } else {
        await api.post('/visa/admin/notices', { title, body, titleTw, bodyTw, level });
      }
      toastSuccess(t('common.save'));
      setEditing(null);
      await load();
    } catch (err) {
      toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (notice, checked) => {
    try {
      await api.patch(`/visa/admin/notices/${notice.id}`, { enabled: checked });
      await load();
    } catch (err) {
      toastVisaError(t, err);
    }
  };

  const askRemove = (notice) => {
    confirm({
      title: t('common.confirmDeleteTitle'),
      tip: t('visa.admin.noticeDeleteConfirm', { title: notice.title }),
      confirmText: t('common.delete'),
      action: () => api.del(`/visa/admin/notices/${notice.id}`),
      success: t('common.deleted'),
      onDone: load,
      onError: (err) => toastVisaError(t, err),
    });
  };

  const columns = [
    { title: t('common.name'), dataIndex: 'title' },
    {
      title: t('visa.admin.noticeLevel'),
      dataIndex: 'level',
      width: 110,
      render: (v) => <Tag variant="soft">{t(`visa.noticeLevel.${v}`)}</Tag>,
    },
    {
      title: t('common.status'),
      dataIndex: 'enabled',
      width: 100,
      render: (v, record) => <Switch size="small" checked={v} onChange={(c) => toggle(record, c)} />,
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
          <Button type="default" size="small" danger icon={<TrashIcon />} onClick={() => askRemove(record)}>
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <span className="muted-text">{t('visa.admin.noticesTip')}</span>
        <Button type="primary" icon={<PlusIcon />} onClick={() => openEdit(null)}>
          {t('visa.admin.noticesCreate')}
        </Button>
      </div>
      <Card>
        <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      </Card>

      <Modal
        maskClosable={false}
        open={editing !== null}
        title={editing?.id ? t('visa.admin.noticesEdit') : t('visa.admin.noticesCreate')}
        onClose={() => setEditing(null)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={busy || !title.trim() || !body.trim()} onClick={submit}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="visa-action-form">
          <p>{t('common.name')}</p>
          <Input size="large" value={title} onChange={(e) => setTitle(e.target.value)} />
          <p>{t('common.name')} · {t('common.traditional')}</p>
          <Input size="large" value={titleTw} placeholder={t('common.twOptional')} onChange={(e) => setTitleTw(e.target.value)} />
          <p>{t('visa.admin.noticeLevel')}</p>
          <Select
            value={level}
            onChange={setLevel}
            options={['info', 'policy', 'event'].map((l) => ({ key: l, label: t(`visa.noticeLevel.${l}`) }))}
          />
          <p>{t('common.description')}</p>
          <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          <p>{t('common.description')} · {t('common.traditional')}</p>
          <TextArea value={bodyTw} placeholder={t('common.twOptional')} onChange={(e) => setBodyTw(e.target.value)} rows={4} />
        </div>
      </Modal>

      {confirmDialog}
    </div>
  );
}

function ConfigTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/visa/admin/config')
      .then((data) => {
        setItems(data.items);
        setValues(Object.fromEntries(data.items.map((row) => [row.key, row.value])));
      })
      .catch((err) => toastVisaError(t, err));
  }, [t]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/visa/admin/config', values);
      toastSuccess(t('common.save'));
    } catch (err) {
      toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const LABELS = {
    'visa.app_no_prefix': t('visa.admin.configAppNoPrefix'),
    'visa.visa_no_prefix': t('visa.admin.configVisaNoPrefix'),
    'visa.supplement_days': t('visa.admin.configSupplementDays'),
    'visa.review_hours_hint': t('visa.admin.configReviewHours'),
    'visa.verify_limit_per_5min': t('visa.admin.configVerifyLimit'),
  };

  return (
    <>
      <Card>
        <AutoApproveSettings service="visa" />
      </Card>
      <Card>
        {items === null && <p className="muted-text">{t('common.loading')}</p>}
        {items !== null && (
          <div className="visa-config-form">
            {items.map((row) => (
              <div key={row.key} className="visa-config-row">
                <label htmlFor={`visa-config-${row.key}`}>{LABELS[row.key] || t('common.unknown')}</label>
                <Input
                  id={`visa-config-${row.key}`}
                  size="middle"
                  value={values[row.key] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [row.key]: e.target.value }))}
                />
              </div>
            ))}
            <Button type="primary" loading={busy} onClick={save} disabled={busy}>
              {t('common.save')}
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}

function BlacklistTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const load = useCallback(async () => {
    try {
      const data = await api.get('/visa/admin/blacklist');
      setItems(data.items);
    } catch (err) {
      toastVisaError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!userId.trim()) return;
    setBusy(true);
    try {
      await api.post('/visa/admin/blacklist', { userId: Number(userId), reason });
      toastSuccess(t('common.save'));
      setUserId('');
      setReason('');
      await load();
    } catch (err) {
      toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const askRemove = (row) => {
    confirm({
      title: t('visa.admin.blacklistRemove'),
      tip: t('visa.admin.blacklistRemoveConfirm', { user: `${row.username} (#${row.userId})` }),
      confirmText: t('visa.admin.blacklistRemove'),
      action: () => api.del(`/visa/admin/blacklist/${row.userId}`),
      success: t('visa.admin.blacklistRemoved'),
      onDone: load,
      onError: (err) => toastVisaError(t, err),
    });
  };

  const columns = [
    { title: t('visa.admin.userId'), dataIndex: 'userId', width: 90 },
    { title: t('admin.users.username'), dataIndex: 'username', width: 140 },
    { title: t('visa.admin.blacklistReason'), dataIndex: 'reason' },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 120,
      render: (_, record) => (
        <Button type="default" size="small" danger icon={<TrashIcon />} onClick={() => askRemove(record)}>
          {t('common.delete')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Card className="visa-blacklist-form">
        <div className="visa-config-row">
          <label htmlFor="visa-blacklist-user">{t('visa.admin.userId')}</label>
          <Input id="visa-blacklist-user" size="middle" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="3" />
        </div>
        <div className="visa-config-row">
          <label htmlFor="visa-blacklist-reason">{t('visa.admin.blacklistReason')}</label>
          <Input id="visa-blacklist-reason" size="middle" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Button type="primary" icon={<BanIcon />} loading={busy} onClick={add} disabled={busy}>
          {t('visa.admin.blacklistAdd')}
        </Button>
      </Card>
      <Card>
        <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      </Card>
      {confirmDialog}
    </div>
  );
}

export default function VisaAdminManage() {
  const { t } = useTranslation();
  return (
    <div>
      <Title size="middle">{t('visa.admin.manage.title')}</Title>
      <Tabs
        items={[
          { key: 'types', label: t('visa.admin.manage.types'), children: <TypesTab /> },
          { key: 'notices', label: t('visa.admin.manage.notices'), children: <NoticesTab /> },
          { key: 'config', label: t('visa.admin.manage.config'), children: <ConfigTab /> },
          { key: 'blacklist', label: t('visa.admin.manage.blacklist'), children: <BlacklistTab /> },
        ]}
      />
    </div>
  );
}
