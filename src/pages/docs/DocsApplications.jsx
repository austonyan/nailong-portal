import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Modal, Pagination, Select, Table, Tag, Title } from 'animal-island-ui';
import { EyeIcon, PencilIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { APPLICATION_STATUS_COLORS } from '../../api/docs.js';
import { toastSuccess, toastError } from '../../components/toast.js';
import { fmtDate } from '../../lib/date.js';

const STATUS_OPTIONS = ['all', 'draft', 'pending', 'supplementing', 'approved', 'rejected', 'withdrawn'];

export default function DocsApplications() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const pageSize = 10;

  const load = useCallback(async () => {
    try {
      const d = await api.get(`/docs/applications?page=${page}&pageSize=${pageSize}&status=${status}`);
      setItems(d.items);
      setTotal(d.total);
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
      setItems([]);
    }
  }, [page, status, t]);

  useEffect(() => {
    load();
  }, [load]);

  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/docs/applications/${deleteTarget.id}`);
      toastSuccess(t('docs.appList.deleted'));
      setDeleteTarget(null);
      load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
    }
  };

  const columns = [
    { title: t('docs.appList.appNo'), dataIndex: 'appNo', width: 170 },
    { title: t('docs.appList.type'), dataIndex: 'typeName', width: 130 },
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
    { title: t('docs.appList.submittedAt'), dataIndex: 'submittedAt', width: 110, render: (v) => fmtDate(v) },
    { title: t('common.createdAt'), dataIndex: 'updatedAt', width: 110, render: (v) => fmtDate(v) },
    {
      title: t('common.actions'),
      width: 150,
      render: (_, row) => (
        <div className="table-actions">
          <Button size="small" icon={<EyeIcon />} onClick={() => navigate(`/docs/applications/${row.id}`)}>
            {t('docs.actions.view')}
          </Button>
          {row.status === 'draft' && (
            <>
              <Button size="small" icon={<PencilIcon />} onClick={() => navigate(`/docs/apply?draft=${row.id}`)}>
                {t('common.edit')}
              </Button>
              <Button size="small" danger icon={<TrashIcon />} onClick={() => setDeleteTarget(row)} />
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('docs.appList.title')}</Title>
        <div className="docs-filter">
          <Select
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={STATUS_OPTIONS.map((s) => ({ key: s, label: s === 'all' ? t('docs.filter.all') : t(`docs.status.${s}`) }))}
          />
        </div>
      </div>
      <Card>
        <Table className="table-fit"
          columns={columns}
          dataSource={items || []}
          rowKey="id"
          loading={items === null}
          emptyText={t('common.empty')}
          pagination={false}
        />
        {total > pageSize && (
          <div className="docs-pagination">
            <Pagination total={total} current={page} pageSize={pageSize} onChange={(p) => setPage(p)} showTotal />
          </div>
        )}
      </Card>

      <Modal
        maskClosable={false}
        open={!!deleteTarget}
        title={t('common.confirmDeleteTitle')}
        typewriter={false}
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button type="primary" danger onClick={doDelete}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p>
          {t('docs.appList.deleteConfirm', { no: deleteTarget?.appNo })}
        </p>
      </Modal>
    </div>
  );
}
