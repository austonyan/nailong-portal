// 活动签到:凭证编号核销、签到/签退与记录查询。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Input,
  Pagination,
  Radio,
  Table,
  Tag,
  Title,
} from 'animal-island-ui';
import { CheckCircleIcon, SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { StatusTag, fmtDateTime, toastProtocolError } from '../shared.jsx';
import { toastSuccess } from '../shared.jsx';

export default function AdminProtocolCheckin() {
  const { t } = useTranslation();
  const [passNo, setPassNo] = useState('');
  const [action, setAction] = useState('in');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (q.trim()) params.set('q', q.trim());
      const data = await api.get(`/protocol/admin/checkins?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toastProtocolError(t, err);
      setItems([]);
    }
  }, [page, q, t]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!passNo.trim()) return;
    setBusy(true);
    try {
      const data = await api.post('/protocol/admin/checkin', { passNo: passNo.trim().toUpperCase(), action });
      setLast(data.pass);
      toastSuccess(action === 'in' ? t('protocol.admin.checkinSuccess') : t('protocol.admin.checkoutSuccess'));
      setPassNo('');
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { title: t('protocol.field.createdAt'), dataIndex: 'created_at', width: 160, render: fmtDateTime },
    { title: t('protocol.field.event'), dataIndex: 'event_title', width: 200 },
    { title: t('protocol.field.passNo'), dataIndex: 'pass_no', width: 180 },
    { title: t('protocol.field.holderName'), dataIndex: 'holder_name', width: 110 },
    {
      title: t('protocol.field.action'),
      dataIndex: 'action',
      width: 90,
      render: (v) => (
        <Tag color={v === 'in' ? 'app-green' : 'app-blue'} variant="soft" size="small">
          {v === 'in' ? t('protocol.admin.checkIn') : t('protocol.admin.checkOut')}
        </Tag>
      ),
    },
    { title: t('protocol.field.actor'), dataIndex: 'actor_name', width: 110 },
    { title: t('protocol.field.source'), dataIndex: 'source', width: 90 },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('protocol.admin.checkinTitle')}</Title>
        <p className="muted-text">{t('protocol.admin.checkinSubtitle')}</p>
      </div>

      <Card className="protocol-checkin-card">
        <div className="protocol-checkin-form">
          <Input
            size="large"
            allowClear
            value={passNo}
            onChange={(e) => setPassNo(e.target.value.toUpperCase())}
            placeholder={t('protocol.admin.passNoPlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <Radio
            value={action}
            onChange={(v) => setAction(String(v))}
            options={[
              { label: t('protocol.admin.checkIn'), value: 'in' },
              { label: t('protocol.admin.checkOut'), value: 'out' },
            ]}
          />
          <Button type="primary" size="large" icon={<CheckCircleIcon />} loading={busy} onClick={submit} disabled={busy}>
            {t('protocol.admin.doCheckin')}
          </Button>
        </div>
        <p className="muted-text">{t('protocol.admin.checkinTip')}</p>
        {last && (
          <Card color="app-teal">
            <div className="protocol-inline-between">
              <div>
                <strong>{last.passNo}</strong>
                <p>{last.eventTitle} · {last.holderName}</p>
                <p className="muted-text">{fmtDateTime(last.checkedInAt)}</p>
              </div>
              <StatusTag status={last.status} />
            </div>
          </Card>
        )}
      </Card>

      <div className="protocol-filter-bar">
        <Input allowClear prefix={<SearchIcon size={14} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('protocol.admin.searchCheckin')} />
      </div>

      <Card>
        <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={false} emptyText={t('protocol.admin.checkinEmpty')} />
        {total > 20 && (
          <div className="protocol-pagination">
            <Pagination total={total} current={page} pageSize={20} onChange={setPage} showTotal />
          </div>
        )}
      </Card>
    </div>
  );
}