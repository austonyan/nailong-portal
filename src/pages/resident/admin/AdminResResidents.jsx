// 居民信息管理:居民列表与详情(敏感字段服务端脱敏,关联业务预留)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Drawer, Input, Table, Tag, Title } from 'animal-island-ui';
import { EyeIcon, SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { ResAdminNav } from '../ResidentShell.jsx';
import { CARD_STATUS_COLORS, fmtDate, toastResError } from '../shared.jsx';
import { useDebouncedValue } from '../../../lib/useDebouncedValue.js';

// 与 ResidentChanges / AdminResChanges 保持一致(同一语义同色)
const CHANGE_STATUS_COLORS = {
  pending_review: 'warm-peach-pink',
  approved: 'app-green',
  rejected: 'app-red',
  cancelled: 'brown',
};

export default function AdminResResidents() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  // 检索词 300ms 防抖:避免每敲一个字都打一次接口。
  const dq = useDebouncedValue(q, 300);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dq.trim()) params.set('q', dq.trim());
      const data = await api.get(`/resident/admin/residents?${params.toString()}`);
      setItems(data.items);
    } catch (err) {
      toastResError(t, err);
      setItems([]);
    }
  }, [dq, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (row) => {
    try {
      const data = await api.get(`/resident/admin/residents/${row.userId}`);
      setDetail(data);
    } catch (err) {
      toastResError(t, err);
    }
  };

  const columns = [
    { title: t('res.admin.field.cardNo'), dataIndex: 'cardNo', width: 180 },
    { title: t('res.admin.field.applicant'), dataIndex: 'username', width: 120 },
    { title: t('res.card.type'), dataIndex: 'typeName', width: 110 },
    { title: t('res.form.nickname'), dataIndex: 'nickname', width: 120 },
    { title: t('res.form.contact'), dataIndex: 'contact', width: 140 },
    {
      title: t('common.status'),
      dataIndex: 'cardStatus',
      width: 110,
      render: (v) =>
        v ? (
          <Tag color={CARD_STATUS_COLORS[v] || 'brown'} variant="soft">
            {t(`res.cardStatus.${v}`)}
          </Tag>
        ) : (
          '-'
        ),
    },
    { title: t('res.card.since'), dataIndex: 'since', width: 120, render: fmtDate },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      render: (_, record) => (
        <Button type="default" size="small" icon={<EyeIcon />} onClick={() => openDetail(record)}>
          {t('res.admin.view')}
        </Button>
      ),
    },
  ];

  return (
    <div className="res-admin-page">
      <ResAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('res.admin.residents.title')}</Title>
        </h1>
        <div className="table-actions res-filter-bar">
          <Input size="middle" allowClear prefix={<SearchIcon size={14} />} placeholder={t('res.admin.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Card>
        <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="userId" pagination={false} emptyText={t('common.empty')} />
        <p className="muted-text res-mask-tip">{t('res.admin.residents.maskTip')}</p>
      </Card>

      <Drawer maskClosable={false} open={detail !== null} title={detail?.resident?.nickname || detail?.username || ''} onClose={() => setDetail(null)} width={560}>
        {detail && (
          <div className="res-admin-detail">
            <div className="res-admin-detail-head">
              <Tag color="app-green" variant="solid">
                {detail.resident.typeCode}
              </Tag>
              <span className="muted-text">
                {detail.displayName} (@{detail.username})
              </span>
            </div>

            <dl className="res-field-list">
              {[
                [t('res.form.nickname'), detail.resident.nickname],
                [t('res.form.contact'), detail.resident.contact],
                [t('res.form.virtualAddress'), detail.resident.virtualAddress],
                [t('res.form.bio'), detail.resident.bio || '-'],
                [t('res.card.since'), fmtDate(detail.resident.since)],
              ].map(([label, value]) => (
                <div key={label} className="res-field-row">
                  <dt>{label}</dt>
                  <dd>{value || '-'}</dd>
                </div>
              ))}
            </dl>

            <h2 className="block-heading">{t('res.card.title')}</h2>
            <ul className="res-material-list">
              {detail.cards.map((c) => (
                <li key={c.id}>
                  <Tag color={CARD_STATUS_COLORS[c.status] || 'brown'} variant="soft">
                    {c.cardNo} · {t(`res.cardStatus.${c.status}`)}
                  </Tag>
                  <span className="muted-text">
                    {fmtDate(c.issuedAt)} ~ {fmtDate(c.validUntil)}
                  </span>
                </li>
              ))}
            </ul>

            <h2 className="block-heading">{t('res.admin.residents.changes')}</h2>
            <ul className="res-review-timeline">
              {detail.changes.map((c) => (
                <li key={c.id}>
                  <div className="res-review-head">
                    <Tag variant="soft" color="app-teal" size="small">
                      {t(`res.changeType.${c.type}`)}
                    </Tag>
                    <Tag variant="soft" color={CHANGE_STATUS_COLORS[c.status] || 'brown'} size="small">
                      {t(`res.changeStatus.${c.status}`)}
                    </Tag>
                    <span className="muted-text">{fmtDate(c.createdAt)}</span>
                  </div>
                </li>
              ))}
              {detail.changes.length === 0 && <li className="muted-text">{t('common.empty')}</li>}
            </ul>

            <h2 className="block-heading">{t('res.admin.residents.related')}</h2>
            <p className="muted-text">{t('res.admin.residents.relatedSummary', { visa: detail.related.visaApplications, immigration: detail.related.immigrationDeclarations })}</p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
