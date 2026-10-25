import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Form, FormItem, Input, Modal, Notification, Select, Switch, Table, Tabs, Tag, Title, useForm,
} from 'animal-island-ui';
import { EditIcon, PlusIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastApiError } from '../../../components/immigration/apiError.js';
import { ImAdminNav, StatusTag } from '../../../components/immigration/shared.jsx';

const PORT_TYPES = ['land', 'air', 'sea'];
const PORT_STATUSES = ['open', 'closed', 'maintenance'];
const CHANNEL_TYPES = ['normal', 'reserved', 'special'];
const LEVELS = ['info', 'warning', 'critical'];

function PortsTab() {
  const { t } = useTranslation();
  const [ports, setPorts] = useState(null);
  const [editing, setEditing] = useState(null); // {} create | port edit
  const [channelTarget, setChannelTarget] = useState(null);
  const [form] = useForm();
  const [channelForm] = useForm();

  const load = useCallback(() => {
    api
      .get('/immigration/admin/ports')
      .then((data) => setPorts(data.items))
      .catch((err) => {
        toastApiError(err);
        setPorts([]);
      });
  }, []);

  useEffect(load, [load]);

  const savePort = async (values) => {
    try {
      if (editing?.id) {
        await api.patch(`/immigration/admin/ports/${editing.id}`, values);
      } else {
        await api.post('/immigration/admin/ports', values);
      }
      Notification.success(t('common.save'));
      setEditing(null);
      load();
    } catch (err) {
      toastApiError(err);
    }
  };

  const changeStatus = async (port, status) => {
    try {
      await api.post(`/immigration/admin/ports/${port.id}/status`, { status });
      Notification.success(t('common.save'));
      load();
    } catch (err) {
      toastApiError(err);
    }
  };

  const addChannel = async (values) => {
    try {
      await api.post(`/immigration/admin/ports/${channelTarget.id}/channels`, values);
      Notification.success(t('common.save'));
      setChannelTarget(null);
      load();
    } catch (err) {
      toastApiError(err);
    }
  };

  const toggleChannel = async (channel, enabled) => {
    try {
      await api.patch(`/immigration/admin/channels/${channel.id}`, { enabled });
      load();
    } catch (err) {
      toastApiError(err);
    }
  };

  const columns = [
    { title: t('common.name'), dataIndex: 'name', width: 120 },
    { title: t('common.key'), dataIndex: 'code', width: 120 },
    { title: t('imm.admin.portType'), dataIndex: 'type', width: 100, render: (v) => t(`imm.portType.${v}`) },
    { title: t('common.status'), dataIndex: 'status', width: 100, render: (v) => <StatusTag value={v} i18nPrefix="imm.portStatus" /> },
    { title: t('imm.admin.openHours'), dataIndex: 'openHours', width: 170 },
    {
      title: t('imm.admin.channels'),
      dataIndex: 'channels',
      render: (_, record) =>
        (record.channels ?? []).map((c) => (
          <Tag key={c.id} size="small" color={c.enabled ? 'app-teal' : 'default'} variant="soft">
            {c.name}
          </Tag>
        )),
    },
    {
      title: t('common.actions'),
      width: 300,
      render: (_, record) => (
        <div className="table-actions">
          <Select
            value={record.status}
            onChange={(status) => changeStatus(record, status)}
            options={PORT_STATUSES.map((s) => ({ key: s, label: t(`imm.portStatus.${s}`) }))}
            aria-label={t('imm.admin.portStatus')}
          />
          <Button type="default" size="small" icon={<EditIcon />} onClick={() => { setEditing(record); form.resetFields(); form.setFieldsValue({ name: record.name, type: record.type, openHours: record.openHours, notice: record.notice, mapDesc: record.mapDesc }); }}>
            {t('common.edit')}
          </Button>
          <Button type="default" size="small" icon={<PlusIcon />} onClick={() => { setChannelTarget(record); channelForm.resetFields(); }}>
            {t('imm.admin.addChannel')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="im-tab-toolbar">
        <Button type="primary" icon={<PlusIcon />} onClick={() => { setEditing({}); form.resetFields(); }}>
          {t('imm.admin.createPort')}
        </Button>
      </div>
      <Table columns={columns} dataSource={ports ?? []} loading={ports === null} rowKey="id" pagination={false} />

      <Modal
        open={editing !== null}
        title={editing?.id ? t('imm.admin.editPort') : t('imm.admin.createPort')}
        onClose={() => setEditing(null)}
        footer={null}
        width={560}
        typewriter={false}
      >
        <Form form={form} layout="vertical" onFinish={savePort}>
          {!editing?.id && (
            <FormItem name="code" label={t('common.key')} rules={[{ required: true, pattern: /^[A-Z][A-Z0-9_]{2,19}$/, message: t('imm.admin.portCodeTip') }]}>
              <Input size="large" placeholder="ROYAL_PORT" disabled={!!editing?.id} />
            </FormItem>
          )}
          <FormItem name="name" label={t('common.name')} rules={[{ required: true }]}>
            <Input size="large" />
          </FormItem>
          <FormItem name="type" label={t('imm.admin.portType')} rules={[{ required: true }]}>
            <Select options={PORT_TYPES.map((p) => ({ key: p, label: t(`imm.portType.${p}`) }))} value={form.getFieldValue('type') ?? 'land'} onChange={(v) => form.setFieldValue('type', v)} />
          </FormItem>
          <FormItem name="openHours" label={t('imm.admin.openHours')}>
            <Input size="large" placeholder="09:00 - 21:00" />
          </FormItem>
          <FormItem name="notice" label={t('imm.ports.notice')}>
            <Input size="large" maxLength={300} />
          </FormItem>
          <FormItem name="mapDesc" label={t('imm.admin.mapDesc')}>
            <Input size="large" maxLength={500} />
          </FormItem>
          <FormItem>
            <Button type="primary" htmlType="submit" block>{t('common.save')}</Button>
          </FormItem>
        </Form>
      </Modal>

      <Modal
        open={channelTarget !== null}
        title={`${t('imm.admin.addChannel')} · ${channelTarget?.name ?? ''}`}
        onClose={() => setChannelTarget(null)}
        footer={null}
        width={480}
        typewriter={false}
      >
        <Form form={channelForm} layout="vertical" onFinish={addChannel} initialValues={{ type: 'normal' }}>
          <FormItem name="name" label={t('common.name')} rules={[{ required: true }]}>
            <Input size="large" />
          </FormItem>
          <FormItem name="type" label={t('imm.admin.channelType')} rules={[{ required: true }]}>
            <Select options={CHANNEL_TYPES.map((c) => ({ key: c, label: t(`imm.channelType.${c}`) }))} value={channelForm.getFieldValue('type') ?? 'normal'} onChange={(v) => channelForm.setFieldValue('type', v)} />
          </FormItem>
          <FormItem name="description" label={t('common.description')}>
            <Input size="large" maxLength={120} />
          </FormItem>
          <FormItem>
            <Button type="primary" htmlType="submit" block>{t('common.save')}</Button>
          </FormItem>
        </Form>
      </Modal>

      {ports?.some((p) => (p.channels ?? []).length > 0) && (
        <Card className="im-channel-manager">
          <b>{t('imm.admin.channelManager')}</b>
          {ports.filter((p) => (p.channels ?? []).length > 0).map((p) => (
            <div key={p.id} className="im-channel-manage-row">
              <b className="im-channel-port">{p.name}:</b>
              {p.channels.map((c) => (
                <span key={c.id} className="im-channel-switch">
                  <span>{c.name}</span>
                  <Switch size="small" checked={!!c.enabled} onChange={(v) => toggleChannel(c, v)} />
                </span>
              ))}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function AnnouncementsTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [ports, setPorts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form] = useForm();

  const load = useCallback(() => {
    api
      .get('/immigration/admin/announcements')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastApiError(err);
        setItems([]);
      });
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    api.get('/immigration/admin/ports').then((d) => setPorts(d.items)).catch(() => {});
  }, []);

  const save = async (values) => {
    try {
      const portId = values.portId === 'none' ? null : Number(values.portId);
      if (editing?.id) {
        await api.patch(`/immigration/admin/announcements/${editing.id}`, { ...values, portId });
      } else {
        await api.post('/immigration/admin/announcements', { ...values, portId });
      }
      Notification.success(t('common.save'));
      setEditing(null);
      load();
    } catch (err) {
      toastApiError(err);
    }
  };

  const offline = async (row) => {
    try {
      await api.post(`/immigration/admin/announcements/${row.id}/offline`);
      load();
    } catch (err) {
      toastApiError(err);
    }
  };

  const remove = async (row) => {
    try {
      await api.del(`/immigration/admin/announcements/${row.id}`);
      load();
    } catch (err) {
      toastApiError(err);
    }
  };

  const columns = [
    { title: t('common.name'), dataIndex: 'title', width: 220 },
    { title: t('imm.admin.level'), dataIndex: 'level', width: 90, render: (v) => <Tag color={v === 'critical' ? 'app-red' : v === 'warning' ? 'app-yellow' : 'app-blue'} variant="soft">{t(`imm.level.${v}`)}</Tag> },
    { title: t('imm.declare.port'), dataIndex: 'portName', width: 110, render: (v) => v ?? t('imm.admin.globalAnn') },
    { title: t('common.status'), dataIndex: 'status', width: 90, render: (v) => (v === 'published' ? <Tag color="app-green" variant="soft">{t('imm.admin.published')}</Tag> : <Tag>{t('imm.admin.offline')}</Tag>) },
    { title: t('common.createdAt'), dataIndex: 'publishedAt', width: 120, render: (v) => v?.slice(0, 10) },
    {
      title: t('common.actions'),
      width: 220,
      render: (_, record) => (
        <div className="table-actions">
          <Button type="default" size="small" icon={<EditIcon />} onClick={() => { setEditing(record); form.resetFields(); form.setFieldsValue({ title: record.title, body: record.body, level: record.level, portId: record.portId ? String(record.portId) : 'none' }); }}>
            {t('common.edit')}
          </Button>
          {record.status === 'published' && (
            <Button type="default" size="small" onClick={() => offline(record)}>{t('imm.admin.takeOffline')}</Button>
          )}
          <Button type="default" size="small" danger onClick={() => remove(record)}>{t('common.delete')}</Button>
        </div>
      ),
    },
  ];

  const levelValue = form.getFieldValue('level') ?? 'info';

  return (
    <>
      <div className="im-tab-toolbar">
        <Button type="primary" icon={<PlusIcon />} onClick={() => { setEditing({}); form.resetFields(); form.setFieldsValue({ level: 'info', portId: 'none' }); }}>
          {t('imm.admin.createAnn')}
        </Button>
      </div>
      <Table columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={{ defaultPageSize: 10, showTotal: true }} />

      <Modal
        open={editing !== null}
        title={editing?.id ? t('imm.admin.editAnn') : t('imm.admin.createAnn')}
        onClose={() => setEditing(null)}
        footer={null}
        width={560}
        typewriter={false}
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <FormItem name="title" label={t('common.name')} rules={[{ required: true }]}>
            <Input size="large" maxLength={80} />
          </FormItem>
          <FormItem name="body" label={t('imm.admin.annBody')} rules={[{ required: true }]}>
            <Input size="large" maxLength={1000} />
          </FormItem>
          <FormItem name="level" label={t('imm.admin.level')} rules={[{ required: true }]}>
            <Select options={LEVELS.map((l) => ({ key: l, label: t(`imm.level.${l}`) }))} value={levelValue} onChange={(v) => form.setFieldValue('level', v)} />
          </FormItem>
          <FormItem name="portId" label={t('imm.admin.annPort')}>
            <Select
              options={[{ key: 'none', label: t('imm.admin.globalAnn') }, ...ports.map((p) => ({ key: String(p.id), label: p.name }))]}
              value={form.getFieldValue('portId') ?? 'none'}
              onChange={(v) => form.setFieldValue('portId', v)}
            />
          </FormItem>
          <FormItem>
            <Button type="primary" htmlType="submit" block>{t('common.save')}</Button>
          </FormItem>
        </Form>
      </Modal>
    </>
  );
}

export default function AdminImPorts() {
  const { t } = useTranslation();
  return (
    <div className="im-page">
      <ImAdminNav />
      <div className="page-header">
        <Title size="middle" color="app-orange">
          {t('imm.admin.portsTitle')}
        </Title>
      </div>
      <Card>
        <Tabs
          items={[
            { key: 'ports', label: t('imm.admin.tabPorts'), children: <PortsTab /> },
            { key: 'announcements', label: t('imm.admin.tabAnnouncements'), children: <AnnouncementsTab /> },
          ]}
        />
      </Card>
    </div>
  );
}
