// 徽章管理:条件定义(打卡次数阈值)增删改、发放记录查看与回收。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Switch, Table, Tag, Title } from 'animal-island-ui';
import { EditIcon, PlusIcon, TrashIcon, TrophyIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastError, toastSuccess } from '../../../components/toast.js';
import { BADGE_ICON_OPTIONS, BadgeIcon, TextArea, fmtDateTime, toastTourError } from '../shared.jsx';
import { TourAdminNav } from '../TourismShell.jsx';

const EMPTY_FORM = {
  id: null,
  code: '',
  name: '',
  nameTw: '',
  description: '',
  descriptionTw: '',
  icon: 'TrophyIcon',
  threshold: '1',
  enabled: true,
  sortOrder: '0',
};

function iconOptions(t) {
  return BADGE_ICON_OPTIONS.map((value) => ({
    key: value,
    label: t(`tour.admin.badges.icon.${value}`, { defaultValue: t('common.unknown') }),
  }));
}

export default function AdminTourBadges() {
  const { t, i18n } = useTranslation();
  const isTw = String(i18n.language || '').startsWith('zh-TW');
  // 第二列永远显示「另一种语言」:繁中界面显示简体源(nameCn),简中界面显示繁体(nameTw)。
  const otherLangLabel = isTw ? t('common.simplified') : t('common.traditional');
  const [items, setItems] = useState(null);
  const [awards, setAwards] = useState(null);
  const [awardBadge, setAwardBadge] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeBusy, setRevokeBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/tourism/admin/badges');
      setItems(data.items);
    } catch (err) {
      toastTourError(t, err);
      setItems([]);
    }
  }, [t]);

  const loadAwards = useCallback(async () => {
    try {
      const params = awardBadge ? `?badgeId=${awardBadge}` : '';
      const data = await api.get(`/tourism/admin/awards${params}`);
      setAwards(data.items);
    } catch (err) {
      toastTourError(t, err);
      setAwards([]);
    }
  }, [awardBadge, t]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadAwards();
  }, [loadAwards]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setForm({
      id: row.id,
      code: row.code,
      name: row.nameCn ?? row.name ?? '',
      nameTw: row.nameTw ?? '',
      description: row.descriptionCn ?? row.description ?? '',
      descriptionTw: row.descriptionTw ?? '',
      icon: row.icon,
      threshold: String(row.threshold ?? 1),
      enabled: !!row.enabled,
      sortOrder: String(row.sortOrder ?? 0),
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || (!form.id && !form.code.trim())) {
      toastError(t('common.required'));
      return;
    }
    const threshold = Number(form.threshold);
    if (!form.threshold || !Number.isInteger(threshold) || threshold < 1 || threshold > 1000) {
      toastError(t('tour.admin.badges.invalidThreshold'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        nameTw: form.nameTw.trim(),
        description: form.description,
        descriptionTw: form.descriptionTw,
        icon: form.icon,
        threshold,
        enabled: form.enabled,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (form.id) await api.patch(`/tourism/admin/badges/${form.id}`, payload);
      else await api.post('/tourism/admin/badges', { ...payload, code: form.code.trim() });
      setFormOpen(false);
      toastSuccess(t('common.saved'));
      await load();
    } catch (err) {
      toastTourError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (row) => {
    try {
      await api.patch(`/tourism/admin/badges/${row.id}`, { enabled: !row.enabled });
      await load();
    } catch (err) {
      toastTourError(t, err);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.del(`/tourism/admin/badges/${deleteTarget.id}`);
      setDeleteTarget(null);
      toastSuccess(t('common.deleted'));
      await load();
    } catch (err) {
      toastTourError(t, err);
    } finally {
      setDeleteBusy(false);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    try {
      await api.post(`/tourism/admin/badges/${revokeTarget.badgeId}/revoke`, {
        userId: revokeTarget.userId,
        reason: revokeReason.trim(),
      });
      setRevokeTarget(null);
      setRevokeReason('');
      toastSuccess(t('tour.admin.badges.revokeDone'));
      await Promise.all([load(), loadAwards()]);
    } catch (err) {
      toastTourError(t, err);
    } finally {
      setRevokeBusy(false);
    }
  };

  const columns = [
    {
      title: t('tour.admin.field.icon'),
      dataIndex: 'icon',
      width: 60,
      render: (v) => <BadgeIcon name={v} size={22} />,
    },
    { title: t('tour.admin.badges.code'), dataIndex: 'code', width: 140 },
    { title: t('common.name'), dataIndex: 'name' },
    {
      title: t('common.name') + ' · ' + otherLangLabel,
      dataIndex: 'name',
      render: (v, row) => (isTw ? (row.nameCn ?? row.nameTw ?? row.name) : row.nameTw) || '-',
    },
    { title: t('tour.admin.badges.threshold'), dataIndex: 'threshold', width: 110 },
    { title: t('tour.admin.badges.awardCount'), dataIndex: 'awards', width: 90 },
    {
      title: t('common.enabled'),
      dataIndex: 'enabled',
      width: 90,
      render: (v, row) => <Switch checked={!!v} onChange={() => toggleEnabled(row)} />,
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

  const awardColumns = [
    {
      title: t('tour.admin.badges.badge'),
      dataIndex: 'badgeName',
      render: (v, row) => (
        <span>
          {v} <span className="tour-audit-detail">({row.badgeNo})</span>
        </span>
      ),
    },
    { title: t('tour.admin.badges.user'), dataIndex: 'displayName', render: (v, row) => `${v || row.username} (@${row.username})` },
    { title: t('tour.admin.badges.checkinCount'), dataIndex: 'checkinCount', width: 100 },
    { title: t('tour.admin.badges.awardedAt'), dataIndex: 'awardedAt', width: 160, render: fmtDateTime },
    {
      title: t('common.status'),
      dataIndex: 'revokedAt',
      width: 110,
      render: (v) =>
        v ? (
          <Tag size="small" color="app-red" variant="soft">
            {t('tour.admin.badges.revoked')}
          </Tag>
        ) : (
          <Tag size="small" color="app-green" variant="soft">
            {t('tour.admin.badges.holding')}
          </Tag>
        ),
    },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 90,
      render: (_, row) =>
        row.revokedAt ? (
          '-'
        ) : (
          <div className="table-actions">
            <Button size="small" type="text" danger onClick={() => setRevokeTarget(row)}>
              {t('tour.admin.badges.revoke')}
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div>
      <TourAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-green">
            {t('tour.admin.badges.title')}
          </Title>
        </h1>
      </div>

      <Card>
        <p className="muted-text">{t('tour.admin.badges.tip')}</p>
        <div className="tour-filter-bar">
          <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
            {t('tour.admin.badges.create')}
          </Button>
        </div>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('tour.admin.badges.empty')}
        />
      </Card>

      <Card>
        <div className="tour-section-head">
          <Title size="small">
            {t('tour.admin.badges.awardsTitle')}
          </Title>
          <Select
            value={awardBadge}
            onChange={setAwardBadge}
            options={[
              { key: '', label: t('tour.admin.badges.allBadges') },
              ...(items ?? []).map((b) => ({ key: String(b.id), label: b.name })),
            ]}
            aria-label={t('tour.admin.badges.badge')}
          />
        </div>
        <Table
          className="table-fit"
          columns={awardColumns}
          dataSource={awards ?? []}
          loading={awards === null}
          rowKey="id"
          pagination={false}
          emptyText={t('tour.admin.badges.noAwards')}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={formOpen}
        title={form.id ? t('tour.admin.badges.edit') : t('tour.admin.badges.create')}
        onClose={() => {
          if (busy) return;
          setFormOpen(false);
        }}
        typewriter={false}
        width={600}
        footer={
          <>
            <Button onClick={() => setFormOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              type="primary"
              icon={<TrophyIcon />}
              loading={busy}
              disabled={busy || !form.name.trim() || (!form.id && !form.code.trim())}
              onClick={save}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="tour-form">
          <div className="tour-form-grid">
            <label>
              {t('tour.admin.badges.code')} {form.id ? '' : '*'}
              <Input
                size="large"
                value={form.code}
                maxLength={32}
                disabled={!!form.id}
                placeholder={t('tour.admin.badges.codePlaceholder')}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </label>
            <label>
              {t('common.name')} *
              <Input
                size="large"
                value={form.name}
                maxLength={60}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              {t('common.name')} · {t('common.traditional')}
              <Input
                size="large"
                value={form.nameTw}
                maxLength={60}
                placeholder={t('common.twOptional')}
                onChange={(e) => setForm({ ...form, nameTw: e.target.value })}
              />
            </label>
            <label>
              {t('tour.admin.badges.threshold')} *
              <Input
                size="large"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value.replace(/\D/g, '') })}
              />
            </label>
            <label>
              {t('tour.admin.field.icon')}
              <Select value={form.icon} onChange={(key) => setForm({ ...form, icon: key })} options={iconOptions(t)} />
            </label>
            <label>
              {t('tour.admin.field.sortOrder')}
              <Input
                size="large"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value.replace(/\D/g, '') })}
              />
            </label>
          </div>
          <label>
            {t('common.description')}
            <TextArea rows={2} maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label>
            {t('common.description')} · {t('common.traditional')}
            <TextArea rows={2} maxLength={300} value={form.descriptionTw} onChange={(e) => setForm({ ...form, descriptionTw: e.target.value })} />
          </label>
          <div className="tour-inline-switch">
            <Switch checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} />
            <span>{t('common.enabled')}</span>
          </div>
          <p className="muted-text tour-config-tip">{t('tour.admin.badges.codeTip')}</p>
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
        <p className="muted-text">{t('tour.admin.badges.deleteTip', { name: deleteTarget?.name ?? '' })}</p>
      </Modal>

      <Modal
        maskClosable={false}
        open={!!revokeTarget}
        title={t('tour.admin.badges.revokeTitle', { name: revokeTarget?.badgeName ?? '' })}
        onClose={() => {
          if (revokeBusy) return;
          setRevokeTarget(null);
        }}
        typewriter={false}
        footer={
          <>
            <Button
              onClick={() => {
                setRevokeTarget(null);
                setRevokeReason('');
              }}
              disabled={revokeBusy}
            >
              {t('common.cancel')}
            </Button>
            <Button type="primary" danger loading={revokeBusy} disabled={revokeBusy} onClick={revoke}>
              {t('tour.admin.badges.revoke')}
            </Button>
          </>
        }
      >
        <p className="muted-text">
          {t('tour.admin.badges.revokeTip', { user: revokeTarget ? `@${revokeTarget.username}` : '' })}
        </p>
        <Input
          size="large"
          value={revokeReason}
          maxLength={200}
          placeholder={t('tour.admin.badges.revokeReasonPlaceholder')}
          onChange={(e) => setRevokeReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
