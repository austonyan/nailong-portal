// 百科词条管理(edu:manage):建/编/提交审核/下线/重新上线/删除 + 关联词条。
// 提交审核后进入 edu:review 的独立队列,管理端此时锁定编辑与删除。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { EditIcon, PlusIcon, SendIcon, TrashIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { ConfirmModal, StatusTag, TextArea, fmtDateTime, toastEduError } from '../shared.jsx';
import { toastError, toastSuccess } from '../../../components/toast.js';
import { useDebouncedValue } from '../../../lib/useDebouncedValue.js';

const EMPTY_FORM = {
  id: null,
  title: '',
  titleTw: '',
  categoryCode: 'WORLD',
  summary: '',
  summaryTw: '',
  body: '',
  bodyTw: '',
  tags: '',
  relatedIds: [],
};

const STATUS_FILTERS = ['', 'draft', 'pending_review', 'published', 'offline'];

export default function AdminEduEntries() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  // 检索词 300ms 防抖:逐键输入不再每字打一次接口。
  const dq = useDebouncedValue(q, 300);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [relatedPool, setRelatedPool] = useState([]);
  const [relatedPick, setRelatedPick] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (dq.trim()) params.set('q', dq.trim());
    try {
      const data = await api.get(`/education/admin/entries?${params.toString()}`);
      setItems(data.items ?? []);
    } catch (err) {
      toastEduError(t, err);
      setItems([]);
    }
  }, [dq, statusFilter, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get('/education/admin/categories')
      .then((data) => setCategories(data.items ?? []))
      .catch(() => setCategories([]));
    api
      .get('/education/admin/entries?pageSize=100')
      .then((data) => setRelatedPool(data.items ?? []))
      .catch(() => setRelatedPool([]));
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setRelatedPick('');
    setFormOpen(true);
  };

  // zh-TW 下中间件会把 title/summary/body 换成繁体,编辑回填用 *Cn 拿回简体原文。
  const openEdit = (row) => {
    setForm({
      id: row.id,
      title: row.titleCn ?? row.title ?? '',
      titleTw: row.titleTw ?? '',
      categoryCode: row.categoryCode ?? 'WORLD',
      summary: row.summaryCn ?? row.summary ?? '',
      summaryTw: row.summaryTw ?? '',
      body: row.bodyCn ?? row.body ?? '',
      bodyTw: row.bodyTw ?? '',
      tags: (row.tags ?? []).join(','),
      relatedIds: row.relatedIds ?? [],
    });
    setRelatedPick('');
    setFormOpen(true);
  };

  const addRelated = () => {
    const id = Number(relatedPick);
    if (!id || form.relatedIds.includes(id)) return;
    setForm((prev) => ({ ...prev, relatedIds: [...prev.relatedIds, id] }));
    setRelatedPick('');
  };

  const removeRelated = (id) => {
    setForm((prev) => ({ ...prev, relatedIds: prev.relatedIds.filter((x) => x !== id) }));
  };

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        titleTw: form.titleTw.trim(),
        categoryCode: form.categoryCode,
        summary: form.summary,
        summaryTw: form.summaryTw,
        body: form.body,
        bodyTw: form.bodyTw,
        tags: form.tags,
        relatedIds: form.relatedIds,
      };
      if (form.id) await api.patch(`/education/admin/entries/${form.id}`, payload);
      else await api.post('/education/admin/entries', payload);
      setFormOpen(false);
      toastSuccess(t('common.saved'));
      await load();
    } catch (err) {
      toastEduError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async (row) => {
    setBusy(true);
    try {
      await api.post(`/education/admin/entries/${row.id}/submit`, {});
      toastSuccess(t('edu.admin.entries.submitted'));
      await load();
    } catch (err) {
      toastEduError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const moveStatus = async (row, action) => {
    try {
      await api.post(`/education/admin/entries/${row.id}/${action}`, {});
      toastSuccess(t(action === 'offline' ? 'edu.admin.entries.offlineDone' : 'edu.admin.entries.publishedDone'));
      await load();
    } catch (err) {
      toastEduError(t, err);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.del(`/education/admin/entries/${deleteTarget.id}`);
      setDeleteTarget(null);
      toastSuccess(t('common.deleted'));
      await load();
    } catch (err) {
      toastEduError(t, err);
    } finally {
      setDeleteBusy(false);
    }
  };

  const relatedName = (id) => relatedPool.find((item) => item.id === id)?.title ?? `#${id}`;

  const columns = [
    { title: t('edu.field.no'), dataIndex: 'no', width: 170 },
    { title: t('edu.field.title'), dataIndex: 'title' },
    {
      title: t('edu.field.category'),
      dataIndex: 'categoryCode',
      width: 110,
      render: (v) => categories.find((c) => c.code === v)?.name ?? v,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 110,
      render: (v) => <StatusTag value={v} />,
    },
    { title: t('edu.field.viewCountCol'), dataIndex: 'viewCount', width: 80 },
    { title: t('edu.field.favoriteCount'), dataIndex: 'favoriteCount', width: 80 },
    { title: t('edu.field.updatedAt'), dataIndex: 'updatedAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 260,
      render: (_, row) => (
        <div className="table-actions">
          {row.status === 'draft' && (
            <Button size="small" type="primary" icon={<SendIcon />} onClick={() => submitReview(row)}>
              {t('edu.admin.entries.submit')}
            </Button>
          )}
          {row.status === 'offline' && (
            <Button size="small" onClick={() => moveStatus(row, 'publish')}>
              {t('edu.admin.entries.republish')}
            </Button>
          )}
          {row.status === 'published' && (
            <Button size="small" onClick={() => moveStatus(row, 'offline')}>
              {t('edu.admin.entries.offline')}
            </Button>
          )}
          {row.status !== 'pending_review' && (
            <Button size="small" icon={<EditIcon />} onClick={() => openEdit(row)}>
              {t('common.edit')}
            </Button>
          )}
          {row.status !== 'pending_review' && (
            <Button size="small" type="text" danger icon={<TrashIcon />} onClick={() => setDeleteTarget(row)}>
              {t('common.delete')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const categoryOptions = categories.map((c) => ({ key: c.code, label: c.name }));
  const relatedOptions = relatedPool
    .filter((item) => item.id !== form.id && !form.relatedIds.includes(item.id))
    .map((item) => ({ key: String(item.id), label: `${item.title} (${item.no})` }));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-blue">
            {t('edu.admin.entries.title')}
          </Title>
        </h1>
      </div>

      <Card>
        <p className="muted-text">{t('edu.admin.entries.tip')}</p>
        <div className="edu-search-row">
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_FILTERS.map((v) => ({
              key: v,
              label: v === '' ? t('edu.admin.allStatus') : t(`edu.status.${v}`),
            }))}
            aria-label={t('common.status')}
          />
          <Input
            size="large"
            allowClear
            placeholder={t('edu.admin.entries.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onClear={() => setQ('')}
          />
          <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
            {t('edu.admin.entries.create')}
          </Button>
        </div>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('edu.admin.entries.empty')}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={formOpen}
        title={form.id ? t('edu.admin.entries.edit') : t('edu.admin.entries.create')}
        onClose={() => {
          if (busy) return;
          setFormOpen(false);
        }}
        typewriter={false}
        width={680}
        footer={
          <>
            <Button onClick={() => setFormOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={busy || !form.title.trim() || !form.body.trim()}
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
              {t('edu.field.title')} *
              <Input
                size="large"
                value={form.title}
                maxLength={120}
                placeholder={t('edu.admin.entries.titlePlaceholder')}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              {t('edu.field.title')} · {t('common.traditional')}
              <Input
                size="large"
                value={form.titleTw}
                maxLength={120}
                placeholder={t('common.twOptional')}
                onChange={(e) => setForm({ ...form, titleTw: e.target.value })}
              />
            </label>
          </div>
          <div className="edu-form-row">
            <label>
              {t('edu.field.category')}
              <Select
                value={form.categoryCode}
                onChange={(key) => setForm({ ...form, categoryCode: key })}
                options={categoryOptions}
              />
            </label>
            <label>
              {t('edu.field.tags')}
              <Input
                size="large"
                value={form.tags}
                maxLength={200}
                placeholder={t('edu.admin.entries.tagsPlaceholder')}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </label>
          </div>
          <label>
            {t('edu.field.summary')}
            <TextArea rows={2} maxLength={400} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </label>
          <label>
            {t('edu.field.summary')} · {t('common.traditional')}
            <TextArea rows={2} maxLength={400} value={form.summaryTw} onChange={(e) => setForm({ ...form, summaryTw: e.target.value })} />
          </label>
          <label>
            {t('edu.field.body')} *
            <TextArea rows={6} maxLength={20000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </label>
          <label>
            {t('edu.field.body')} · {t('common.traditional')}
            <TextArea rows={6} maxLength={20000} value={form.bodyTw} onChange={(e) => setForm({ ...form, bodyTw: e.target.value })} />
          </label>
          <label>
            {t('edu.field.related')}
            <div className="edu-search-row">
              <Select
                value={relatedPick}
                onChange={setRelatedPick}
                options={relatedOptions}
                placeholder={t('edu.admin.entries.relatedPick')}
                aria-label={t('edu.field.related')}
              />
              <Button onClick={addRelated} disabled={!relatedPick}>
                {t('edu.admin.entries.relatedAdd')}
              </Button>
            </div>
            <div className="edu-meta">
              {form.relatedIds.map((id) => (
                <Tag key={id} size="small" closable onClose={() => removeRelated(id)} variant="soft" color="app-blue">
                  {relatedName(id)}
                </Tag>
              ))}
              {form.relatedIds.length === 0 && <span className="muted-text">{t('edu.admin.entries.relatedEmpty')}</span>}
            </div>
          </label>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title={t('common.confirmDeleteTitle')}
        tip={t('edu.admin.entries.deleteTip', { title: deleteTarget?.title ?? '' })}
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={remove}
      />
    </div>
  );
}
