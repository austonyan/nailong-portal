// 访问日志 — 谁、何时、看了哪一类档案(含导出行为)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Select, Table, Tag, Title } from 'animal-island-ui';
import { SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { ArchAdminNav, fmtDateTime, toastArchError } from '../shared.jsx';
import { useDebouncedValue } from '../../../lib/useDebouncedValue.js';

const ACTION_OPTIONS = [
  { key: '', labelKey: 'arch.admin.access.allActions' },
  { key: 'list', labelKey: 'arch.admin.action.list' },
  { key: 'detail', labelKey: 'arch.admin.action.detail' },
  { key: 'export', labelKey: 'arch.admin.action.export' },
];

const OFFICE_OPTIONS = [
  { key: '', labelKey: 'arch.catalog.allOffices' },
  { key: 'visa', labelKey: 'arch.office.visa' },
  { key: 'immigration', labelKey: 'arch.office.immigration' },
];

const ACTION_TAG = {
  list: { color: 'app-blue', variant: 'soft' },
  detail: { color: 'app-teal', variant: 'soft' },
  export: { color: 'app-orange', variant: 'soft' },
};

export default function AdminArchAccess() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState('');
  // 账号 ID 检索 300ms 防抖:避免逐键打接口。
  const userIdDebounced = useDebouncedValue(userId, 300);
  const [action, setAction] = useState('');
  const [office, setOffice] = useState('');
  const pageSize = 15;

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (userIdDebounced) params.set('userId', userIdDebounced);
    if (action) params.set('action', action);
    if (office) params.set('office', office);
    api
      .get(`/archives/admin/access-logs?${params}`)
      .then((data) => {
        const rows = data.items ?? [];
        setItems(rows);
        setTotal(data.total);
        // 总条数变小时把页码夹回合法范围,避免停在空表。
        if (rows.length === 0 && page > 1) setPage(Math.max(1, page - 1));
      })
      .catch((err) => {
        toastArchError(err);
        setItems([]);
      });
  }, [page, userIdDebounced, action, office]);

  useEffect(load, [load]);

  const search = () => {
    setPage(1);
    load();
  };

  const columns = [
    { title: t('common.createdAt'), dataIndex: 'createdAt', width: 150, render: (v) => fmtDateTime(v) },
    {
      title: t('arch.admin.access.user'),
      dataIndex: 'displayName',
      width: 150,
      render: (v, record) => (record.username ? `${v || record.username} (@${record.username})` : '-'),
    },
    {
      title: t('arch.admin.access.action'),
      dataIndex: 'action',
      width: 100,
      render: (v) => (
        <Tag color={(ACTION_TAG[v] ?? { color: 'default', variant: 'soft' }).color} variant={(ACTION_TAG[v] ?? { variant: 'soft' }).variant} size="small">
          {t(`arch.admin.action.${v}`, { defaultValue: t('common.unknown') })}
        </Tag>
      ),
    },
    { title: t('arch.catalog.office'), dataIndex: 'office', width: 110, render: (v) => (v ? t(`arch.office.${v}`) : <span className="muted-text">-</span>) },
    { title: t('arch.admin.access.recordType'), dataIndex: 'recordType', width: 140, render: (v) => (v ? t(`arch.recordType.${v}`, { defaultValue: t('common.unknown') }) : <span className="muted-text">-</span>) },
    { title: t('arch.admin.access.detail'), dataIndex: 'detail', render: (v) => <span className="arch-note">{JSON.stringify(v)}</span> },
    { title: 'IP', dataIndex: 'ip', width: 120, render: (v) => v || <span className="muted-text">-</span> },
  ];

  return (
    <div className="arch-page">
      <ArchAdminNav />
      <div className="page-header">
        <Title size="middle" color="brown">
          {t('arch.admin.access.title')}
        </Title>
      </div>

      <Card>
        <div className="arch-toolbar">
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={t('arch.admin.records.userId')} allowClear maxLength={20} />
          <Select value={action} onChange={setAction} options={ACTION_OPTIONS.map((o) => ({ key: o.key, label: t(o.labelKey) }))} />
          <Select value={office} onChange={setOffice} options={OFFICE_OPTIONS.map((o) => ({ key: o.key, label: t(o.labelKey) }))} />
          <Button type="primary" icon={<SearchIcon />} onClick={search}>
            {t('common.search')}
          </Button>
        </div>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={{ current: page, pageSize, total, onChange: (p) => setPage(p), showTotal: true }}
          emptyText={t('common.empty')}
        />
      </Card>
    </div>
  );
}