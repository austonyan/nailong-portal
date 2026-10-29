// 百科词条列表:分类筛选 + 关键词搜索 + 分页,卡片进入词条详情。
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Pagination, Select, Tag, Title } from 'animal-island-ui';
import { BookIcon, SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastEduError } from './shared.jsx';

export default function EduEntries() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const load = useCallback(async () => {
    setItems(null);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (category) params.set('category', category);
    if (q.trim()) params.set('q', q.trim());
    try {
      const data = await api.get(`/education/entries?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total ?? 0);
    } catch (err) {
      toastEduError(t, err);
      setItems([]);
    }
  }, [category, page, q, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get('/education/categories')
      .then((data) => setCategories(data.items ?? []))
      .catch(() => setCategories([]));
  }, []);

  const categoryOptions = [
    { key: '', label: t('edu.entries.allCategories') },
    ...categories.map((c) => ({ key: c.code, label: c.name })),
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle" color="app-blue">
          {t('edu.entries.title')}
        </Title>
      </div>
      <p className="muted-text">{t('edu.entries.tip')}</p>

      <div className="edu-search-row">
        <Select
          value={category}
          onChange={(key) => {
            setCategory(key);
            setPage(1);
          }}
          options={categoryOptions}
          aria-label={t('edu.field.category')}
        />
        <Input
          size="large"
          allowClear
          prefix={<SearchIcon size={14} />}
          placeholder={t('edu.entries.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onClear={() => {
            setQ('');
            setPage(1);
          }}
        />
        <Button
          type="primary"
          icon={<BookIcon />}
          onClick={() => {
            setPage(1);
            load();
          }}
        >
          {t('common.search')}
        </Button>
      </div>

      <div className="edu-grid">
        {(items ?? []).map((item) => (
          <Card key={item.id} className="edu-card" hoverable>
            <h3 className="edu-card-title">
              <Link to={`/education/entries/${item.id}`}>{item.title}</Link>
            </h3>
            <p className="edu-card-summary">{item.summary}</p>
            <div className="edu-meta">
              <Tag size="small" color="app-blue" variant="soft">
                {categories.find((c) => c.code === item.categoryCode)?.name ?? t('common.unknown')}
              </Tag>
              <span>{item.no}</span>
            </div>
          </Card>
        ))}
        {items === null && (
          <Card type="dashed">
            <p className="muted-text">{t('common.loading')}</p>
          </Card>
        )}
        {items && items.length === 0 && (
          <Card type="dashed">
            <p className="muted-text">{t('edu.entries.empty')}</p>
          </Card>
        )}
      </div>

      {total > pageSize && (
        <div className="edu-pager">
          <Pagination total={total} current={page} pageSize={pageSize} onChange={setPage} showTotal />
        </div>
      )}
    </div>
  );
}
