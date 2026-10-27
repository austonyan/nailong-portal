// 学习任务管理(edu:manage):阅读打卡任务的定义/编辑/启停/删除与完成情况。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Drawer, Input, Modal, Pagination, Table, Tag, Title } from 'animal-island-ui';
import { EditIcon, EyeIcon, PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { ConfirmModal, StatusTag, TextArea, fmtDateTime, pct, toastEduError } from '../shared.jsx';
import { toastError, toastSuccess } from '../../../components/toast.js';

const EMPTY_FORM = {
  id: null,
  code: '',
  title: '',
  titleTw: '',
  description: '',
  descriptionTw: '',
  targetCount: 3,
  badgeCode: '',
  badgeName: '',
  badgeNameTw: '',
  status: 'active',
};

export default function AdminEduTasks() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [records, setRecords] = useState(null); // { task, items, total, page }
  const [recordsPage, setRecordsPage] = useState(1);
  const recordsPageSize = 10;

  const load = useCallback(async () => {
    try {
      const data = await api.get('/education/admin/tasks');
      setItems(data.items ?? []);
    } catch (err) {
      toastEduError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setForm({
      id: row.id,
      code: row.code,
      title: row.titleCn ?? row.title ?? '',
      titleTw: row.titleTw ?? '',
      description: row.descriptionCn ?? row.description ?? '',
      descriptionTw: row.descriptionTw ?? '',
      targetCount: row.targetCount,
      badgeCode: row.badgeCode ?? '',
      badgeName: row.badgeNameCn ?? row.badgeName ?? '',
      badgeNameTw: row.badgeNameTw ?? '',
      status: row.status,
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.title.trim()) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        titleTw: form.titleTw.trim(),
        description: form.description,
        descriptionTw: form.descriptionTw,
        targetCount: Number(form.targetCount) > 0 ? Number(form.targetCount) : 3,
        badgeCode: form.badgeCode.trim(),
        badgeName: form.badgeName.trim(),
        badgeNameTw: form.badgeNameTw.trim(),
      };
      if (form.id) {
        delete payload.code;
        await api.patch(`/education/admin/tasks/${form.id}`, payload);
      } else {
        await api.post('/education/admin/tasks', payload);
      }
      setFormOpen(false);
      toastSuccess(t('common.saved'));
      await load();
    } catch (err) {
      toastEduError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (row) => {
    try {
      await api.post(`/education/admin/tasks/${row.id}/status`, {
        status: row.status === 'active' ? 'inactive' : 'active',
      });
      toastSuccess(t('common.saved'));
      await load();
    } catch (err) {
      toastEduError(t, err);
    }
  };

  const openRecords = async (row, page = 1) => {
    try {
      const data = await api.get(`/education/admin/tasks/${row.id}/records?page=${page}&pageSize=${recordsPageSize}`);
      setRecords({ ...data, page });
      setRecordsPage(page);
    } catch (err) {
      toastEduError(t, err);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.del(`/education/admin/tasks/${deleteTarget.id}`);
      setDeleteTarget(null);
      toastSuccess(t('common.deleted'));
      await load();
    } catch (err) {
      toastEduError(t, err);
    } finally {
      setDeleteBusy(false);
    }
  };

  const columns = [
    { title: t('edu.field.no'), dataIndex: 'no', width: 170 },
    { title: t('edu.field.code'), dataIndex: 'code', width: 110 },
    { title: t('edu.field.title'), dataIndex: 'title' },
    {
      title: t('edu.field.targetCount'),
      dataIndex: 'targetCount',
      width: 100,
    },
    {
      title: t('edu.field.badge'),
      dataIndex: 'badgeName',
      render: (v, row) => (row.badgeCode ? `${v} (${row.badgeCode})` : '-'),
    },
    {
      title: t('edu.admin.tasks.participants'),
      dataIndex: 'participants',
      width: 90,
    },
    {
      title: t('edu.admin.tasks.completionRate'),
      dataIndex: 'completionRate',
      width: 110,
      render: (v, row) => (
        <Tag size="small" color={pct(row.completed, row.participants) >= 100 ? 'app-teal' : 'app-yellow'} variant="soft">
          {v}%
        </Tag>
      ),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 100,
      render: (v) => <StatusTag value={v} />,
    },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 250,
      render: (_, row) => (
        <div className="table-actions">
          <Button size="small" icon={<EyeIcon />} onClick={() => openRecords(row)}>
            {t('edu.admin.tasks.records')}
          </Button>
          <Button size="small" onClick={() => toggleStatus(row)}>
            {t(row.status === 'active' ? 'edu.admin.tasks.deactivate' : 'edu.admin.tasks.activate')}
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

  const recordColumns = [
    { title: t('edu.field.username'), dataIndex: 'username', width: 120 },
    { title: t('edu.field.displayName'), dataIndex: 'displayName', width: 120 },
    {
      title: t('edu.task.progressLabelShort'),
      dataIndex: 'progress',
      render: (v) => `${v} / ${records?.task?.targetCount ?? '-'}`,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 110,
      render: (v) => <StatusTag value={v} prefix="edu.recordStatus" />,
    },
    { title: t('edu.field.completedAt'), dataIndex: 'completedAt', width: 150, render: fmtDateTime },
    { title: t('edu.field.updatedAt'), dataIndex: 'updatedAt', width: 150, render: fmtDateTime },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle" color="app-yellow">
          {t('edu.admin.tasks.title')}
        </Title>
      </div>

      <Card>
        <p className="muted-text">{t('edu.admin.tasks.tip')}</p>
        <div className="edu-search-row">
          <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
            {t('edu.admin.tasks.create')}
          </Button>
        </div>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('edu.admin.tasks.empty')}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={formOpen}
        title={form.id ? t('edu.admin.tasks.edit') : t('edu.admin.tasks.create')}
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
            <Button
              type="primary"
              loading={busy}
              disabled={busy || !form.code.trim() || !form.title.trim()}
              onClick={save}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="edu-section">
          <div className="edu-form-row">
            <label>
              {t('edu.field.code')} *
              <Input
                size="large"
                value={form.code}
                maxLength={20}
                disabled={!!form.id}
                placeholder={t('edu.admin.tasks.codePlaceholder')}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </label>
            <label>
              {t('edu.field.targetCount')}
              <Input
                size="large"
                value={String(form.targetCount)}
                maxLength={2}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, ''));
                  setForm({ ...form, targetCount: Number.isInteger(n) && n > 0 ? Math.min(n, 50) : '' });
                }}
              />
            </label>
          </div>
          <div className="edu-form-row">
            <label>
              {t('edu.field.title')} *
              <Input
                size="large"
                value={form.title}
                maxLength={80}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              {t('edu.field.title')} · {t('common.traditional')}
              <Input
                size="large"
                value={form.titleTw}
                maxLength={80}
                placeholder={t('common.twOptional')}
                onChange={(e) => setForm({ ...form, titleTw: e.target.value })}
              />
            </label>
          </div>
          <label>
            {t('edu.field.description')}
            <TextArea rows={2} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label>
            {t('edu.field.description')} · {t('common.traditional')}
            <TextArea rows={2} maxLength={500} value={form.descriptionTw} onChange={(e) => setForm({ ...form, descriptionTw: e.target.value })} />
          </label>
          <div className="edu-form-row">
            <label>
              {t('edu.field.badgeCode')}
              <Input
                size="large"
                value={form.badgeCode}
                maxLength={40}
                placeholder={t('edu.admin.tasks.badgeCodePlaceholder')}
                onChange={(e) => setForm({ ...form, badgeCode: e.target.value })}
              />
            </label>
            <label>
              {t('edu.field.badge')}
              <Input
                size="large"
                value={form.badgeName}
                maxLength={40}
                onChange={(e) => setForm({ ...form, badgeName: e.target.value })}
              />
            </label>
            <label>
              {t('edu.field.badge')} · {t('common.traditional')}
              <Input
                size="large"
                value={form.badgeNameTw}
                maxLength={40}
                placeholder={t('common.twOptional')}
                onChange={(e) => setForm({ ...form, badgeNameTw: e.target.value })}
              />
            </label>
          </div>
        </div>
      </Modal>

      <Drawer
        maskClosable={false}
        open={records !== null}
        title={t('edu.admin.tasks.recordsTitle', { title: records?.task?.title ?? '' })}
        onClose={() => setRecords(null)}
        width={640}
      >
        {records && (
          <div className="edu-section">
            <Table
              className="table-fit"
              columns={recordColumns}
              dataSource={records.items ?? []}
              rowKey="id"
              pagination={false}
              emptyText={t('edu.admin.tasks.recordsEmpty')}
            />
            {records.total > recordsPageSize && (
              <div className="edu-pager">
                <Pagination
                  total={records.total}
                  current={recordsPage}
                  pageSize={recordsPageSize}
                  onChange={(page) => openRecords(records.task, page)}
                  showTotal
                />
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmModal
        open={!!deleteTarget}
        title={t('common.confirmDeleteTitle')}
        tip={t('edu.admin.tasks.deleteTip', { title: deleteTarget?.title ?? '' })}
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={remove}
      />
    </div>
  );
}
