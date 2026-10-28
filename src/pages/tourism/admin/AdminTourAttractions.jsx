// 景点管理:增删改查、上下线与开放状态、双语字段(简体 + 繁体成对编辑)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { EditIcon, MapIcon, PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastError, toastSuccess } from '../../../components/toast.js';
import {
  ATTRACTION_TYPES,
  ATTRACTION_TYPE_COLORS,
  OPEN_STATES,
  OPEN_STATE_COLORS,
  TextArea,
  fmtDateTime,
  toastTourError,
} from '../shared.jsx';
import { TourAdminNav } from '../TourismShell.jsx';
import { useDebouncedValue } from '../../../lib/useDebouncedValue.js';

const EMPTY_FORM = {
  id: null,
  name: '',
  nameTw: '',
  summary: '',
  summaryTw: '',
  description: '',
  descriptionTw: '',
  checkinPoints: '',
  checkinPointsTw: '',
  type: 'landmark',
  openState: 'open',
  status: 'online',
  sortOrder: '0',
};

function typeOptions(t) {
  return ATTRACTION_TYPES.map((value) => ({ key: value, label: t(`tour.type.${value}`) }));
}

function stateOptions(t) {
  return OPEN_STATES.map((value) => ({ key: value, label: t(`tour.openState.${value}`) }));
}

function statusOptions(t) {
  return [
    { key: 'online', label: t('tour.admin.status.online') },
    { key: 'offline', label: t('tour.admin.status.offline') },
  ];
}

