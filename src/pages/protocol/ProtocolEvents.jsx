// 活动列表与筛选:类型、时间状态、可报名、居民专属、外交礼遇。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Checkbox, Input, Pagination, Progress, Select, Tag, Title } from 'animal-island-ui';
import { CalendarIcon, HomeIcon, SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { fmtDate, fmtDateTime, toastProtocolError } from './shared.jsx';

const PUBLIC_STATUSES = ['registration', 'registration_closed', 'ongoing', 'ended'];

export default function ProtocolEvents() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [types, setTypes] = useState([]);
  const [type, setType] = useState(searchParams.get('type') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  // 输入中 / 已提交两个状态:逐键改 q 不请求,回车或点搜索才提交,
  // 否则每次按键都会打一次接口。
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [flags, setFlags] = useState(searchParams.get('open') === '1' ? ['open'] : []);

  useEffect(() => {
    api
      .get('/protocol/home')
      .then((data) => setTypes(data.types))
      .catch(() => setTypes([]));
  }, []);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '12' });
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      if (query) params.set('q', query);
      if (flags.includes('open')) params.set('open', '1');
      if (flags.includes('resident')) params.set('resident', '1');
      if (flags.includes('diplomatic')) params.set('diplomatic', '1');
      const data = await api.get(`/protocol/events?${params.toString()}`);
      const rows = data.items ?? [];
      setItems(rows);
      setTotal(data.total);
      // total 变小(筛选/删除)时分页器还在但页码越界,夹回最后一页,
      // 避免用户停在空表且无法返回。
      if (rows.length === 0 && page > 1) setPage(Math.max(1, page - 1));
    } catch (err) {
      toastProtocolError(t, err);
      setItems([]);
    }
  }, [page, type, status, query, flags, t]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = () => {
    setQuery(q.trim());
    setPage(1);
  };

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('protocol.events.title')}</Title>
        <p className="muted-text">{t('protocol.events.subtitle')}</p>
      </div>

      <Card className="protocol-filter-card">
        <div className="protocol-filter-bar">
          <Select
            value={type}
            onChange={(v) => setType(v)}
            options={[{ key: '', label: t('protocol.common.allTypes') }, ...types.map((tp) => ({ key: tp.code, label: tp.name }))]}
            placeholder={t('protocol.field.type')}
          />
          <Select
            value={status}
            onChange={(v) => setStatus(v)}
            options={[{ key: '', label: t('protocol.common.allStatus') }, ...PUBLIC_STATUSES.map((s) => ({ key: s, label: t(`protocol.status.${s}`) }))]}
            placeholder={t('common.status')}
          />
          <Input
            allowClear
            prefix={<SearchIcon size={14} />}
            placeholder={t('protocol.events.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
          />
          <Button type="primary" icon={<SearchIcon />} onClick={applyFilters}>
            {t('protocol.action.search')}
          </Button>
        </div>
        <Checkbox
          options={[
            { label: t('protocol.events.openOnly'), value: 'open' },
            { label: t('protocol.events.residentOnly'), value: 'resident' },
            { label: t('protocol.events.diplomaticOnly'), value: 'diplomatic' },
          ]}
          value={flags}
          onChange={(values) => setFlags(values.map(String))}
        />
      </Card>

      <div className="protocol-event-grid protocol-event-grid-lg">
        {items === null && (
          <Card type="dashed" className="protocol-empty-card">
            <p className="muted-text">{t('common.loading')}</p>
          </Card>
        )}
        {(items ?? []).map((ev) => (
          <Card key={ev.id} hoverable className="protocol-event-card" onClick={() => navigate(`/protocol/events/${ev.eventNo}`)}>
            <div className="protocol-event-card-top">
              <Tag color="app-teal" variant="soft">
                {ev.typeName}
              </Tag>
              <Tag color={ev.status === 'registration' ? 'app-green' : ev.status === 'ongoing' ? 'app-teal' : 'app-yellow'} variant="soft">
                {t(`protocol.status.${ev.status}`)}
              </Tag>
            </div>
            <h3>{ev.title}</h3>
            <p className="muted-text">{ev.subtitle || ev.description}</p>
            <div className="protocol-event-meta">
              <span>
                <CalendarIcon size={14} /> {fmtDateTime(ev.startsAt)}
              </span>
              <span>
                <HomeIcon size={14} /> {ev.venueName}
              </span>
            </div>
            <div className="protocol-event-tags">
              {ev.residentOnly && <Tag color="app-green" variant="outlined" size="small">{t('protocol.eventDetail.residentOnly')}</Tag>}
              {ev.diplomaticOnly && <Tag color="purple" variant="outlined" size="small">{t('protocol.eventDetail.diplomaticOnly')}</Tag>}
              {ev.status === 'registration' && (
                <Tag color="app-yellow" variant="outlined" size="small">
                  {t('protocol.home.deadline', { date: fmtDate(ev.registrationDeadline) })}
                </Tag>
              )}
            </div>
            <Progress
              percent={ev.capacity ? Math.round((ev.approvedCount / ev.capacity) * 100) : 0}
              size="small"
              infoFormat={() => t('protocol.events.capacityInfo', { used: ev.approvedCount, total: ev.capacity })}
            />
          </Card>
        ))}
        {items && items.length === 0 && (
          <Card type="dashed" className="protocol-empty-card">
            <p className="muted-text">{t('protocol.events.empty')}</p>
          </Card>
        )}
      </div>

      {total > 0 && (
        <div className="protocol-pagination">
          <Pagination total={total} current={page} pageSize={12} onChange={setPage} showTotal />
        </div>
      )}
    </div>
  );
}