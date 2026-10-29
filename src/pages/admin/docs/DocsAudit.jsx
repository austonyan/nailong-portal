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

const DETAIL_FIELDS = {
  appNo: 'docs.admin.audit.detailFields.appNo',
  typeCode: 'docs.admin.audit.detailFields.typeCode',
  certNo: 'docs.admin.audit.detailFields.certNo',
  newCertNo: 'docs.admin.audit.detailFields.newCertNo',
  auto: 'docs.admin.audit.detailFields.auto',
  reasonCode: 'docs.admin.audit.detailFields.reason',
  reason: 'docs.admin.audit.detailFields.reasonText',
  days: 'docs.admin.audit.detailFields.days',
  name: 'docs.admin.audit.detailFields.name',
  title: 'docs.admin.audit.detailFields.title',
  enabled: 'docs.admin.audit.detailFields.enabled',
  updated: 'docs.admin.audit.detailFields.updated',
  fields: 'docs.admin.audit.detailFields.fields',
  query: 'docs.admin.audit.detailFields.query',
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

  // 审计 detail 是 JSON 文本:按已知字段渲染,不再把整段 JSON 塞进表格。
  const detailValue = (key, value) => {
    if (key === 'reasonCode') return t(`docs.reason.${value}`, { defaultValue: t('common.unknown') });
    if (key === 'enabled' || key === 'auto') return value ? t('common.yes') : t('common.no');
    if (Array.isArray(value)) return value.join(', ');
    if (value && typeof value === 'object') return Object.values(value).join(', ');
    return String(value);
  };
  const renderDetail = (raw) => {
    let detail = raw;
    if (typeof raw === 'string') {
      try {
        detail = JSON.parse(raw);
      } catch {
        return <span className="docs-audit-detail">{raw}</span>;
      }
    }
    if (!detail || typeof detail !== 'object') return '-';
    const rows = Object.entries(detail).filter(
      ([key, value]) => DETAIL_FIELDS[key] && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)
    );
    if (!rows.length) return '-';
    return (
      <span className="docs-audit-detail">
        {rows.map(([key, value], index) => (
          <span key={key}>
            {index > 0 ? ' · ' : ''}
            <b>{t(DETAIL_FIELDS[key])}</b>: {detailValue(key, value)}
          </span>
        ))}
      </span>
    );
  };

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page, pageSize, action, q: dq });
      const d = await api.get(`/docs/admin/audit?${params.toString()}`);
      setItems(d.items);
      setTotal(d.total);
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
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
          {t(`docs.admin.audit.actions.${v}`, { defaultValue: t('common.unknown') })}
        </Tag>
      ),
    },
    {
      title: t('docs.admin.audit.target'),
      width: 180,
      render: (_, r) => (
        <span>
          {t(`docs.admin.audit.targetTypes.${r.targetType}`, { defaultValue: t('common.unknown') })}
          {r.targetId ? ` ${r.targetId}` : ''}
        </span>
      ),
    },
    { title: t('docs.admin.audit.detail'), dataIndex: 'detail', render: (v) => renderDetail(v) },
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
