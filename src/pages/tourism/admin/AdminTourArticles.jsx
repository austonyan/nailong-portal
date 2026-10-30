// 文化内容管理:节庆 / 民俗 / 世界观文章的增删改查、上下线与双语字段。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { BookIcon, EditIcon, PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastError, toastSuccess } from '../../../components/toast.js';
import {
  ARTICLE_TYPES,
  ARTICLE_TYPE_COLORS,
  TextArea,
  fmtDate,
  toastTourError,
} from '../shared.jsx';
import { TourAdminNav } from '../TourismShell.jsx';
import { useDebouncedValue } from '../../../lib/useDebouncedValue.js';

const EMPTY_FORM = {
  id: null,
  title: '',
  titleTw: '',
  summary: '',
  summaryTw: '',
  body: '',
  bodyTw: '',
  type: 'festival',
  status: 'published',
};

function typeOptions(t) {
  return ARTICLE_TYPES.map((value) => ({ key: value, label: t(`tour.articleType.${value}`) }));
}

function statusOptions(t) {
  return [
    { key: 'published', label: t('tour.admin.articleStatus.published') },
    { key: 'offline', label: t('tour.admin.articleStatus.offline') },
  ];
}

export default function AdminTourArticles() {
  const { t, i18n } = useTranslation();
  const isTw = String(i18n.language || '').startsWith('zh-TW');
  // 第二列永远显示「另一种语言」:繁中界面显示简体源(titleCn),简中界面显示繁体(titleTw)。
  const otherLangLabel = isTw ? t('common.simplified') : t('common.traditional');
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
      const data = await api.get(`/tourism/admin/articles?${params.toString()}`);
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

  // zh-TW 下中间件会把 title 换成繁体,编辑回填用 titleCn 拿回简体原文。
  const openEdit = (row) => {
    setForm({
      id: row.id,
      title: row.titleCn ?? row.title ?? '',
      titleTw: row.titleTw ?? '',
      summary: row.summaryCn ?? row.summary ?? '',
      summaryTw: row.summaryTw ?? '',
      body: row.bodyCn ?? row.body ?? '',
      bodyTw: row.bodyTw ?? '',
      type: row.type,
      status: row.status,
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        titleTw: form.titleTw.trim(),
        summary: form.summary,
        summaryTw: form.summaryTw,
        body: form.body,
        bodyTw: form.bodyTw,
        type: form.type,
        status: form.status,
      };
      if (form.id) await api.patch(`/tourism/admin/articles/${form.id}`, payload);
      else await api.post('/tourism/admin/articles', payload);
      setFormOpen(false);
      toastSuccess(t('common.saved'));
      await load();
    } catch (err) {
      toastTourError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (row) => {
    try {
      await api.patch(`/tourism/admin/articles/${row.id}`, {
        status: row.status === 'published' ? 'offline' : 'published',
      });
      toastSuccess(t(row.status === 'published' ? 'tour.admin.articleOfflineDone' : 'tour.admin.articleOnlineDone'));
      await load();
    } catch (err) {
      toastTourError(t, err);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.del(`/tourism/admin/articles/${deleteTarget.id}`);
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
    { title: t('tour.admin.field.no'), dataIndex: 'no', width: 180 },
    { title: t('tour.admin.field.title'), dataIndex: 'title' },
    {
      title: t('tour.admin.field.title') + ' · ' + otherLangLabel,
      dataIndex: 'title',
      render: (v, row) => (isTw ? (row.titleCn ?? row.titleTw ?? row.title) : row.titleTw) || '-',
    },
    {
      title: t('tour.admin.field.type'),
      dataIndex: 'type',
      width: 90,
      render: (v) => (
        <Tag size="small" color={ARTICLE_TYPE_COLORS[v] || 'brown'} variant="soft">
          {t(`tour.articleType.${v}`)}
        </Tag>
      ),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 90,
      render: (v) => (
        <Tag size="small" color={v === 'published' ? 'app-green' : 'brown'} variant="soft">
          {t(v === 'published' ? 'tour.admin.articleStatus.published' : 'tour.admin.articleStatus.offline')}
        </Tag>
      ),
    },
    { title: t('tour.admin.field.publishedAt'), dataIndex: 'publishedAt', width: 110, render: fmtDate },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 210,
      render: (_, row) => (
        <div className="table-actions">
          <Button size="small" onClick={() => toggleStatus(row)}>
            {t(row.status === 'published' ? 'tour.admin.articleOffline' : 'tour.admin.articleOnline')}
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
        <h1 className="page-title">
          <Title size="middle" color="app-teal">
            {t('tour.admin.articles.title')}
          </Title>
        </h1>
      </div>

      <Card>
        <p className="muted-text">{t('tour.admin.articles.tip')}</p>
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
            prefix={<BookIcon size={14} />}
            placeholder={t('tour.admin.articles.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onClear={() => setQ('')}
          />
          <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
            {t('tour.admin.articles.create')}
          </Button>
        </div>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('tour.admin.articles.empty')}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={formOpen}
        title={form.id ? t('tour.admin.articles.edit') : t('tour.admin.articles.create')}
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
            <Button type="primary" loading={busy} disabled={busy || !form.title.trim()} onClick={save}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="tour-form">
          <div className="tour-form-grid">
            <label>
              {t('tour.admin.field.title')} *
              <Input
                size="large"
                value={form.title}
                maxLength={120}
                placeholder={t('tour.admin.articles.titlePlaceholder')}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              {t('tour.admin.field.title')} · {t('common.traditional')}
              <Input
                size="large"
                value={form.titleTw}
                maxLength={120}
                placeholder={t('common.twOptional')}
                onChange={(e) => setForm({ ...form, titleTw: e.target.value })}
              />
            </label>
            <label>
              {t('tour.admin.field.type')}
              <Select value={form.type} onChange={(key) => setForm({ ...form, type: key })} options={typeOptions(t)} />
            </label>
            <label>
              {t('common.status')}
              <Select
                value={form.status}
                onChange={(key) => setForm({ ...form, status: key })}
                options={statusOptions(t)}
              />
            </label>
          </div>
          <label>
            {t('tour.admin.field.summary')}
            <TextArea rows={2} maxLength={300} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </label>
          <label>
            {t('tour.admin.field.summary')} · {t('common.traditional')}
            <TextArea rows={2} maxLength={300} value={form.summaryTw} onChange={(e) => setForm({ ...form, summaryTw: e.target.value })} />
          </label>
          <label>
            {t('tour.admin.field.body')}
            <TextArea rows={6} maxLength={6000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </label>
          <label>
            {t('tour.admin.field.body')} · {t('common.traditional')}
            <TextArea rows={6} maxLength={6000} value={form.bodyTw} onChange={(e) => setForm({ ...form, bodyTw: e.target.value })} />
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
            <Button type="primary" danger loading={deleteBusy} disabled={deleteBusy} onClick={remove}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="muted-text">{t('tour.admin.articles.deleteTip', { title: deleteTarget?.title ?? '' })}</p>
      </Modal>
    </div>
  );
}
