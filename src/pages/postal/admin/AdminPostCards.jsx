// 明信片管理:全量列表(含草稿/已下架)与违规下架。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Pagination, Select, Table, Tag, Title } from 'animal-island-ui';
import { BanIcon, SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastError, toastSuccess } from '../../../components/toast.js';
import { POSTCARD_STATUSES, POSTCARD_STATUS_COLORS, fmtDateTime, toastPostError } from '../shared.jsx';

const PAGE_SIZE = 20;

export default function AdminPostCards() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [takeTarget, setTakeTarget] = useState(null);
  const [takeReason, setTakeReason] = useState('');
  const [takeBusy, setTakeBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      if (query) params.set('q', query);
      const data = await api.get(`/postal/admin/postcards?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toastPostError(t, err);
      setItems([]);
      setTotal(0);
    }
  }, [page, query, status, t]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmTakedown = async () => {
    if (!takeTarget) return;
    if (takeReason.trim().length < 2) {
      toastError(t('common.required'));
      return;
    }
    setTakeBusy(true);
    try {
      await api.post(`/postal/admin/postcards/${takeTarget.id}/takedown`, { reason: takeReason.trim() });
      setTakeTarget(null);
      setTakeReason('');
      toastSuccess(t('post.admin.postcards.takedownDone'));
      await load();
    } catch (err) {
      toastPostError(t, err);
    } finally {
      setTakeBusy(false);
    }
  };

  const columns = [
    { title: t('post.admin.field.no'), dataIndex: 'no', width: 200 },
    {
      title: t('post.postcards.from'),
      dataIndex: 'senderName',
      width: 140,
      render: (_, row) => `${row.senderName || row.senderUsername} (@${row.senderUsername})`,
    },
    {
      title: t('post.postcards.to'),
      dataIndex: 'recipientName',
      width: 140,
      render: (_, row) => `${row.recipientName || row.recipientUsername} (@${row.recipientUsername})`,
    },
    { title: t('post.admin.postcards.template'), dataIndex: 'templateName', width: 130 },
    { title: t('post.compose.blessing'), dataIndex: 'blessing' },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 100,
      render: (value) => (
        <Tag color={POSTCARD_STATUS_COLORS[value] || 'brown'} variant="soft" size="small">
          {t(`post.postcardStatus.${value}`)}
        </Tag>
      ),
    },
    { title: t('post.postcards.sentAt'), dataIndex: 'sentAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 110,
      render: (_, row) => (
        <div className="table-actions">
          <Button
            size="small"
            icon={<BanIcon />}
            disabled={!['sent', 'received'].includes(row.status)}
            onClick={() => setTakeTarget(row)}
          >
            {t('post.admin.postcards.takedown')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="postal-section">
      <div className="postal-section-head">
        <h1 className="page-title">
          <Title size="middle" color="app-red">
            {t('post.admin.postcards.title')}
          </Title>
        </h1>
      </div>

      <Card>
        <div className="postal-filter-bar">
          <Select
            value={status}
            onChange={(key) => {
              setStatus(key);
              setPage(1);
            }}
            options={[
              { key: '', label: t('post.admin.allStatus') },
              ...POSTCARD_STATUSES.map((value) => ({ key: value, label: t(`post.postcardStatus.${value}`) })),
            ]}
          />
          <Input
            size="middle"
            allowClear
            value={keyword}
            placeholder={t('post.admin.postcards.searchPlaceholder')}
            onChange={(e) => setKeyword(e.target.value)}
            onClear={() => {
              setKeyword('');
              setQuery('');
              setPage(1);
            }}
          />
          <Button
            icon={<SearchIcon />}
            onClick={() => {
              setQuery(keyword.trim());
              setPage(1);
            }}
          >
            {t('common.search')}
          </Button>
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
        {total > PAGE_SIZE && (
          <Pagination total={total} current={page} pageSize={PAGE_SIZE} onChange={setPage} showTotal />
        )}
      </Card>

      <Modal
        maskClosable={false}
        open={!!takeTarget}
        title={t('post.admin.postcards.takedownTitle', { no: takeTarget?.no ?? '' })}
        onClose={() => {
          if (takeBusy) return;
          setTakeTarget(null);
        }}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setTakeTarget(null)} disabled={takeBusy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" danger loading={takeBusy} disabled={takeBusy} onClick={confirmTakedown}>
              {t('post.admin.postcards.takedown')}
            </Button>
          </>
        }
      >
        <p className="muted-text">{t('post.admin.postcards.takedownTip')}</p>
        <label className="postal-field postal-field-wide">
          <span>{t('post.admin.postcards.reason')} *</span>
          <Input
            size="large"
            value={takeReason}
            maxLength={200}
            onChange={(e) => setTakeReason(e.target.value)}
          />
        </label>
      </Modal>
    </div>
  );
}