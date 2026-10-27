// 文化内容列表:节庆 / 民俗 / 世界观文章,支持类型筛选与搜索。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Select, Tag, Title } from 'animal-island-ui';
import { SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { ARTICLE_TYPES, ARTICLE_TYPE_COLORS, fmtDate, toastTourError } from './shared.jsx';

export default function TourismArticles() {
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
      const data = await api.get(`/tourism/articles?${params.toString()}`);
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
    ...ARTICLE_TYPES.map((value) => ({ key: value, label: t(`tour.articleType.${value}`) })),
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle" color="app-teal">
          {t('tour.articles.title')}
        </Title>
      </div>
      <p className="muted-text">{t('tour.articles.tip')}</p>

      <div className="tour-filter-bar">
        <Select value={type} onChange={setType} options={typeOptions} aria-label={t('tour.filter.type')} />
        <Input
          size="large"
          allowClear
          prefix={<SearchIcon size={14} />}
          placeholder={t('tour.articles.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onClear={() => setQ('')}
        />
        <Button onClick={load}>{t('common.search')}</Button>
      </div>

      <div className="tour-ann-list">
        {(items ?? []).map((article) => (
          <Card
            key={article.id}
            hoverable
            className="tour-article-card"
            onClick={() => navigate(`/tourism/articles/${article.id}`)}
          >
            <div className="tour-ann-head">
              <Tag size="small" color={ARTICLE_TYPE_COLORS[article.type] || 'default'} variant="soft">
                {t(`tour.articleType.${article.type}`)}
              </Tag>
              <b>{article.title}</b>
              <span className="muted-text">{fmtDate(article.publishedAt)}</span>
            </div>
            <p className="tour-ann-body">{article.summary}</p>
            <p className="tour-meta-line">{article.no}</p>
          </Card>
        ))}
        {items === null && (
          <Card type="dashed">
            <p className="muted-text">{t('common.loading')}</p>
          </Card>
        )}
        {items && items.length === 0 && (
          <Card type="dashed">
            <p className="muted-text">{t('tour.articles.empty')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}