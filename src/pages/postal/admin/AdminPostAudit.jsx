// 审计:敏感操作的留痕查询(操作人、动作、对象、详情与时间)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Pagination, Table, Tag, Title } from 'animal-island-ui';
import { SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { fmtDateTime, toastPostError } from '../shared.jsx';

const PAGE_SIZE = 30;

export default function AdminPostAudit() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (query) params.set('action', query);
      const data = await api.get(`/postal/admin/audit?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toastPostError(t, err);
      setItems([]);
      setTotal(0);
    }
  }, [page, query, t]);

  useEffect(() => {
    load();
  }, [load]);

  // 服务端写入的动作码与对象类型都走词条;未知值不把英文码直接摊到界面上。
  const actionLabel = (v) => (v ? t(`post.admin.audit.actionName.${v}`, { defaultValue: t('common.unknown') }) : '-');
  const targetTypeLabel = (v) => (v ? t(`post.admin.audit.targetType.${v}`, { defaultValue: t('common.unknown') }) : '-');

  const columns = [
    { title: t('post.admin.audit.actor'), dataIndex: 'actorName', width: 130, render: (v) => v || t('post.admin.audit.system') },
    {
      title: t('post.admin.audit.action'),
      dataIndex: 'action',
      width: 220,
      render: (v) => (
        <Tag color="app-blue" variant="soft" size="small">
          {actionLabel(v)}
        </Tag>
      ),
    },
    {
      title: t('post.admin.audit.target'),
      dataIndex: 'targetId',
      width: 200,
      render: (_, row) => `${targetTypeLabel(row.targetType)} ${row.targetId || ''}`.trim(),
    },
    {
      title: t('post.admin.audit.detail'),
      dataIndex: 'detail',
      render: (value) => (value && Object.keys(value).length ? JSON.stringify(value) : '-'),
    },
    { title: t('post.admin.audit.time'), dataIndex: 'createdAt', width: 150, render: fmtDateTime },
  ];

  return (
    <div className="postal-section">
      <div className="postal-section-head">
        <h1 className="page-title">
          <Title size="middle" color="brown">
            {t('post.admin.audit.title')}
          </Title>
        </h1>
      </div>

      <Card>
        <div className="postal-filter-bar">
          <Input
            size="middle"
            allowClear
            value={keyword}
            placeholder={t('post.admin.audit.searchPlaceholder')}
            onChange={(e) => setKeyword(e.target.value)}
            onClear={() => {
              setKeyword('');
              setQuery('');
              setPage(1);
            }}
          />
          <Button
            icon={<SearchIcon />}
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
    </div>
  );
}