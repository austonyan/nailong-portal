// 审计与合规:敏感操作日志查询、详情与导出。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Pagination, Table, Title } from 'animal-island-ui';
import { DownloadIcon, EyeIcon, SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { exportProtocolCsv, fmtDateTime, toastProtocolError } from '../shared.jsx';
import { useDebouncedValue } from '../../../lib/useDebouncedValue.js';

export default function AdminProtocolAudit() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  // 检索词 300ms 防抖:逐键输入不再每字打一次接口。
  const dq = useDebouncedValue(q, 300);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (action.trim()) params.set('action', action.trim());
      if (dq.trim()) params.set('q', dq.trim());
      const data = await api.get(`/protocol/admin/audit?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toastProtocolError(t, err);
      setItems([]);
    }
  }, [page, action, dq, t]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { title: t('protocol.field.createdAt'), dataIndex: 'created_at', width: 160, render: fmtDateTime },
    { title: t('protocol.admin.auditActor'), dataIndex: 'actor_name', width: 120 },
    { title: t('protocol.admin.auditAction'), dataIndex: 'action', width: 190 },
    { title: t('protocol.admin.auditTarget'), width: 190, render: (_, r) => `${r.target_type}:${r.target_id}` },
    {
      title: t('common.actions'),
      width: 90,
      render: (_, r) => (
        <Button type="text" size="small" icon={<EyeIcon />} onClick={() => setDetail(r)}>
          {t('protocol.action.view')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('protocol.admin.auditTitle')}</Title>
        <Button
          type="dashed"
          icon={<DownloadIcon />}
          onClick={() => exportProtocolCsv('/protocol/admin/export/audit', 'protocol-audit.csv').catch((err) => toastProtocolError(t, err))}
        >
          {t('protocol.action.export')}
        </Button>
      </div>

      <div className="protocol-filter-bar">
        <Input allowClear value={action} onChange={(e) => setAction(e.target.value)} placeholder={t('protocol.admin.filterAction')} />
        <Input allowClear prefix={<SearchIcon size={14} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('protocol.admin.searchAudit')} />
      </div>

      <Card>
        <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} emptyText={t('protocol.common.noData')} />
        {total > 30 && (
          <div className="protocol-pagination">
            <Pagination total={total} current={page} pageSize={30} onChange={setPage} showTotal />
          </div>
        )}
      </Card>

      <Modal
        maskClosable={false}
        open={detail !== null}
        title={detail?.action}
        onClose={() => setDetail(null)}
        typewriter={false}
        width={620}
        footer={<Button onClick={() => setDetail(null)}>{t('protocol.action.back')}</Button>}
      >
        {detail && (
          <div className="protocol-audit-detail">
            <p><strong>{t('protocol.admin.auditActor')}:</strong> {detail.actor_name || '-'}</p>
            <p><strong>{t('protocol.admin.auditTarget')}:</strong> {detail.target_type}:{detail.target_id}</p>
            <p><strong>{t('protocol.field.createdAt')}:</strong> {fmtDateTime(detail.created_at)}</p>
            <pre className="protocol-json">{detail.detail}</pre>
          </div>
        )}
      </Modal>
    </div>
  );
}