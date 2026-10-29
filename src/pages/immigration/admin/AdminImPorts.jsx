import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Form, FormItem, Input, Modal, Select, Switch, Table, Tabs, Tag, Title, useForm } from 'animal-island-ui';
import { EditIcon, PlusIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastApiError } from '../../../components/immigration/apiError.js';
import { ImAdminNav, StatusTag } from '../../../components/immigration/shared.jsx';
import { toastSuccess } from '../../../components/toast.js';
import { fmtDate } from '../../../lib/date.js';

const PORT_TYPES = ['land', 'air', 'sea'];
const PORT_STATUSES = ['open', 'closed', 'maintenance'];
const CHANNEL_TYPES = ['normal', 'reserved', 'special'];
const LEVELS = ['info', 'warning', 'critical'];

function PortsTab() {
  const { t } = useTranslation();
  const [ports, setPorts] = useState(null);
  const [editing, setEditing] = useState(null); // {} create | port edit
  const [channelTarget, setChannelTarget] = useState(null);
  const [busy, setBusy] = useState(false); // 口岸弹窗提交中
  const [channelBusy, setChannelBusy] = useState(false); // 通道弹窗提交中
  const [togglingId, setTogglingId] = useState(null); // 正在切换的通道 id
  const [statusBusyId, setStatusBusyId] = useState(null); // 正在改状态的口岸 id
  const [form] = useForm();
  const [channelForm] = useForm();

  const load = useCallback(() => {
    return api
      .get('/immigration/admin/ports')
      .then((data) => setPorts(data.items))
      .catch((err) => {
        toastApiError(err);
        setPorts([]);
      });
  }, []);

  useEffect(load, [load]);

  const savePort = async (values) => {
    if (busy) return; // 双击会创建两个同码口岸
    setBusy(true);
    try {
      if (editing?.id) {
        await api.patch(`/immigration/admin/ports/${editing.id}`, values);
      } else {
        await api.post('/immigration/admin/ports', values);
      }
      setEditing(null);
      toastSuccess(t('common.save'));
      await load();
    } catch (err) {
      // 失败保持弹窗,让管理员能改完重提
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (port, status) => {
    // 状态下拉一次只飞一个请求:连点两个状态会并发提交,最后落库的是哪个不可预期。
    if (statusBusyId !== null) return;
    setStatusBusyId(port.id);
    try {
      await api.post(`/immigration/admin/ports/${port.id}/status`, { status });
      toastSuccess(t('imm.admin.portStatusUpdated', { status: t(`imm.portStatus.${status}`) }));
      await load();
    } catch (err) {
      toastApiError(err);
    } finally {
      setStatusBusyId(null);
    }
  };

  const addChannel = async (values) => {
    if (channelBusy) return;
    setChannelBusy(true);
    try {
      await api.post(`/immigration/admin/ports/${channelTarget.id}/channels`, values);
      setChannelTarget(null);
      toastSuccess(t('common.save'));
      await load();
    } catch (err) {
      toastApiError(err);
    } finally {
      setChannelBusy(false);
    }
  };

  const toggleChannel = async (channel, enabled) => {
    if (togglingId !== null) return; // 一次只允许一个开关在飞
    setTogglingId(channel.id);
    try {
      await api.patch(`/immigration/admin/channels/${channel.id}`, { enabled });
      await load();
    } catch (err) {
      toastApiError(err);
    } finally {
      setTogglingId(null);
    }
  };

  // 弹窗只能显式关闭,且提交中不许关(maskClosable={false} + busy 时忽略取消)
  const closePortModal = () => {
    if (busy) return;
    form.resetFields();
    setEditing(null);
  };

  const closeChannelModal = () => {
    if (channelBusy) return;
    channelForm.resetFields();
    setChannelTarget(null);
  };

  const columns = [
    { title: t('common.name'), dataIndex: 'name', width: 120 },
    { title: t('common.key'), dataIndex: 'code', width: 120 },
    { title: t('imm.admin.portTypeLabel'), dataIndex: 'type', width: 100, render: (v) => t(`imm.portType.${v}`) },
    { title: t('common.status'), dataIndex: 'status', width: 100, render: (v) => <StatusTag value={v} i18nPrefix="imm.portStatus" /> },
    { title: t('imm.admin.openHours'), dataIndex: 'openHours', width: 170 },
    {
      title: t('imm.admin.channels'),
      dataIndex: 'channels',
      render: (_, record) =>
        (record.channels ?? []).map((c) => (
          <Tag key={c.id} size="small" color={c.enabled ? 'app-green' : 'brown'} variant="soft">
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
            disabled={statusBusyId !== null}
          />
          <Button type="default" size="small" icon={<EditIcon />} onClick={() => { setEditing(record); form.resetFields(); form.setFieldsValue({ name: record.nameCn ?? record.name, nameTw: record.nameTw ?? '', type: record.type, openHours: record.openHoursCn ?? record.openHours, openHoursTw: record.openHoursTw ?? '', notice: record.noticeCn ?? record.notice, noticeTw: record.noticeTw ?? '', mapDesc: record.mapDescCn ?? record.mapDesc, mapDescTw: record.mapDescTw ?? '' }); }}>
            {t('common.edit')}
          </Button>
          <Button type="default" size="small" icon={<PlusIcon />} onClick={() => { setChannelTarget(record); channelForm.resetFields(); channelForm.setFieldsValue({ type: 'normal' }); }}>
            {t('imm.admin.addChannel')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="im-tab-toolbar">
        <Button type="primary" icon={<PlusIcon />} onClick={() => { setEditing({}); form.resetFields(); form.setFieldsValue({ type: 'land' }); }}>
          {t('imm.admin.createPort')}
        </Button>
      </div>
      <Table className="table-fit" columns={columns} dataSource={ports ?? []} loading={ports === null} rowKey="id" pagination={false} />

      <Modal
        maskClosable={false}
        open={editing !== null}
        title={editing?.id ? t('imm.admin.editPort') : t('imm.admin.createPort')}
        onClose={closePortModal}
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
          <FormItem name="nameTw" label={`${t('common.name')} · ${t('common.traditional')}`}>
            <Input size="large" placeholder={t('common.twOptional')} />
          </FormItem>
          <FormItem name="type" label={t('imm.admin.portTypeLabel')} rules={[{ required: true }]}>
            <Select options={PORT_TYPES.map((p) => ({ key: p, label: t(`imm.portType.${p}`) }))} />
          </FormItem>
          <FormItem name="openHours" label={t('imm.admin.openHours')}>
            <Input size="large" placeholder="09:00 - 21:00" />
          </FormItem>
          <FormItem name="openHoursTw" label={`${t('imm.admin.openHours')} · ${t('common.traditional')}`}>
            <Input size="large" placeholder={t('common.twOptional')} />
          </FormItem>
          <FormItem name="notice" label={t('imm.ports.notice')}>
            <Input size="large" maxLength={300} />
          </FormItem>
          <FormItem name="noticeTw" label={`${t('imm.ports.notice')} · ${t('common.traditional')}`}>
            <Input size="large" maxLength={300} placeholder={t('common.twOptional')} />
          </FormItem>
          <FormItem name="mapDesc" label={t('imm.admin.mapDesc')}>
            <Input size="large" maxLength={500} />
          </FormItem>
          <FormItem name="mapDescTw" label={`${t('imm.admin.mapDesc')} · ${t('common.traditional')}`}>
            <Input size="large" maxLength={500} placeholder={t('common.twOptional')} />
          </FormItem>
          <FormItem>
            <div className="form-actions">
              <Button onClick={closePortModal} disabled={busy}>
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
        open={channelTarget !== null}
        title={`${t('imm.admin.addChannel')} · ${channelTarget?.name ?? ''}`}
        onClose={closeChannelModal}
        footer={null}
        width={480}
        typewriter={false}
      >
        <Form form={channelForm} layout="vertical" onFinish={addChannel} initialValues={{ type: 'normal' }}>
          <FormItem name="name" label={t('common.name')} rules={[{ required: true }]}>
            <Input size="large" />
          </FormItem>
          <FormItem name="nameTw" label={`${t('common.name')} · ${t('common.traditional')}`}>
            <Input size="large" placeholder={t('common.twOptional')} />
          </FormItem>
          <FormItem name="type" label={t('imm.admin.channelType')} rules={[{ required: true }]}>
            <Select options={CHANNEL_TYPES.map((c) => ({ key: c, label: t(`imm.channelType.${c}`) }))} />
          </FormItem>
          <FormItem name="description" label={t('common.description')}>
            <Input size="large" maxLength={120} />
          </FormItem>
          <FormItem name="descriptionTw" label={`${t('common.description')} · ${t('common.traditional')}`}>
            <Input size="large" maxLength={120} placeholder={t('common.twOptional')} />
          </FormItem>
          <FormItem>
            <div className="form-actions">
              <Button onClick={closeChannelModal} disabled={channelBusy}>
                {t('common.cancel')}
              </Button>
              <Button type="primary" htmlType="submit" loading={channelBusy} disabled={channelBusy}>
                {t('common.save')}
              </Button>
            </div>
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
                  <Switch
                    size="small"
                    checked={!!c.enabled}
                    loading={togglingId === c.id}
                    disabled={togglingId === c.id}
                    onChange={(v) => toggleChannel(c, v)}
                  />
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
  const [offlineTarget, setOfflineTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false); // 公告弹窗提交中
  const [rowBusy, setRowBusy] = useState(false); // 下线/删除确认弹窗执行中
  const [form] = useForm();

  const load = useCallback(() => {
    return api
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

  const closeAnnModal = () => {
    if (busy) return;
    form.resetFields();
    setEditing(null);
  };

  const save = async (values) => {
    if (busy) return;
    setBusy(true);
    try {
      const portId = values.portId === 'none' ? null : Number(values.portId);
      if (editing?.id) {
        await api.patch(`/immigration/admin/announcements/${editing.id}`, { ...values, portId });
      } else {
        await api.post('/immigration/admin/announcements', { ...values, portId });
      }
      setEditing(null);
      toastSuccess(t('common.save'));
      await load();
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  // 下线不可逆:服务端 PATCH 不改 status,下线后无法再发布回去,所以要先确认。
  const confirmOffline = async () => {
    if (!offlineTarget || rowBusy) return;
    setRowBusy(true);
    try {
      await api.post(`/immigration/admin/announcements/${offlineTarget.id}/offline`);
      setOfflineTarget(null);
      toastSuccess(t('imm.admin.offlineDone'));
      await load();
    } catch (err) {
      toastApiError(err);
    } finally {
      setRowBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || rowBusy) return;
    setRowBusy(true);
    try {
      await api.del(`/immigration/admin/announcements/${deleteTarget.id}`);
      setDeleteTarget(null);
      toastSuccess(t('common.deleted'));
      await load();
    } catch (err) {
      toastApiError(err);
    } finally {
      setRowBusy(false);
    }
  };

  const columns = [
    { title: t('common.name'), dataIndex: 'title', width: 220 },
    { title: t('imm.admin.level'), dataIndex: 'level', width: 90, render: (v) => <Tag color={v === 'critical' ? 'app-red' : v === 'warning' ? 'warm-peach-pink' : 'app-blue'} variant="soft">{t(`imm.level.${v}`)}</Tag> },
    { title: t('imm.declare.port'), dataIndex: 'portName', width: 110, render: (v) => v ?? t('imm.admin.globalAnn') },
    { title: t('common.status'), dataIndex: 'status', width: 90, render: (v) => (v === 'published' ? <Tag color="app-green" variant="soft">{t('imm.admin.published')}</Tag> : <Tag color="brown" variant="soft">{t('imm.admin.offline')}</Tag>) },
    { title: t('common.createdAt'), dataIndex: 'publishedAt', width: 120, render: (v) => fmtDate(v) },
    {
      title: t('common.actions'),
      width: 220,
      render: (_, record) => (
        <div className="table-actions">
          <Button type="default" size="small" icon={<EditIcon />} onClick={() => { setEditing(record); form.resetFields(); form.setFieldsValue({ title: record.titleCn ?? record.title, titleTw: record.titleTw ?? '', body: record.bodyCn ?? record.body, bodyTw: record.bodyTw ?? '', level: record.level, portId: record.portId ? String(record.portId) : 'none' }); }}>
            {t('common.edit')}
          </Button>
          {record.status === 'published' && (
            <Button type="default" size="small" onClick={() => setOfflineTarget(record)}>{t('imm.admin.takeOffline')}</Button>
          )}
          <Button type="default" size="small" danger onClick={() => setDeleteTarget(record)}>{t('common.delete')}</Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="im-tab-toolbar">
        <Button type="primary" icon={<PlusIcon />} onClick={() => { setEditing({}); form.resetFields(); form.setFieldsValue({ level: 'info', portId: 'none' }); }}>
          {t('imm.admin.createAnn')}
        </Button>
      </div>
      <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={{ defaultPageSize: 10, showTotal: true }} />

      <Modal
        maskClosable={false}
        open={editing !== null}
        title={editing?.id ? t('imm.admin.editAnn') : t('imm.admin.createAnn')}
        onClose={closeAnnModal}
        footer={null}
        width={560}
        typewriter={false}
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <FormItem name="title" label={t('common.name')} rules={[{ required: true }]}>
            <Input size="large" maxLength={80} />
          </FormItem>
          <FormItem name="titleTw" label={`${t('common.name')} · ${t('common.traditional')}`}>
            <Input size="large" maxLength={80} placeholder={t('common.twOptional')} />
          </FormItem>
          <FormItem name="body" label={t('imm.admin.annBody')} rules={[{ required: true }]}>
            <Input size="large" maxLength={1000} />
          </FormItem>
          <FormItem name="bodyTw" label={`${t('imm.admin.annBody')} · ${t('common.traditional')}`}>
            <Input size="large" maxLength={1000} placeholder={t('common.twOptional')} />
          </FormItem>
          <FormItem name="level" label={t('imm.admin.level')} rules={[{ required: true }]}>
            <Select options={LEVELS.map((l) => ({ key: l, label: t(`imm.level.${l}`) }))} />
          </FormItem>
          <FormItem name="portId" label={t('imm.admin.annPort')}>
            <Select
              options={[{ key: 'none', label: t('imm.admin.globalAnn') }, ...ports.map((p) => ({ key: String(p.id), label: p.name }))]}
            />
          </FormItem>
          <FormItem>
            <div className="form-actions">
              <Button onClick={closeAnnModal} disabled={busy}>
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
        open={offlineTarget !== null}
        title={t('imm.admin.offlineTitle')}
        onClose={() => {
          if (rowBusy) return;
          setOfflineTarget(null);
        }}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setOfflineTarget(null)} disabled={rowBusy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" danger loading={rowBusy} disabled={rowBusy} onClick={confirmOffline}>
              {t('imm.admin.takeOffline')}
            </Button>
          </>
        }
      >
        {offlineTarget ? t('imm.admin.offlineConfirm', { title: offlineTarget.title }) : ''}
      </Modal>

      <Modal
        maskClosable={false}
        open={deleteTarget !== null}
        title={t('common.confirmDeleteTitle')}
        onClose={() => {
          if (rowBusy) return;
          setDeleteTarget(null);
        }}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)} disabled={rowBusy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" danger loading={rowBusy} disabled={rowBusy} onClick={confirmDelete}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {deleteTarget ? t('imm.admin.annDeleteConfirm', { title: deleteTarget.title }) : ''}
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
        <h1 className="page-title">
          <Title size="middle" color="app-orange">
            {t('imm.admin.portsTitle')}
          </Title>
        </h1>
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
