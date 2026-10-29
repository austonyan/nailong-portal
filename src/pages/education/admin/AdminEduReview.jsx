// 内容审核队列(edu:review 独立挂载,与内容管理隔离):待审词条/文章、
// 通过/驳回、审核历史。驳回必须填写审核意见,通过时意见可选。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Drawer, Input, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { EyeIcon, ThumbsUpIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { CONTENT_TARGETS, StatusTag, TargetTypeTag, TextArea, fmtDateTime, toastEduError } from '../shared.jsx';
import { toastError, toastSuccess } from '../../../components/toast.js';
import { useDebouncedValue } from '../../../lib/useDebouncedValue.js';

const TYPE_FILTERS = ['', ...CONTENT_TARGETS];

export default function AdminEduReview() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [stats, setStats] = useState({ entry: 0, article: 0 });
  const [typeFilter, setTypeFilter] = useState('');
  const [q, setQ] = useState('');
  // 检索词 300ms 防抖:逐键输入不再每字打一次接口。
  const dq = useDebouncedValue(q, 300);
  const [detail, setDetail] = useState(null);
  const [action, setAction] = useState(null); // 'approve' | 'reject'
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyType, setHistoryType] = useState('');
  // 审核详情只回 categoryCode;名称从分类字典解析,取不到就显示「未知」。
  const [categories, setCategories] = useState([]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (typeFilter) params.set('targetType', typeFilter);
    if (dq.trim()) params.set('q', dq.trim());
    try {
      const data = await api.get(`/education/admin/review/queue?${params.toString()}`);
      setItems(data.items ?? []);
      setStats(data.stats ?? { entry: 0, article: 0 });
    } catch (err) {
      toastEduError(t, err);
      setItems([]);
    }
  }, [dq, typeFilter, t]);

  useEffect(() => {
    load();
  }, [load]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api.get(`/education/admin/review/history${historyType ? `?targetType=${historyType}` : ''}`);
      setHistory(data.items ?? []);
    } catch (err) {
      toastEduError(t, err);
      setHistory([]);
    }
  }, [historyType, t]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 分类字典只用于回显名称,取不到(权限/网络)不影响审核主流程。
  useEffect(() => {
    let alive = true;
    api
      .get('/education/categories')
      .then((data) => {
        if (alive) setCategories(data.items ?? []);
      })
      .catch(() => {
        if (alive) setCategories([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const categoryName = (code) =>
    categories.find((item) => item.code === code)?.name ?? t('common.unknown');

  const openDetail = async (row) => {
    try {
      const data = await api.get(`/education/admin/review/items/${row.targetType}/${row.id}`);
      setDetail(data.item);
    } catch (err) {
      toastEduError(t, err);
    }
  };

  const openAction = (kind) => {
    setNote('');
    setAction(kind);
  };

  const runAction = async () => {
    if (!detail) return;
    if (action === 'reject' && !note.trim()) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      await api.post(`/education/admin/review/items/${detail.targetType}/${detail.id}/${action}`, {
        note: note.trim(),
      });
      const approved = action === 'approve';
      setAction(null);
      setDetail(null);
      toastSuccess(t(approved ? 'edu.admin.review.approved' : 'edu.admin.review.rejected'));
      await load();
      await loadHistory();
    } catch (err) {
      toastEduError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { title: t('edu.field.no'), dataIndex: 'no', width: 170 },
    { title: t('edu.field.title'), dataIndex: 'title' },
    {
      title: t('edu.field.type'),
      dataIndex: 'targetType',
      width: 90,
      render: (v) => <TargetTypeTag value={v} />,
    },
    { title: t('edu.field.submitter'), dataIndex: 'submitter', width: 120 },
    { title: t('edu.field.submittedAt'), dataIndex: 'submittedAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 210,
      render: (_, row) => (
        <div className="table-actions">
          <Button size="small" icon={<EyeIcon />} onClick={() => openDetail(row)}>
            {t('edu.admin.review.view')}
          </Button>
          <Button size="small" type="primary" icon={<ThumbsUpIcon />} onClick={() => openDetail(row).then(() => openAction('approve'))}>
            {t('edu.admin.review.approve')}
          </Button>
          <Button size="small" danger onClick={() => openDetail(row).then(() => openAction('reject'))}>
            {t('edu.admin.review.reject')}
          </Button>
        </div>
      ),
    },
  ];

  const historyColumns = [
    { title: t('edu.field.targetNo'), dataIndex: 'targetNo', width: 170 },
    {
      title: t('edu.field.type'),
      dataIndex: 'targetType',
      width: 90,
      render: (v) => <TargetTypeTag value={v} />,
    },
    {
      title: t('edu.admin.review.action'),
      dataIndex: 'action',
      width: 90,
      render: (v) => <StatusTag value={v} prefix="edu.admin.reviewAction" />,
    },
    { title: t('edu.admin.review.note'), dataIndex: 'note', render: (v) => v || '-' },
    { title: t('edu.field.reviewer'), dataIndex: 'reviewerName', width: 120 },
    { title: t('edu.field.reviewedAt'), dataIndex: 'createdAt', width: 150, render: fmtDateTime },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle" color="app-yellow">
          {t('edu.admin.review.title')}
        </Title>
      </div>
      <p className="muted-text">{t('edu.admin.review.tip')}</p>

      <Card>
        <div className="edu-search-row">
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            options={TYPE_FILTERS.map((v) => ({
              key: v,
              label: v === '' ? t('edu.admin.allTypes') : t(`edu.targetType.${v}`),
            }))}
            aria-label={t('edu.field.type')}
          />
          <Input
            size="large"
            allowClear
            placeholder={t('edu.admin.review.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onClear={() => setQ('')}
          />
        </div>
        <div className="edu-meta">
          <Tag size="small" color="app-blue" variant="soft">
            {t('edu.admin.review.pendingEntries', { count: stats.entry })}
          </Tag>
          <Tag size="small" color="app-teal" variant="soft">
            {t('edu.admin.review.pendingArticles', { count: stats.article })}
          </Tag>
        </div>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey={(row) => `${row.targetType}-${row.id}`}
          pagination={false}
          emptyText={t('edu.admin.review.queueEmpty')}
        />
      </Card>

      <Card>
        <div className="edu-section-head">
          <Title size="small">{t('edu.admin.review.historyTitle')}</Title>
          <Select
            value={historyType}
            onChange={setHistoryType}
            options={TYPE_FILTERS.map((v) => ({
              key: v,
              label: v === '' ? t('edu.admin.allTypes') : t(`edu.targetType.${v}`),
            }))}
            aria-label={t('edu.field.type')}
          />
        </div>
        <Table
          className="table-fit"
          columns={historyColumns}
          dataSource={history ?? []}
          loading={history === null}
          rowKey="id"
          pagination={false}
          emptyText={t('common.empty')}
        />
      </Card>

      <Drawer
        maskClosable={false}
        open={detail !== null}
        title={detail?.title}
        onClose={() => {
          if (busy) return;
          setDetail(null);
        }}
        width={620}
      >
        {detail && (
          <div className="edu-section">
            <div className="edu-meta">
              <TargetTypeTag value={detail.targetType} />
              <StatusTag value={detail.status} />
              <span>{detail.no}</span>
            </div>
            <div className="edu-info-row">
              <span className="edu-info-label">{t('edu.field.submitter')}</span>
              <span>{detail.submitter || '-'}</span>
            </div>
            {detail.categoryCode && (
              <div className="edu-info-row">
                <span className="edu-info-label">{t('edu.field.category')}</span>
                <span>{categoryName(detail.categoryCode)}</span>
              </div>
            )}
            <div className="edu-info-row">
              <span className="edu-info-label">{t('edu.field.summary')}</span>
              <span>{detail.summary || '-'}</span>
            </div>
            <div className="edu-info-row">
              <span className="edu-info-label">{t('edu.field.body')}</span>
            </div>
            <div className="edu-body">{detail.body}</div>
            {(detail.reviewHistory ?? []).length > 0 && (
              <>
                <Title size="small">{t('edu.admin.review.historyTitle')}</Title>
                {detail.reviewHistory.map((item) => (
                  <div key={item.id} className="edu-info-row">
                    <StatusTag value={item.action} prefix="edu.admin.reviewAction" />
                    <span>{item.note || '-'}</span>
                    <span className="muted-text">
                      {item.reviewerName} · {fmtDateTime(item.createdAt)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        maskClosable={false}
        open={action !== null}
        title={t(action === 'approve' ? 'edu.admin.review.approveTitle' : 'edu.admin.review.rejectTitle', {
          title: detail?.title ?? '',
        })}
        onClose={() => {
          if (busy) return;
          setAction(null);
        }}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setAction(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" danger={action === 'reject'} loading={busy} disabled={busy} onClick={runAction}>
              {t(action === 'approve' ? 'edu.admin.review.approve' : 'edu.admin.review.reject')}
            </Button>
          </>
        }
      >
        <p className="muted-text">
          {t(action === 'approve' ? 'edu.admin.review.approveTip' : 'edu.admin.review.rejectTip')}
        </p>
        <label>
          {t('edu.admin.review.note')}
          {action === 'reject' ? ' *' : ''}
          <TextArea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </Modal>
    </div>
  );
}
