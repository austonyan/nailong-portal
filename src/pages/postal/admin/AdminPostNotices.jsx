// 公告管理:CRUD、发布/下线、双语编辑与通知统计。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Pagination, Select, Table, Tag, Title } from 'animal-island-ui';
import { EditIcon, PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastError, toastSuccess } from '../../../components/toast.js';
import {
  NOTICE_LEVELS,
  NOTICE_LEVEL_COLORS,
  NOTICE_STATUSES,
  NOTICE_STATUS_COLORS,
  PostTextarea,
  fmtDateTime,
  toastPostError,
} from '../shared.jsx';

const PAGE_SIZE = 20;

const EMPTY_NOTICE = { id: null, title: '', titleTw: '', body: '', bodyTw: '', level: 'info' };

export default function AdminPostNotices() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_NOTICE);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      if (query) params.set('q', query);
      const data = await api.get(`/postal/admin/notices?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toastPostError(t, err);
      setItems([]);
      setTotal(0);
    }
  }, [page, query, status, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_NOTICE);
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setForm({
      id: row.id,
      title: row.titleCn ?? row.title,
      titleTw: row.titleTw ?? '',
      body: row.bodyCn ?? row.body,
      bodyTw: row.bodyTw ?? '',
      level: row.level,
    });
    setFormOpen(true);
  };

  const saveNotice = async () => {
    if (!form.title.trim()) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      if (form.id) await api.patch(`/postal/admin/notices/${form.id}`, form);
      else await api.post('/postal/admin/notices', form);
      setFormOpen(false);
      toastSuccess(t('common.saved'));
      await load();
    } catch (err) {
      toastPostError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const removeNotice = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.del(`/postal/admin/notices/${deleteTarget.id}`);
      setDeleteTarget(null);
      toastSuccess(t('common.deleted'));
      await load();
    } catch (err) {
      toastPostError(t, err);
    } finally {
      setDeleteBusy(false);
    }
  };

  const transition = async (row, action) => {
    setRowBusyId(row.id);
    try {
      await api.post(`/postal/admin/notices/${row.id}/${action}`);
      toastSuccess(action === 'publish' ? t('post.admin.notices.published') : t('post.admin.notices.offlineDone'));
      await load();
    } catch (err) {
      toastPostError(t, err);
    } finally {
      setRowBusyId('');
    }
  };

  const columns = [
    { title: t('post.admin.field.no'), dataIndex: 'no', width: 190 },
    { title: t('post.admin.notices.title'), dataIndex: 'title' },
    {
      title: t('post.admin.notices.level'),
      dataIndex: 'level',
      width: 90,
      render: (value) => (
        <Tag color={NOTICE_LEVEL_COLORS[value] || 'brown'} variant="soft">
          {t(`post.level.${value}`)}
        </Tag>
      ),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 90,
      render: (value) => (
        <Tag color={NOTICE_STATUS_COLORS[value] || 'brown'} variant="soft">
          {t(`post.admin.noticeStatus.${value}`)}
        </Tag>
      ),
    },
    { title: t('post.admin.field.publishedAt'), dataIndex: 'publishedAt', width: 150, render: fmtDateTime },
    { title: t('post.admin.notices.notified'), dataIndex: 'notificationCount', width: 90 },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 260,
      render: (_, row) => (
        <div className="table-actions">
          {row.status !== 'published' ? (
            <Button
              size="small"
              type="primary"
              loading={rowBusyId === row.id}
              disabled={!!rowBusyId}
              onClick={() => transition(row, 'publish')}
            >
              {t('post.admin.notices.publish')}
            </Button>
          ) : (
            <Button
              size="small"
              loading={rowBusyId === row.id}
              disabled={!!rowBusyId}
              onClick={() => transition(row, 'offline')}
            >
              {t('post.admin.notices.offline')}
            </Button>
          )}
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
    <div className="postal-section">
      <div className="postal-section-head">
        <h1 className="page-title">
          <Title size="middle" color="app-teal">
            {t('post.admin.notices.title')}
          </Title>
        </h1>
      </div>

      <Card>
        <div className="postal-filter-bar">
          <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
            {t('post.admin.notices.create')}
          </Button>
          <Select
            value={status}
            onChange={(key) => {
              setStatus(key);
              setPage(1);
            }}
            options={[
              { key: '', label: t('post.admin.allStatus') },
              ...NOTICE_STATUSES.map((value) => ({ key: value, label: t(`post.admin.noticeStatus.${value}`) })),
            ]}
          />
          <Input
            size="middle"
            allowClear
            value={keyword}
            placeholder={t('post.admin.searchPlaceholder')}
            onChange={(e) => setKeyword(e.target.value)}
            onClear={() => {
              setKeyword('');
              setQuery('');
              setPage(1);
            }}
          />
          <Button
            onClick={() => {
              setQuery(keyword.trim());
              setPage(1);
            }}
          >
            {t('common.search')}
          </Button>
        </div>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('common.empty')}
        />
        {total > PAGE_SIZE && (
          <Pagination total={total} current={page} pageSize={PAGE_SIZE} onChange={setPage} showTotal />
        )}
      </Card>

      <Modal
        maskClosable={false}
        open={formOpen}
        title={form.id ? t('post.admin.notices.edit') : t('post.admin.notices.create')}
        onClose={() => {
          if (busy) return;
          setFormOpen(false);
        }}
        typewriter={false}
        width={620}
        footer={
          <>
            <Button onClick={() => setFormOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" loading={busy} disabled={busy || !form.title.trim()} onClick={saveNotice}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="postal-form">
          <label className="postal-field">
            <span>{t('post.admin.notices.title')} *</span>
            <Input
              size="large"
              value={form.title}
              maxLength={120}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="postal-field">
            <span>
              {t('post.admin.notices.title')} · {t('common.traditional')}
            </span>
            <Input
              size="large"
              value={form.titleTw ?? ''}
              placeholder={t('common.twOptional')}
              maxLength={120}
              onChange={(e) => setForm({ ...form, titleTw: e.target.value })}
            />
          </label>
          <label className="postal-field">
            <span>{t('post.admin.notices.level')}</span>
            <Select
              value={form.level}
              onChange={(key) => setForm({ ...form, level: key })}
              options={NOTICE_LEVELS.map((value) => ({ key: value, label: t(`post.level.${value}`) }))}
            />
          </label>
          <label className="postal-field postal-field-wide">
            <span>{t('post.admin.notices.body')}</span>
            <PostTextarea
              rows={5}
              maxLength={4000}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
          <label className="postal-field postal-field-wide">
            <span>
              {t('post.admin.notices.body')} · {t('common.traditional')}
            </span>
            <PostTextarea
              rows={5}
              maxLength={4000}
              value={form.bodyTw ?? ''}
              placeholder={t('common.twOptional')}
              onChange={(e) => setForm({ ...form, bodyTw: e.target.value })}
            />
          </label>
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
            <Button type="primary" danger loading={deleteBusy} disabled={deleteBusy} onClick={removeNotice}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="muted-text">{t('post.admin.notices.deleteTip', { title: deleteTarget?.title ?? '' })}</p>
      </Modal>
    </div>
  );
}