export default function AdminTourAttractions() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  // 检索词 300ms 防抖:逐键输入不再每字打一次接口。
  const dq = useDebouncedValue(q, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (dq.trim()) params.set('q', dq.trim());
    try {
      const data = await api.get(`/tourism/admin/attractions?${params.toString()}`);
      setItems(data.items);
    } catch (err) {
      toastTourError(t, err);
      setItems([]);
    }
  }, [dq, statusFilter, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  // 编辑回填:简体输入绑 xxxCn(中间件在 zh-TW 下会把 xxx 换成繁体),繁体输入绑 xxxTw。
  const openEdit = (row) => {
    setForm({
      id: row.id,
      name: row.nameCn ?? row.name ?? '',
      nameTw: row.nameTw ?? '',
      summary: row.summaryCn ?? row.summary ?? '',
      summaryTw: row.summaryTw ?? '',
      description: row.descriptionCn ?? row.description ?? '',
      descriptionTw: row.descriptionTw ?? '',
      checkinPoints: row.checkinPointsCn ?? row.checkinPoints ?? '',
      checkinPointsTw: row.checkinPointsTw ?? '',
      type: row.type,
      openState: row.openState,
      status: row.status,
      sortOrder: String(row.sortOrder ?? 0),
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        nameTw: form.nameTw.trim(),
        summary: form.summary,
        summaryTw: form.summaryTw,
        description: form.description,
        descriptionTw: form.descriptionTw,
        checkinPoints: form.checkinPoints,
        checkinPointsTw: form.checkinPointsTw,
        type: form.type,
        openState: form.openState,
        status: form.status,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (form.id) await api.patch(`/tourism/admin/attractions/${form.id}`, payload);
      else await api.post('/tourism/admin/attractions', payload);
      setFormOpen(false);
      toastSuccess(t('common.saved'));
      await load();
    } catch (err) {
      toastTourError(t, err);
    } finally {
      setBusy(false);
    }
  };

  // 上下线是一组高频动作:走独立 status 端点,开放状态保持不变。
  const toggleStatus = async (row) => {
    try {
      await api.patch(`/tourism/admin/attractions/${row.id}/status`, {
        status: row.status === 'online' ? 'offline' : 'online',
      });
      toastSuccess(t(row.status === 'online' ? 'tour.admin.offlineDone' : 'tour.admin.onlineDone'));
      await load();
    } catch (err) {
      toastTourError(t, err);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.del(`/tourism/admin/attractions/${deleteTarget.id}`);
      setDeleteTarget(null);
      toastSuccess(t('common.deleted'));
      await load();
    } catch (err) {
      toastTourError(t, err);
    } finally {
      setDeleteBusy(false);
    }
  };

  const columns = [
    { title: t('tour.field.no'), dataIndex: 'no', width: 180 },
    { title: t('common.name'), dataIndex: 'name' },
    {
      title: t('common.name') + ' · ' + t('common.traditional'),
      dataIndex: 'nameTw',
      render: (v) => v || '-',
    },
    {
      title: t('tour.field.type'),
      dataIndex: 'type',
      width: 90,
      render: (v) => (
        <Tag size="small" color={ATTRACTION_TYPE_COLORS[v] || 'default'} variant="soft">
          {t(`tour.type.${v}`)}
        </Tag>
      ),
    },
    {
      title: t('tour.field.openState'),
      dataIndex: 'openState',
      width: 90,
      render: (v) => (
        <Tag size="small" color={OPEN_STATE_COLORS[v] || 'default'} variant="soft">
          {t(`tour.openState.${v}`)}
        </Tag>
      ),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 80,
      render: (v) => (
        <Tag size="small" color={v === 'online' ? 'app-green' : 'default'} variant="soft">
          {t(v === 'online' ? 'tour.admin.status.online' : 'tour.admin.status.offline')}
        </Tag>
      ),
    },
    { title: t('tour.field.sortOrder'), dataIndex: 'sortOrder', width: 70 },
    { title: t('tour.field.updatedAt'), dataIndex: 'updatedAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 210,
      render: (_, row) => (
        <div className="table-actions">
          <Button size="small" onClick={() => toggleStatus(row)}>
            {t(row.status === 'online' ? 'tour.admin.offline' : 'tour.admin.online')}
          </Button>
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
    <div>
      <TourAdminNav />
      <div className="page-header">
        <Title size="middle" color="app-orange">
          {t('tour.admin.attractions.title')}
        </Title>
      </div>

      <Card>
        <p className="muted-text">{t('tour.admin.attractions.tip')}</p>
        <div className="tour-filter-bar">
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={[{ key: '', label: t('tour.admin.allStatus') }, ...statusOptions(t)]}
            aria-label={t('common.status')}
          />
          <Input
            size="large"
            allowClear
            prefix={<MapIcon size={14} />}
            placeholder={t('tour.admin.attractions.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onClear={() => setQ('')}
          />
          <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
            {t('tour.admin.attractions.create')}
          </Button>
        </div>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('tour.admin.attractions.empty')}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={formOpen}
        title={form.id ? t('tour.admin.attractions.edit') : t('tour.admin.attractions.create')}
        onClose={() => {
          if (busy) return;
          setFormOpen(false);
        }}
        typewriter={false}
        width={640}
        footer={
          <>
            <Button onClick={() => setFormOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" loading={busy} disabled={busy || !form.name.trim()} onClick={save}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="tour-form">
          <div className="tour-form-grid">
            <label>
              {t('common.name')} *
              <Input
                size="large"
                value={form.name}
                maxLength={80}
                placeholder={t('tour.admin.attractions.namePlaceholder')}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              {t('common.name')} · {t('common.traditional')}
              <Input
                size="large"
                value={form.nameTw}
                maxLength={80}
                placeholder={t('common.twOptional')}
                onChange={(e) => setForm({ ...form, nameTw: e.target.value })}
              />
            </label>
            <label>
              {t('tour.field.type')}
              <Select value={form.type} onChange={(key) => setForm({ ...form, type: key })} options={typeOptions(t)} />
            </label>
            <label>
              {t('tour.field.openState')}
              <Select
                value={form.openState}
                onChange={(key) => setForm({ ...form, openState: key })}
                options={stateOptions(t)}
              />
            </label>
            <label>
              {t('common.status')}
              <Select
                value={form.status}
                onChange={(key) => setForm({ ...form, status: key })}
                options={statusOptions(t)}
              />
            </label>
            <label>
              {t('tour.field.sortOrder')}
              <Input
                size="large"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value.replace(/\D/g, '') })}
              />
            </label>
          </div>
          <label>
            {t('tour.field.summary')}
            <TextArea rows={2} maxLength={200} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </label>
          <label>
            {t('tour.field.summary')} · {t('common.traditional')}
            <TextArea rows={2} maxLength={200} value={form.summaryTw} onChange={(e) => setForm({ ...form, summaryTw: e.target.value })} />
          </label>
          <label>
            {t('tour.field.description')}
            <TextArea rows={4} maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label>
            {t('tour.field.description')} · {t('common.traditional')}
            <TextArea rows={4} maxLength={4000} value={form.descriptionTw} onChange={(e) => setForm({ ...form, descriptionTw: e.target.value })} />
          </label>
          <label>
            {t('tour.field.checkinPoints')}
            <TextArea
              rows={3}
              value={form.checkinPoints}
              placeholder={t('tour.admin.attractions.pointsPlaceholder')}
              onChange={(e) => setForm({ ...form, checkinPoints: e.target.value })}
            />
          </label>
          <label>
            {t('tour.field.checkinPoints')} · {t('common.traditional')}
            <TextArea rows={3} value={form.checkinPointsTw} onChange={(e) => setForm({ ...form, checkinPointsTw: e.target.value })} />
          </label>
          <p className="muted-text tour-config-tip">{t('tour.admin.attractions.pointsTip')}</p>
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
            <Button type="primary" danger loading={deleteBusy} disabled={deleteBusy} onClick={remove}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="muted-text">{t('tour.admin.attractions.deleteTip', { name: deleteTarget?.name ?? '' })}</p>
      </Modal>
    </div>
  );
}
