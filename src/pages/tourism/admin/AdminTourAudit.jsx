// 审计查看:景点/内容/徽章/配置与打卡的全部敏感动作记录。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Table, Title } from 'animal-island-ui';
import { SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { fmtDateTime, toastTourError } from '../shared.jsx';
import { TourAdminNav } from '../TourismShell.jsx';

export default function AdminTourAudit() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [action, setAction] = useState('');

  const load = useCallback(async () => {
    try {
      const params = action.trim() ? `?action=${encodeURIComponent(action.trim())}` : '';
      const data = await api.get(`/tourism/admin/audit${params}`);
      setItems(data.items);
    } catch (err) {
      toastTourError(t, err);
      setItems([]);
    }
  }, [action, t]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { title: t('tour.admin.audit.time'), dataIndex: 'createdAt', width: 160, render: fmtDateTime },
    { title: t('tour.admin.audit.actor'), dataIndex: 'actorName', width: 130, render: (v) => v || '-' },
    { title: t('tour.admin.audit.action'), dataIndex: 'action', width: 200 },
    { title: t('tour.admin.audit.target'), dataIndex: 'targetId', render: (v, row) => v || row.targetType || '-' },
    {
      title: t('tour.admin.audit.detail'),
      dataIndex: 'detail',
      render: (v) => <span className="tour-audit-detail">{v && v !== '{}' ? v : '-'}</span>,
    },
  ];

  return (
    <div>
      <TourAdminNav />
      <div className="page-header">
        <Title size="middle" color="app-red">
          {t('tour.admin.audit.title')}
        </Title>
      </div>

      <Card>
        <p className="muted-text">{t('tour.admin.audit.tip')}</p>
        <div className="tour-filter-bar">
          <Input
            size="large"
            allowClear
            prefix={<SearchIcon size={14} />}
            placeholder={t('tour.admin.audit.searchPlaceholder')}
            value={action}
            onChange={(e) => setAction(e.target.value)}
            onClear={() => setAction('')}
          />
          <Button onClick={load}>{t('common.search')}</Button>
        </div>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('tour.admin.audit.empty')}
        />
      </Card>
    </div>
  );
}
