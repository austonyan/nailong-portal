// 审计 — 导出、规则变更与删除申请处理的敏感操作留痕。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Select, Table, Tag, Title } from 'animal-island-ui';
import { DownloadIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { ArchAdminNav, exportCsv, fmtDateTime, toastArchError } from '../shared.jsx';

const ACTION_KEYS = [
  'export.user',
  'export.admin',
  'admin.query',
  'rule.update',
  'request.create',
  'request.accept',
  'request.approve',
  'request.execute',
  'request.reject',
];

export default function AdminArchAudit() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const pageSize = 15;

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (action) params.set('action', action);
    api
      .get(`/archives/admin/audit?${params}`)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        toastArchError(err);
        setItems([]);
      });
  }, [page, action]);

  useEffect(load, [load]);

  // CSV 与表格共用同一套翻译,导出的文件里不会出现 action 码或 `system`。
  const actionLabel = (v) => t(`arch.admin.audit.actionLabel.${v}`, { defaultValue: t('common.unknown') });
  const targetTypeLabel = (v) => (v ? t(`arch.admin.audit.targetLabel.${v}`, { defaultValue: t('common.unknown') }) : '-');

  const exportAll = () => {
    exportCsv(
      'arch-audit-logs.csv',
      [
        { key: 'id', label: 'ID' },
        { key: 'actor', label: t('arch.admin.audit.actor') },
        { key: 'action', label: t('arch.admin.audit.action') },
        { key: 'targetType', label: t('arch.admin.audit.targetType') },
        { key: 'targetId', label: t('arch.admin.audit.targetId') },
        { key: 'detail', label: t('arch.admin.audit.detail') },
        { key: 'createdAt', label: t('common.createdAt') },
      ],
      (items ?? []).map((r) => ({
        ...r,
        detail: JSON.stringify(r.detail),
        actor: r.actorName || t('common.system'),
        action: actionLabel(r.action),
        targetType: targetTypeLabel(r.targetType),
        createdAt: fmtDateTime(r.createdAt),
      }))
    );
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: t('arch.admin.audit.actor'), dataIndex: 'actorName', width: 130, render: (v, record) => (record.username ? `${v || record.username}` : t('common.system')) },
    { title: t('arch.admin.audit.action'), dataIndex: 'action', width: 180, render: (v) => <Tag color="app-blue" variant="soft" size="small">{actionLabel(v)}</Tag> },
    { title: t('arch.admin.audit.targetType'), dataIndex: 'targetType', width: 130, render: (v) => (v ? targetTypeLabel(v) : <span className="muted-text">-</span>) },
    { title: t('arch.admin.audit.targetId'), dataIndex: 'targetId', width: 170, render: (v) => v || <span className="muted-text">-</span> },
    { title: t('arch.admin.audit.detail'), dataIndex: 'detail', render: (v) => <span className="arch-note">{JSON.stringify(v)}</span> },
    { title: t('common.createdAt'), dataIndex: 'createdAt', width: 150, render: (v) => fmtDateTime(v) },
  ];

  return (
    <div className="arch-page">
      <ArchAdminNav />
      <div className="page-header">
        <Title size="middle" color="brown">
          {t('arch.admin.audit.title')}
        </Title>
        <Button type="text" size="small" icon={<DownloadIcon />} onClick={exportAll} disabled={!items?.length}>
          {t('arch.catalog.export')}
        </Button>
      </div>

      <Card>
        <div className="arch-toolbar">
          <Select
            value={action}
            onChange={(v) => { setAction(v); setPage(1); }}
            options={[{ key: '', label: t('arch.admin.audit.allActions') }, ...ACTION_KEYS.map((a) => ({ key: a, label: actionLabel(a) }))]}
          />
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