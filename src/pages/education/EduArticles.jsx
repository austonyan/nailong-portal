// 科普文章列表:关键词搜索 + 分页,卡片进入文章详情。
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Pagination, Title } from 'animal-island-ui';
import { FileIcon, SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastEduError } from './shared.jsx';

export default function EduArticles() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const load = useCallback(async () => {
    setItems(null);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (q.trim()) params.set('q', q.trim());
    try {
      const data = await api.get(`/education/articles?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total ?? 0);
    } catch (err) {
      toastEduError(t, err);
      setItems([]);
    }
  }, [page, q, t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="page-header">
        <Title size="middle" color="app-teal">
          {t('edu.articles.title')}
        </Title>
      </div>
      <p className="muted-text">{t('edu.articles.tip')}</p>

      <div className="edu-search-row">
        <Input
          size="large"
          allowClear
          prefix={<SearchIcon size={14} />}
          placeholder={t('edu.articles.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onClear={() => {
            setQ('');
            setPage(1);
          }}
        />
        <Button
          type="primary"
          icon={<FileIcon />}
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
              <Link to={`/education/articles/${item.id}`}>{item.title}</Link>
            </h3>
            <p className="edu-card-summary">{item.summary}</p>
            <div className="edu-meta">
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
            <p className="muted-text">{t('edu.articles.empty')}</p>
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
