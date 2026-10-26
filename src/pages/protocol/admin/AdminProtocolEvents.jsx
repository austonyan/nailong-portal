// 活动发布与管理:创建/编辑、状态机(发布/截止/开始/结束/取消)、公告与删除。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Drawer,
  Input,
  Modal,
  Pagination,
  Select,
  Switch,
  Table,
  Tag,
  Title,
} from 'animal-island-ui';
import { EditIcon, PlusIcon, SendIcon, TrashIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import {
  StatusTag,
  TextArea,
  fmtDateTime,
  toastProtocolError,
} from '../shared.jsx';
import { toastError, toastSuccess } from '../shared.jsx';

const STATUSES = ['draft', 'pending_publish', 'registration', 'registration_closed', 'ongoing', 'ended', 'cancelled'];
const MATERIAL_KINDS = ['intro', 'letter', 'proof', 'community', 'other'];
const COLORS = ['app-teal', 'app-orange', 'app-pink', 'app-blue', 'purple', 'app-green', 'app-yellow'];
const EMPTY_FORM = {
  typeCode: 'CULTURE',
  title: '',
  titleTw: '',
  subtitle: '',
  subtitleTw: '',
  description: '',
  descriptionTw: '',
  schedule: [{ time: '', title: '', titleTw: '' }],
  venueName: '',
  venueNameTw: '',
  venueNote: '',
  venueNoteTw: '',
  capacity: 100,
  waitlistEnabled: true,
  residentOnly: false,
  diplomaticOnly: false,
  registrationDeadline: '',
  startsDate: '',
  endsDate: '',
  conditions: '',
  conditionsTw: '',
  notice: '',
  noticeTw: '',
  coverColor: 'app-teal',
  requiredMaterials: [],
};

function eventToForm(ev) {
  return {
    typeCode: ev.typeCode,
    title: ev.titleCn ?? ev.title,
    titleTw: ev.titleTw ?? '',
    subtitle: ev.subtitleCn ?? ev.subtitle,
    subtitleTw: ev.subtitleTw ?? '',
    description: ev.descriptionCn ?? ev.description,
    descriptionTw: ev.descriptionTw ?? '',
    schedule: ev.schedule.length ? ev.schedule : [{ time: '', title: '', titleTw: '' }],
    venueName: ev.venueNameCn ?? ev.venueName,
    venueNameTw: ev.venueNameTw ?? '',
    venueNote: ev.venueNoteCn ?? ev.venueNote,
    venueNoteTw: ev.venueNoteTw ?? '',
    capacity: ev.capacity,
    waitlistEnabled: ev.waitlistEnabled,
    residentOnly: ev.residentOnly,
    diplomaticOnly: ev.diplomaticOnly,
    registrationDeadline: ev.registrationDeadline ? ev.registrationDeadline.slice(0, 10) : '',
    startsDate: ev.startsAt ? ev.startsAt.slice(0, 10) : '',
    endsDate: ev.endsAt ? ev.endsAt.slice(0, 10) : '',
    conditions: ev.conditionsCn ?? ev.conditions,
    conditionsTw: ev.conditionsTw ?? '',
    notice: ev.noticeCn ?? ev.notice,
    noticeTw: ev.noticeTw ?? '',
    coverColor: ev.coverColor,
    requiredMaterials: ev.materials.map((m) => m.kind),
  };
}

function dateAt(date, hour) {
  return date ? new Date(`${date}T${hour}:00`).toISOString() : null;
}

export default function AdminProtocolEvents() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [typeCode, setTypeCode] = useState('');
  const [q, setQ] = useState('');
  const [types, setTypes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [noticeTarget, setNoticeTarget] = useState(null);
  const [notices, setNotices] = useState([]);
  const [noticeForm, setNoticeForm] = useState({ title: '', body: '', level: 'info' });

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set('status', status);
      if (typeCode) params.set('type', typeCode);
      if (q.trim()) params.set('q', q.trim());
      const data = await api.get(`/protocol/admin/events?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toastProtocolError(t, err);
      setItems([]);
    }
  }, [page, status, typeCode, q, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get('/protocol/admin/types')
      .then((data) => setTypes(data.items))
      .catch(() => setTypes([]));
  }, []);

  const openNew = () => {
    setForm({ ...EMPTY_FORM, typeCode: types[0]?.code || 'CULTURE' });
    setEditing('new');
  };

  const openEdit = async (row) => {
    try {
      const data = await api.get(`/protocol/admin/events/${row.id}`);
      setNotices(data.notices || []);
      setForm(eventToForm(data.event));
      setEditing(data.event);
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const save = async () => {
    if (!form.title?.trim() || !form.typeCode) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      const body = {
        typeCode: form.typeCode,
        title: form.title,
        titleTw: form.titleTw,
        subtitle: form.subtitle,
        subtitleTw: form.subtitleTw,
        description: form.description,
        descriptionTw: form.descriptionTw,
        schedule: form.schedule.filter((s) => s.time || s.title),
        venueName: form.venueName,
        venueNameTw: form.venueNameTw,
        venueNote: form.venueNote,
        venueNoteTw: form.venueNoteTw,
        capacity: Number(form.capacity) || 100,
        waitlistEnabled: form.waitlistEnabled,
        residentOnly: form.residentOnly,
        diplomaticOnly: form.diplomaticOnly,
        registrationDeadline: dateAt(form.registrationDeadline, '18:00'),
        startsAt: dateAt(form.startsDate, '10:00'),
        endsAt: dateAt(form.endsDate, '18:00'),
        conditions: form.conditions,
        conditionsTw: form.conditionsTw,
        notice: form.notice,
        noticeTw: form.noticeTw,
        coverColor: form.coverColor,
        materials: form.requiredMaterials.map((kind) => ({ kind, required: 1 })),
      };
      if (editing === 'new') {
        const data = await api.post('/protocol/admin/events', body);
        toastSuccess(t('protocol.admin.eventCreated'));
        setEditing(data.event);
      } else {
        const data = await api.patch(`/protocol/admin/events/${editing.id}`, body);
        setEditing(data.event);
        toastSuccess(t('common.save'));
      }
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (row, to) => {
    try {
      await api.post(`/protocol/admin/events/${row.id}/status`, {
        status: to,
        reason: to === 'cancelled' ? cancelReason : '',
      });
      toastSuccess(t('common.save'));
      setStatusTarget(null);
      setCancelReason('');
      if (editing && editing !== 'new' && editing.id === row.id) {
        const data = await api.get(`/protocol/admin/events/${row.id}`);
        setEditing(data.event);
        setNotices(data.notices || []);
      }
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const deleteEvent = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/protocol/admin/events/${deleteTarget.id}`);
      toastSuccess(t('protocol.admin.eventDeleted'));
      setDeleteTarget(null);
      if (editing && editing !== 'new' && editing.id === deleteTarget.id) setEditing(null);
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const openNotices = async (row) => {
    try {
      const data = await api.get(`/protocol/admin/events/${row.id}`);
      setNoticeTarget(data.event);
      setNotices(data.notices || []);
      setNoticeForm({ title: '', body: '', level: 'info' });
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const addNotice = async () => {
    if (!noticeTarget) return;
    try {
      await api.post(`/protocol/admin/events/${noticeTarget.id}/notices`, noticeForm);
      toastSuccess(t('protocol.admin.noticeAdded'));
      const data = await api.get(`/protocol/admin/events/${noticeTarget.id}`);
      setNotices(data.notices || []);
      setNoticeForm({ title: '', body: '', level: 'info' });
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const statusActions = (row) => {
    const actions = [];
    if (['draft', 'pending_publish'].includes(row.status)) actions.push({ to: 'registration', label: t('protocol.admin.publish') });
    if (row.status === 'registration') actions.push({ to: 'registration_closed', label: t('protocol.admin.closeReg') });
    if (['registration', 'registration_closed'].includes(row.status)) actions.push({ to: 'ongoing', label: t('protocol.admin.startEvent') });
    if (row.status === 'ongoing') actions.push({ to: 'ended', label: t('protocol.admin.endEvent') });
    if (!['ended', 'cancelled'].includes(row.status)) actions.push({ to: 'cancelled', label: t('protocol.admin.cancelEvent'), danger: true });
    return actions;
  };

  const columns = [
    { title: t('protocol.field.eventNo'), dataIndex: 'eventNo', width: 190 },
    { title: t('protocol.field.title'), dataIndex: 'title', width: 220 },
    { title: t('protocol.field.type'), dataIndex: 'typeName', width: 100 },
    { title: t('common.status'), dataIndex: 'status', width: 110, render: (v) => <StatusTag status={v} /> },
    {
      title: t('protocol.field.capacity'),
      dataIndex: 'capacity',
      width: 90,
      render: (v, row) => `${row.approvedCount}/${v}`,
    },
    { title: t('protocol.field.startsAt'), dataIndex: 'startsAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      render: (_, row) => (
        <div className="protocol-row-actions">
          <Button type="text" size="small" icon={<EditIcon />} onClick={() => openEdit(row)}>
            {t('protocol.action.edit')}
          </Button>
          <Button type="text" size="small" icon={<SendIcon />} onClick={() => openNotices(row)}>
            {t('protocol.admin.notices')}
          </Button>
          {statusActions(row).slice(0, 2).map((a) => (
            <Button key={a.to} type="text" size="small" danger={a.danger} onClick={() => setStatusTarget({ row, to: a.to, label: a.label })}>
              {a.label}
            </Button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('protocol.admin.eventsTitle')}</Title>
        <Button type="primary" icon={<PlusIcon />} onClick={openNew}>
          {t('protocol.admin.createEvent')}
        </Button>
      </div>

      <div className="protocol-filter-bar">
        <Select
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[{ key: '', label: t('protocol.common.allStatus') }, ...STATUSES.map((s) => ({ key: s, label: t(`protocol.status.${s}`) }))]}
        />
        <Select
          value={typeCode}
          onChange={(v) => { setTypeCode(v); setPage(1); }}
          options={[{ key: '', label: t('protocol.common.allTypes') }, ...types.map((tp) => ({ key: tp.code, label: tp.name }))]}
        />
        <Input allowClear value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('protocol.admin.searchEvent')} />
      </div>

      <Card>
        <Table className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('protocol.admin.eventsEmpty')}
        />
        {total > 20 && (
          <div className="protocol-pagination">
            <Pagination total={total} current={page} pageSize={20} onChange={setPage} showTotal />
          </div>
        )}
      </Card>

      <Drawer
        open={editing !== null}
        title={editing === 'new' ? t('protocol.admin.createEvent') : editing?.eventNo}
        width={680}
        onClose={() => setEditing(null)}
        footer={
          <div className="protocol-drawer-footer">
            {editing && editing !== 'new' && ['draft', 'cancelled'].includes(editing.status) && (
              <Button type="text" danger icon={<TrashIcon />} onClick={() => setDeleteTarget(editing)}>
                {t('protocol.action.delete')}
              </Button>
            )}
            <Button type="primary" loading={busy} onClick={save} disabled={busy}>
              {t('protocol.action.save')}
            </Button>
          </div>
        }
      >
        <div className="protocol-detail-body">
          {editing && editing !== 'new' && (
            <div className="protocol-detail-status">
              <StatusTag status={editing.status} />
              <span className="muted-text">{editing.eventNo}</span>
              {statusActions(editing).map((a) => (
                <Button key={a.to} size="small" danger={a.danger} onClick={() => setStatusTarget({ row: editing, to: a.to, label: a.label })}>
                  {a.label}
                </Button>
              ))}
            </div>
          )}
          <label className="protocol-field">
            <span>{t('protocol.field.type')}</span>
            <Select value={form.typeCode} onChange={(v) => setForm((p) => ({ ...p, typeCode: v }))} options={types.map((tp) => ({ key: tp.code, label: tp.name }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.title')} *</span>
            <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.title')} · {t('common.traditional')}</span>
            <Input value={form.titleTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setForm((p) => ({ ...p, titleTw: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.subtitle')}</span>
            <Input value={form.subtitle} onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.subtitle')} · {t('common.traditional')}</span>
            <Input value={form.subtitleTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setForm((p) => ({ ...p, subtitleTw: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.description')}</span>
            <TextArea rows={4} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.description')} · {t('common.traditional')}</span>
            <TextArea rows={4} value={form.descriptionTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setForm((p) => ({ ...p, descriptionTw: e.target.value }))} />
          </label>
          <div className="protocol-form-grid">
            <label className="protocol-field">
              <span>{t('protocol.field.startsAt')}</span>
              <DatePicker value={form.startsDate} onChange={(v) => setForm((p) => ({ ...p, startsDate: v || '' }))} />
            </label>
            <label className="protocol-field">
              <span>{t('protocol.field.endsAt')}</span>
              <DatePicker value={form.endsDate} onChange={(v) => setForm((p) => ({ ...p, endsDate: v || '' }))} />
            </label>
            <label className="protocol-field">
              <span>{t('protocol.field.deadline')}</span>
              <DatePicker value={form.registrationDeadline} onChange={(v) => setForm((p) => ({ ...p, registrationDeadline: v || '' }))} />
            </label>
            <label className="protocol-field">
              <span>{t('protocol.field.capacity')}</span>
              <Input type="number" value={String(form.capacity)} onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))} />
            </label>
          </div>
          <div className="protocol-form-grid">
            <label className="protocol-field">
              <span>{t('protocol.field.venue')}</span>
              <Input value={form.venueName} onChange={(e) => setForm((p) => ({ ...p, venueName: e.target.value }))} />
            </label>
            <label className="protocol-field">
              <span>{t('protocol.field.venue')} · {t('common.traditional')}</span>
              <Input value={form.venueNameTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setForm((p) => ({ ...p, venueNameTw: e.target.value }))} />
            </label>
            <label className="protocol-field">
              <span>{t('protocol.field.coverColor')}</span>
              <Select value={form.coverColor} onChange={(v) => setForm((p) => ({ ...p, coverColor: v }))} options={COLORS.map((c) => ({ key: c, label: c }))} />
            </label>
          </div>
          <label className="protocol-field">
            <span>{t('protocol.field.venueNote')}</span>
            <Input value={form.venueNote} onChange={(e) => setForm((p) => ({ ...p, venueNote: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.venueNote')} · {t('common.traditional')}</span>
            <Input value={form.venueNoteTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setForm((p) => ({ ...p, venueNoteTw: e.target.value }))} />
          </label>

          <h4>{t('protocol.field.schedule')}</h4>
          {form.schedule.map((row, i) => (
            <div key={i} className="protocol-schedule-edit">
              <Input value={row.time} onChange={(e) => setForm((p) => ({ ...p, schedule: p.schedule.map((s, idx) => (idx === i ? { ...s, time: e.target.value } : s)) }))} placeholder={t('protocol.admin.scheduleTime')} />
              <Input value={row.title} onChange={(e) => setForm((p) => ({ ...p, schedule: p.schedule.map((s, idx) => (idx === i ? { ...s, title: e.target.value } : s)) }))} placeholder={t('protocol.admin.scheduleTitle')} />
              <Input value={row.titleTw ?? ''} onChange={(e) => setForm((p) => ({ ...p, schedule: p.schedule.map((s, idx) => (idx === i ? { ...s, titleTw: e.target.value } : s)) }))} placeholder={t('common.twOptional')} />
              <Button type="text" size="small" danger icon={<TrashIcon />} onClick={() => setForm((p) => ({ ...p, schedule: p.schedule.filter((_, idx) => idx !== i) }))} />
            </div>
          ))}
          <Button type="dashed" size="small" icon={<PlusIcon />} onClick={() => setForm((p) => ({ ...p, schedule: [...p.schedule, { time: '', title: '', titleTw: '' }] }))}>
            {t('protocol.admin.addSchedule')}
          </Button>

          <label className="protocol-field protocol-field-spaced">
            <span>{t('protocol.field.conditions')}</span>
            <TextArea rows={3} value={form.conditions} onChange={(e) => setForm((p) => ({ ...p, conditions: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.conditions')} · {t('common.traditional')}</span>
            <TextArea rows={3} value={form.conditionsTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setForm((p) => ({ ...p, conditionsTw: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.notice')}</span>
            <TextArea rows={2} value={form.notice} onChange={(e) => setForm((p) => ({ ...p, notice: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.notice')} · {t('common.traditional')}</span>
            <TextArea rows={2} value={form.noticeTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setForm((p) => ({ ...p, noticeTw: e.target.value }))} />
          </label>

          <h4>{t('protocol.admin.materialsConfig')}</h4>
          <Checkbox
            options={MATERIAL_KINDS.map((kind) => ({ label: t(`protocol.materialKind.${kind}`), value: kind }))}
            value={form.requiredMaterials}
            onChange={(values) => setForm((p) => ({ ...p, requiredMaterials: values.map(String) }))}
          />

          <div className="protocol-switch-grid">
            <label>
              <span>{t('protocol.admin.waitlistEnabled')}</span>
              <Switch checked={form.waitlistEnabled} onChange={(v) => setForm((p) => ({ ...p, waitlistEnabled: v }))} />
            </label>
            <label>
              <span>{t('protocol.eventDetail.residentOnly')}</span>
              <Switch checked={form.residentOnly} onChange={(v) => setForm((p) => ({ ...p, residentOnly: v }))} />
            </label>
            <label>
              <span>{t('protocol.eventDetail.diplomaticOnly')}</span>
              <Switch checked={form.diplomaticOnly} onChange={(v) => setForm((p) => ({ ...p, diplomaticOnly: v }))} />
            </label>
          </div>
        </div>
      </Drawer>

      <Modal
        open={statusTarget !== null}
        title={statusTarget?.label || t('common.confirm')}
        onClose={() => { setStatusTarget(null); setCancelReason(''); }}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => { setStatusTarget(null); setCancelReason(''); }}>{t('protocol.action.back')}</Button>
            <Button
              type="primary"
              danger={statusTarget?.to === 'cancelled'}
              disabled={statusTarget?.to === 'cancelled' && !cancelReason.trim()}
              onClick={() => changeStatus(statusTarget.row, statusTarget.to)}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p>{t('protocol.admin.statusChangeTip')}</p>
        {statusTarget?.to === 'cancelled' && (
          <label className="protocol-field">
            <span>{t('protocol.admin.cancelReason')}</span>
            <TextArea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </label>
        )}
      </Modal>

      <Modal
        open={deleteTarget !== null}
        title={t('protocol.admin.deleteEventTitle')}
        onClose={() => setDeleteTarget(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button type="primary" danger onClick={deleteEvent}>{t('protocol.action.delete')}</Button>
          </>
        }
      >
        <p>{t('protocol.admin.deleteEventTip')}</p>
      </Modal>

      <Modal
        open={noticeTarget !== null}
        title={t('protocol.admin.notices')}
        onClose={() => setNoticeTarget(null)}
        typewriter={false}
        footer={<Button onClick={() => setNoticeTarget(null)}>{t('protocol.action.back')}</Button>}
      >
        <div className="protocol-notice-admin">
          <Card>
            <h4>{t('protocol.admin.addNotice')}</h4>
            <label className="protocol-field">
              <span>{t('protocol.field.title')}</span>
              <Input value={noticeForm.title} onChange={(e) => setNoticeForm((p) => ({ ...p, title: e.target.value }))} />
            </label>
            <label className="protocol-field">
              <span>{t('protocol.field.body')}</span>
              <TextArea rows={3} value={noticeForm.body} onChange={(e) => setNoticeForm((p) => ({ ...p, body: e.target.value }))} />
            </label>
            <label className="protocol-field">
              <span>{t('protocol.field.level')}</span>
              <Select
                value={noticeForm.level}
                onChange={(v) => setNoticeForm((p) => ({ ...p, level: v }))}
                options={['info', 'change', 'cancel'].map((l) => ({ key: l, label: t(`protocol.level.${l}`) }))}
              />
            </label>
            <Button type="primary" size="small" icon={<PlusIcon />} disabled={!noticeForm.title || !noticeForm.body} onClick={addNotice}>
              {t('protocol.admin.addNotice')}
            </Button>
          </Card>
          <ul className="protocol-notice-admin-list">
            {notices.map((n) => (
              <li key={n.id}>
                <div className="protocol-inline-between">
                  <strong>{n.title}</strong>
                  <Tag size="small" color={n.level === 'change' ? 'app-orange' : n.level === 'cancel' ? 'app-red' : 'app-blue'} variant="soft">
                    {t(`protocol.level.${n.level}`)}
                  </Tag>
                </div>
                <p>{n.body}</p>
                <span className="muted-text">{fmtDateTime(n.created_at || n.createdAt)}</span>
              </li>
            ))}
            {notices.length === 0 && <li className="muted-text">{t('common.empty')}</li>}
          </ul>
        </div>
      </Modal>
    </div>
  );
}