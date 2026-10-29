// 审计与合规:敏感操作审计日志查询与导出。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Table, Title } from 'animal-island-ui';
import { DownloadIcon, SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { downloadResidentFile } from '../../../api/resident.js';
import { ResAdminNav } from '../ResidentShell.jsx';
import { fmtDateTime, toastResError } from '../shared.jsx';
import { useDebouncedValue } from '../../../lib/useDebouncedValue.js';

export default function AdminResAudit() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [action, setAction] = useState('');
  // 动作检索 300ms 防抖:避免逐键打接口。
  const actionDebounced = useDebouncedValue(action, 300);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/resident/admin/audit${actionDebounced.trim() ? `?action=${encodeURIComponent(actionDebounced.trim())}` : ''}`);
      setItems(data.items);
    } catch (err) {
      toastResError(t, err);
      setItems([]);
    }
  }, [actionDebounced, t]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { title: t('res.admin.audit.actor'), dataIndex: 'actor_name', width: 120 },
    { title: t('res.admin.audit.action'), dataIndex: 'action', width: 220, render: (v) => <b>{t(`res.admin.audit.actionName.${v}`, { defaultValue: t('common.unknown') })}</b> },
    { title: t('res.admin.audit.target'), dataIndex: 'target_id', width: 180 },
    { title: t('res.admin.audit.detail'), dataIndex: 'detail', render: (v) => <span className="res-audit-detail">{v}</span> },
    { title: t('res.admin.field.createdAt'), dataIndex: 'created_at', width: 160, render: fmtDateTime },
  ];

  return (
    <div className="res-admin-page">
      <ResAdminNav />
      <div className="page-header">
        <Title size="middle">{t('res.admin.audit.title')}</Title>
        <div className="table-actions res-filter-bar">
          <Input size="middle" allowClear prefix={<SearchIcon size={14} />} placeholder={t('res.admin.audit.actionPlaceholder')} value={action} onChange={(e) => setAction(e.target.value)} />
          <Button icon={<DownloadIcon />} onClick={() => downloadResidentFile('/resident/admin/audit.csv', 'resident-audit.csv').catch((err) => toastResError(t, err))}>
            {t('res.admin.audit.export')}
          </Button>
        </div>
      </div>

      <Card>
        <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      </Card>
    </div>
  );
}
