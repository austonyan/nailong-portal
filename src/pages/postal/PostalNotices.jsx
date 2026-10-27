// 公告列表与详情(仅展示已发布公告;简繁内容由服务端按语言下发)。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Pagination, Select, Tag, Title } from 'animal-island-ui';
import { ArrowLeftIcon, RssIcon, SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { NOTICE_LEVELS, NOTICE_LEVEL_COLORS, fmtDateTime, toastPostError } from './shared.jsx';

const PAGE_SIZE = 10;

export default function PostalNotices() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState('');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (level) params.set('level', level);
      if (query) params.set('q', query);
      const data = await api.get(`/postal/notices?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toastPostError(t, err);
      setItems([]);
      setTotal(0);
    }
  }, [level, page, query, t]);

  useEffect(() => {
    if (!id) loadList();
  }, [id, loadList]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setDetailLoading(true);
    api
      .get(`/postal/notices/${id}`)
      .then((data) => {
        if (alive) setDetail(data.notice);
      })
      .catch((err) => {
        if (alive) toastPostError(t, err);
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, t]);

  if (id) {
    return (
      <div className="postal-section">
        <div className="postal-section-head">
          <Button type="text" size="small" icon={<ArrowLeftIcon />} onClick={() => navigate('/postal/notices')}>
            {t('post.notices.backToList')}
          </Button>
        </div>
        {detailLoading ? (
          <Card type="dashed">
            <p className="muted-text">{t('common.loading')}</p>
          </Card>
        ) : !detail ? (
          <Card type="dashed">
            <p className="muted-text">{t('post.notices.notFound')}</p>
          </Card>
        ) : (
          <Card>
            <div className="postal-notice-head">
              <Tag color={NOTICE_LEVEL_COLORS[detail.level] || 'default'} variant="soft">
                {t(`post.level.${detail.level}`)}
              </Tag>
              <Title size="middle">{detail.title}</Title>
            </div>
            <div className="postal-notice-meta">
              <span>{detail.no}</span>
              <span>{fmtDateTime(detail.publishedAt || detail.createdAt)}</span>
            </div>
            <p className="postal-detail-body">{detail.body}</p>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="postal-section">
      <div className="postal-section-head">
        <Title size="middle" color="app-teal">
          {t('post.notices.title')}
        </Title>
        <div className="postal-filter-bar">
          <Input
            size="middle"
            allowClear
            value={keyword}
            placeholder={t('post.notices.searchPlaceholder')}
            onChange={(e) => setKeyword(e.target.value)}
            onClear={() => {
              setKeyword('');
              setQuery('');
              setPage(1);
            }}
          />
          <Select
            value={level}
            onChange={(key) => {
              setLevel(key);
              setPage(1);
            }}
            options={[
              { key: '', label: t('post.notices.allLevels') },
              ...NOTICE_LEVELS.map((value) => ({ key: value, label: t(`post.level.${value}`) })),
            ]}
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
      </div>

      {items === null ? (
        <Card type="dashed">
          <p className="muted-text">{t('common.loading')}</p>
        </Card>
      ) : items.length === 0 ? (
        <Card type="dashed">
          <div className="postal-empty">
            <RssIcon size={30} />
            <p className="muted-text">{t('post.notices.empty')}</p>
          </div>
        </Card>
      ) : (
        <div className="postal-notice-list">
          {items.map((notice) => (
            <Card
              key={notice.id}
              hoverable
              className="postal-notice-item"
              onClick={() => navigate(`/postal/notices/${notice.id}`)}
            >
              <div className="postal-notice-head">
                <Tag color={NOTICE_LEVEL_COLORS[notice.level] || 'default'} variant="soft">
                  {t(`post.level.${notice.level}`)}
                </Tag>
                <b>{notice.title}</b>
              </div>
              <p className="postal-notice-body">{notice.body}</p>
              <div className="postal-notice-meta">
                <span>{notice.no}</span>
                <span>{fmtDateTime(notice.publishedAt || notice.createdAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <Pagination total={total} current={page} pageSize={PAGE_SIZE} onChange={setPage} showTotal />
      )}
    </div>
  );
}