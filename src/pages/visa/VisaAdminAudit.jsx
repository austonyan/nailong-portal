// 审计与合规:敏感操作审计日志查询。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Table, Tag, Title } from 'animal-island-ui';
import { SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { fmtDateTime, toastVisaError } from './shared.jsx';

const AUDIT_ACTION_COLORS = {
  approve_application: 'app-green',
  reject_application: 'app-red',
  issue_permit: 'app-teal',
  void_permit: 'app-red',
  blacklist_user: 'app-red',
  privacy_erase: 'purple',
  submit_application: 'app-blue',
};

export default function VisaAdminAudit() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [action, setAction] = useState('');

  const load = useCallback(async () => {
    try {
      const params = action.trim() ? `?action=${encodeURIComponent(action.trim())}` : '';
      const data = await api.get(`/visa/admin/audit${params}`);
      setItems(data.items);
    } catch (err) {
      toastVisaError(t, err);
      setItems([]);
    }
  }, [action, t]);

  useEffect(() => {
    load();
  }, [load]);

  // 审计 detail 是服务端存的 JSON 字符串:拆成「字段名:值」渲染,
  // 不把原始 JSON 直接塞进表格(既难读,也会把内部字段名露出去)。
  const renderDetail = (v) => {
    let detail = v;
    if (typeof v === 'string') {
      try {
        detail = v ? JSON.parse(v) : null;
      } catch {
        return null;
      }
    }
    if (!detail || typeof detail !== 'object') return null;
    const rows = [];
    if (detail.reasonCode) {
      rows.push([
        t('visa.admin.audit.detailReason'),
        t(`visa.rejectReason.${detail.reasonCode}`, { defaultValue: t('common.unknown') }),
      ]);
    }
    if (detail.comment) rows.push([t('visa.admin.audit.detailComment'), detail.comment]);
    if (detail.deadline) rows.push([t('visa.admin.audit.detailDeadline'), fmtDateTime(detail.deadline)]);
    if (detail.appNo) rows.push([t('visa.admin.audit.detailAppNo'), detail.appNo]);
    if (detail.validUntil) rows.push([t('visa.admin.audit.detailValidUntil'), fmtDateTime(detail.validUntil)]);
    if (detail.enabled !== undefined) {
      rows.push([t('visa.admin.audit.detailEnabled'), detail.enabled ? t('common.enabled') : t('common.disabled')]);
    }
    if (!rows.length) return null;
    return (
      <div className="muted-text">
        {rows.map(([label, value]) => (
          <div key={label}>{`${label}: ${value}`}</div>
        ))}
      </div>
    );
  };

  const columns = [
    {
      title: t('visa.admin.audit.auditAction'),
      dataIndex: 'action',
      width: 220,
      render: (v) => (
        <Tag variant="soft" color={AUDIT_ACTION_COLORS[v] || 'default'}>
          {t(`visa.admin.audit.action.${v}`, { defaultValue: t('common.unknown') })}
        </Tag>
      ),
    },
    { title: t('visa.admin.audit.auditActor'), dataIndex: 'actor_name', width: 140 },
    { title: t('visa.admin.audit.auditTarget'), dataIndex: 'target_id', width: 200 },
    { title: t('visa.admin.audit.auditDetail'), dataIndex: 'detail', render: (v) => renderDetail(v) },
    { title: t('common.createdAt'), dataIndex: 'created_at', width: 170, render: fmtDateTime },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('visa.admin.audit.title')}</Title>
        <Input
          size="middle"
          allowClear
          prefix={<SearchIcon size={14} />}
          placeholder={t('visa.admin.audit.auditFilter')}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </div>
      <Card>
        <Table className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          emptyText={t('common.empty')}
        />
      </Card>
    </div>
  );
}
