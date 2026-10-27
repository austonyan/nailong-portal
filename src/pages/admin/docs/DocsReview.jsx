import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Drawer, Input, Modal, Pagination, Select, Table, Tag, Title } from 'animal-island-ui';
import { SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { APPLICATION_STATUS_COLORS, REJECT_REASON_KEYS } from '../../../api/docs.js';
import MaterialList from '../../docs/MaterialList.jsx';
import DocsTextarea from '../../../components/DocsTextarea.jsx';
import { toastSuccess, toastError } from '../../../components/toast.js';

// 认证审核工作台: 队列隔离,认证员只处理文书认证队列。
export default function DocsReview() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending,supplementing');
  const [typeCode, setTypeCode] = useState('all');
  const [q, setQ] = useState('');
  const [types, setTypes] = useState([]);
  const [detail, setDetail] = useState(null); // full application for the drawer
  const [acting, setActing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('materials_incomplete');
  const [rejectComment, setRejectComment] = useState('');
  const [supplementOpen, setSupplementOpen] = useState(false);
  const [supplementNote, setSupplementNote] = useState('');
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveComment, setApproveComment] = useState('');
  const pageSize = 10;

  const loadTypes = useCallback(() => {
    api
      .get('/docs/admin/types')
      .then((d) => setTypes(d.items))
      .catch(() => setTypes([]));
  }, []);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page, pageSize, status, typeCode, q });
      const d = await api.get(`/docs/admin/queue?${params.toString()}`);
      setItems(d.items);
      setTotal(d.total);
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
      setItems([]);
    }
  }, [page, status, typeCode, q, t]);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);
  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (row) => {
    try {
      const d = await api.get(`/docs/applications/${row.id}`);
      setDetail(d.item);
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
    }
  };

  const act = async (path, body) => {
    setActing(true);
    try {
      await api.post(`/docs/admin/applications/${detail.id}/${path}`, body);
      toastSuccess(t('docs.admin.review.done'));
      const d = await api.get(`/docs/applications/${detail.id}`);
      setDetail(d.item);
      setRejectOpen(false);
      setSupplementOpen(false);
      setApproveOpen(false);
      setRejectComment('');
      setSupplementNote('');
      setApproveComment('');
      load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
    } finally {
      setActing(false);
    }
  };

  const canDecide = detail && detail.status === 'pending';

  const columns = [
    { title: t('docs.appList.appNo'), dataIndex: 'appNo', width: 170 },
    { title: t('docs.appList.type'), dataIndex: 'typeName', width: 120 },
    { title: t('docs.admin.review.applicant'), dataIndex: 'nickname', width: 110 },
    { title: t('docs.admin.review.username'), dataIndex: 'username', width: 110 },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 100,
      render: (v) => (
        <Tag color={APPLICATION_STATUS_COLORS[v] || 'default'} variant="soft">
          {t(`docs.status.${v}`)}
        </Tag>
      ),
    },
    { title: t('docs.admin.review.materials'), dataIndex: 'materialCount', width: 80, align: 'center' },
    { title: t('docs.appList.submittedAt'), dataIndex: 'submittedAt', width: 110, render: (v) => String(v || '').slice(0, 10) },
    {
      title: t('common.actions'),
      width: 90,
      render: (_, row) => (
        <Button size="small" onClick={() => openDetail(row)}>
          {t('docs.admin.review.review')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('docs.admin.review.title')}</Title>
      </div>
      <Card className="docs-filter-card">
        <div className="docs-filter-row">
          <Select
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { key: 'pending,supplementing', label: t('docs.admin.review.active') },
              { key: 'pending', label: t('docs.status.pending') },
              { key: 'supplementing', label: t('docs.status.supplementing') },
              { key: 'all', label: t('docs.filter.allStatus') },
            ]}
          />
          <Select
            value={typeCode}
            onChange={(v) => {
              setTypeCode(v);
              setPage(1);
            }}
            options={[{ key: 'all', label: t('docs.filter.allTypes') }, ...types.map((tp) => ({ key: tp.code, label: tp.name }))]}
          />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('docs.admin.review.searchPh')} allowClear />
          <Button type="primary" icon={<SearchIcon />} onClick={() => { setPage(1); load(); }}>
            {t('common.search')}
          </Button>
        </div>
      </Card>

      <Card>
        <Table className="table-fit"
          columns={columns}
          dataSource={items || []}
          rowKey="id"
          loading={items === null}
          emptyText={t('docs.admin.review.queueEmpty')}
          pagination={false}
        />
        {total > pageSize && (
          <div className="docs-pagination">
            <Pagination total={total} current={page} pageSize={pageSize} onChange={setPage} showTotal />
          </div>
        )}
      </Card>

      <Drawer maskClosable={false} open={!!detail} title={detail ? `${t('docs.admin.review.detailTitle')} · ${detail.appNo}` : ''} width={620} onClose={() => setDetail(null)}>
        {detail && (
          <div className="docs-review-detail">
            <dl className="docs-kv">
              <dt>{t('docs.appList.type')}</dt>
              <dd>{detail.type?.name}</dd>
              <dt>{t('docs.apply.nickname')}</dt>
              <dd>{detail.nickname}</dd>
              <dt>{t('docs.apply.contact')}</dt>
              <dd>{detail.contact || '—'}</dd>
              {detail.type?.bizNoLabel && (
                <>
                  <dt>{detail.type.bizNoLabel}</dt>
                  <dd>{detail.bizNo || '—'}</dd>
                </>
              )}
              <dt>{t('docs.apply.purpose')}</dt>
              <dd>{t(`docs.purpose.${detail.purpose}`)}</dd>
              {Object.entries(detail.formData || {})
                .filter(([, v]) => v)
                .flatMap(([k, v]) => [
                  <dt key={k}>{detail.type?.formFields?.find((f) => f.key === k)?.label || k}</dt>,
                  <dd key={`${k}-v`}>{v}</dd>,
                ])}
            </dl>

            <h4>{t('docs.detail.materialsTitle')}</h4>
            <MaterialList materials={detail.materials} type={detail.type} />

            <h4>{t('docs.detail.recordsTitle')}</h4>
            <ul className="docs-timeline">
              {(detail.records || []).map((r) => (
                <li key={r.id}>
                  <span className="docs-timeline-dot" />
                  <div>
                    <strong>{t(`docs.record.${r.action}`, { defaultValue: r.action })}</strong>
                    {r.comment && <p className="muted-text">{r.comment}</p>}
                    <p className="muted-text">
                      {String(r.createdAt).slice(0, 16).replace('T', ' ')} · {r.actorName}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="docs-review-actions">
              {canDecide && (
                <>
                  <Button type="primary" loading={acting} onClick={() => setApproveOpen(true)} disabled={acting}>
                    {t('docs.admin.review.approve')}
                  </Button>
                  <Button danger onClick={() => setRejectOpen(true)}>
                    {t('docs.admin.review.reject')}
                  </Button>
                  <Button onClick={() => setSupplementOpen(true)}>{t('docs.admin.review.supplement')}</Button>
                </>
              )}
              {detail.status === 'supplementing' && <p className="muted-text">{t('docs.admin.review.waitingResubmit')}</p>}
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={approveOpen}
        title={t('docs.admin.review.approveConfirmTitle')}
        typewriter={false}
        onClose={() => {
          if (!acting) setApproveOpen(false);
        }}
        maskClosable={false}
        footer={
          <>
            <Button onClick={() => setApproveOpen(false)} disabled={acting}>{t('common.cancel')}</Button>
            <Button type="primary" loading={acting} onClick={() => act('approve', { comment: approveComment })}>
              {t('docs.admin.review.approveAndIssue')}
            </Button>
          </>
        }
      >
        <p className="muted-text">{t('docs.admin.review.approveTip')}</p>
        <Input value={approveComment} onChange={(e) => setApproveComment(e.target.value)} placeholder={t('docs.admin.review.commentPh')} allowClear />
      </Modal>

      <Modal
        open={rejectOpen}
        title={t('docs.admin.review.rejectTitle')}
        typewriter={false}
        onClose={() => {
          if (!acting) setRejectOpen(false);
        }}
        maskClosable={false}
        footer={
          <>
            <Button onClick={() => setRejectOpen(false)} disabled={acting}>{t('common.cancel')}</Button>
            <Button type="primary" danger loading={acting} disabled={acting || !rejectReason} onClick={() => act('reject', { reasonCode: rejectReason, comment: rejectComment })}>
              {t('docs.admin.review.reject')}
            </Button>
          </>
        }
      >
        <p className="muted-text">{t('docs.admin.review.rejectTip')}</p>
        <Select
          value={rejectReason}
          onChange={setRejectReason}
          options={REJECT_REASON_KEYS.map((k) => ({ key: k, label: t(`docs.reason.${k}`) }))}
        />
        <DocsTextarea value={rejectComment} onChange={setRejectComment} placeholder={t('docs.admin.review.commentPh')} maxLength={300} />
      </Modal>

      <Modal
        open={supplementOpen}
        title={t('docs.admin.review.supplementTitle')}
        typewriter={false}
        onClose={() => {
          if (!acting) setSupplementOpen(false);
        }}
        maskClosable={false}
        footer={
          <>
            <Button onClick={() => setSupplementOpen(false)} disabled={acting}>{t('common.cancel')}</Button>
            <Button type="primary" loading={acting} disabled={acting || !supplementNote.trim()} onClick={() => act('require-supplement', { note: supplementNote })}>
              {t('docs.admin.review.supplementSend')}
            </Button>
          </>
        }
      >
        <p className="muted-text">{t('docs.admin.review.supplementTip')}</p>
        <DocsTextarea value={supplementNote} onChange={setSupplementNote} placeholder={t('docs.admin.review.supplementPh')} maxLength={300} />
      </Modal>
    </div>
  );
}
