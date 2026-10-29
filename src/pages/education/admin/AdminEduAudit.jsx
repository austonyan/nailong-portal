// 审计日志(edu:manage):内容/任务/徽章敏感操作留痕,支持动作与对象类型过滤。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Pagination, Select, Table, Title } from 'animal-island-ui';
import { api } from '../../../api/client.js';
import { TargetTypeTag, fmtDateTime, toastEduError } from '../shared.jsx';

const AUDIT_ACTIONS = [
  '',
  'create_entry',
  'update_entry',
  'submit_entry',
  'publish_entry',
  'offline_entry',
  'delete_entry',
  'create_article',
  'update_article',
  'submit_article',
  'publish_article',
  'offline_article',
  'delete_article',
  'create_task',
  'update_task',
  'task_status',
  'delete_task',
  'grant_badge',
  'approve_content',
  'reject_content',
];

export default function AdminEduAudit() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (action) params.set('action', action);
    if (targetType) params.set('targetType', targetType);
    try {
      const data = await api.get(`/education/admin/audit?${params.toString()}`);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      toastEduError(t, err);
      setItems([]);
    }
  }, [action, page, targetType, t]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { title: t('edu.admin.audit.actor'), dataIndex: 'actorName', width: 130 },
    { title: t('edu.admin.audit.action'), dataIndex: 'action', width: 150, render: (v) => t(`edu.admin.audit.actionLabel.${v}`, { defaultValue: t('common.unknown') }) },
    {
      title: t('edu.field.type'),
      dataIndex: 'targetType',
      width: 100,
      render: (v) => (v ? <TargetTypeTag value={v} /> : '-'),
    },
    { title: t('edu.admin.audit.target'), dataIndex: 'targetId', width: 170 },
    { title: t('edu.admin.audit.detail'), dataIndex: 'detail', render: (v) => JSON.stringify(v) },
    { title: t('edu.field.createdAt'), dataIndex: 'createdAt', width: 150, render: fmtDateTime },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle" color="app-orange">
          {t('edu.admin.audit.title')}
        </Title>
      </div>

      <Card>
        <div className="edu-search-row">
          <Select
            value={action}
            onChange={(key) => {
              setAction(key);
              setPage(1);
            }}
            options={AUDIT_ACTIONS.map((v) => ({ key: v, label: v === '' ? t('edu.admin.audit.allActions') : t(`edu.admin.audit.actionLabel.${v}`, { defaultValue: t('common.unknown') }) }))}
            aria-label={t('edu.admin.audit.action')}
          />
          <Select
            value={targetType}
            onChange={(key) => {
              setTargetType(key);
              setPage(1);
            }}
            options={[
              { key: '', label: t('edu.admin.allTypes') },
              { key: 'entry', label: t('edu.targetType.entry') },
              { key: 'article', label: t('edu.targetType.article') },
              { key: 'task', label: t('edu.targetType.task') },
              { key: 'badge', label: t('edu.targetType.badge') },
            ]}
            aria-label={t('edu.field.type')}
          />
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
        {total > pageSize && (
          <div className="edu-pager">
            <Pagination total={total} current={page} pageSize={pageSize} onChange={setPage} showTotal />
          </div>
        )}
      </Card>
    </div>
  );
}
