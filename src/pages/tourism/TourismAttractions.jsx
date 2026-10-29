// 景点列表:类型筛选 + 关键词搜索,卡片进入详情打卡。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Select, Tag, Title } from 'animal-island-ui';
import { SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import {
  ATTRACTION_TYPES,
  ATTRACTION_TYPE_COLORS,
  OPEN_STATE_COLORS,
  AttractionIcon,
  toastTourError,
} from './shared.jsx';

export default function TourismAttractions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');

  const load = useCallback(async () => {
    setItems(null);
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (q.trim()) params.set('q', q.trim());
    params.set('pageSize', '60');
    try {
      const data = await api.get(`/tourism/attractions?${params.toString()}`);
      setItems(data.items);
    } catch (err) {
      toastTourError(t, err);
      setItems([]);
    }
  }, [q, type, t]);

  useEffect(() => {
    load();
  }, [load]);

  const typeOptions = [
    { key: '', label: t('tour.filter.allTypes') },
    ...ATTRACTION_TYPES.map((value) => ({ key: value, label: t(`tour.type.${value}`) })),
  ];

  const cardKeyDown = (action) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-orange">
            {t('tour.attractions.title')}
          </Title>
        </h1>
      </div>
      <p className="muted-text">{t('tour.attractions.tip')}</p>

      <div className="tour-filter-bar">
        <Select value={type} onChange={setType} options={typeOptions} aria-label={t('tour.filter.type')} />
        <Input
          size="large"
          allowClear
          prefix={<SearchIcon size={14} />}
          placeholder={t('tour.attractions.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onClear={() => setQ('')}
        />
        <Button onClick={load}>{t('common.search')}</Button>
      </div>

      <div className="tour-card-grid">
        {(items ?? []).map((item) => (
          <Card
            key={item.id}
            hoverable
            role="button"
            tabIndex={0}
            className="tour-attraction-card"
            onClick={() => navigate(`/tourism/attractions/${item.id}`)}
            onKeyDown={cardKeyDown(() => navigate(`/tourism/attractions/${item.id}`))}
          >
            <div className="tour-card-head">
              <span className="tour-card-icon">
                <AttractionIcon type={item.type} />
              </span>
              <div>
                <h2 className="tour-card-title">{item.name}</h2>
                <div className="tour-card-meta">
                  <Tag size="small" color={ATTRACTION_TYPE_COLORS[item.type] || 'brown'} variant="soft">
                    {t(`tour.type.${item.type}`)}
                  </Tag>
                  <Tag size="small" color={OPEN_STATE_COLORS[item.openState] || 'brown'} variant="soft">
                    {t(`tour.openState.${item.openState}`)}
                  </Tag>
                </div>
              </div>
            </div>
            <p className="tour-card-summary">{item.summary}</p>
            <p className="tour-meta-line">{item.no}</p>
          </Card>
        ))}
        {items === null && (
          <Card type="dashed">
            <p className="muted-text">{t('common.loading')}</p>
          </Card>
        )}
        {items && items.length === 0 && (
          <Card type="dashed">
            <p className="muted-text">{t('tour.attractions.empty')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}