import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Pagination, Table, Tag, Title } from 'animal-island-ui';
import { SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastError } from '../../../components/toast.js';
import { useDebouncedValue } from '../../../lib/useDebouncedValue.js';
import { fmtDateTime } from '../../../lib/date.js';

const ACTION_COLORS = {
  certify_approve: 'app-green',
  certify_reject: 'app-red',
  certificate_revoke: 'app-red',
  certificate_mark_used: 'app-blue',
  certificate_regenerate: 'app-teal',
  config_update: 'purple',
  type_create: 'app-teal',
  type_update: 'app-blue',
  blacklist_add: 'app-red',
  blacklist_remove: 'app-green',
  verify_rate_limited: 'app-orange',
};

export default function DocsAudit() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  // 检索词 300ms 防抖:逐键输入不再每字打一次接口。
  const dq = useDebouncedValue(q, 300);
  const pageSize = 15;

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page, pageSize, action, q: dq });
      const d = await api.get(`/docs/admin/audit?${params.toString()}`);
      setItems(d.items);
      setTotal(d.total);
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
      setItems([]);
    }
  }, [page, action, dq, t]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { title: t('docs.admin.audit.time'), dataIndex: 'createdAt', width: 170, render: (v) => fmtDateTime(v) },
    { title: t('docs.admin.audit.actor'), dataIndex: 'actorName', width: 120 },
    {
      title: t('docs.admin.audit.action'),
      dataIndex: 'action',
      width: 210,
      render: (v) => (
        <Tag color={ACTION_COLORS[v] || 'default'} variant="soft">
          {t(`docs.admin.audit.actions.${v}`, { defaultValue: v })}
        </Tag>
      ),
    },
    { title: t('docs.admin.audit.target'), width: 180, render: (_, r) => `${r.targetType} ${r.targetId}` },
    { title: t('docs.admin.audit.detail'), dataIndex: 'detail', render: (v) => <span className="docs-cell-clip docs-audit-detail">{v}</span> },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('docs.admin.audit.title')}</Title>
      </div>
      <Card className="docs-filter-card">
        <div className="docs-filter-row">
          <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder={t('docs.admin.audit.actionPh')} allowClear />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('docs.admin.audit.targetPh')} allowClear />
          <Button type="primary" icon={<SearchIcon />} onClick={() => { setPage(1); load(); }}>
            {t('common.search')}
          </Button>
        </div>
      </Card>
      <Card>
        <Table className="table-fit" columns={columns} dataSource={items || []} rowKey="id" loading={items === null} emptyText={t('common.empty')} pagination={false} />
        {total > pageSize && (
          <div className="docs-pagination">
            <Pagination total={total} current={page} pageSize={pageSize} onChange={setPage} showTotal />
          </div>
        )}
      </Card>
    </div>
  );
}
