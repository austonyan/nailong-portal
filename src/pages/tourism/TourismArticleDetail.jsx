// 文化内容详情:节庆 / 民俗 / 世界观文章正文。
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Divider, Tag } from 'animal-island-ui';
import { ArrowLeftIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { ARTICLE_TYPE_COLORS, fmtDate, toastTourError } from './shared.jsx';

export default function TourismArticleDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/tourism/articles/${id}`)
      .then((data) => {
        if (!cancelled) setArticle(data.article);
      })
      .catch((err) => {
        toastTourError(t, err);
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  if (missing) {
    return (
      <div className="center-screen">
        <h2>{t('tour.articles.notFound')}</h2>
        <Button type="primary" onClick={() => navigate('/tourism/articles')}>
          {t('tour.articles.backToList')}
        </Button>
      </div>
    );
  }

  if (!article) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  return (
    <div className="tour-detail">
      <div className="tour-section-head">
        <Button size="small" icon={<ArrowLeftIcon />} onClick={() => navigate('/tourism/articles')}>
          {t('tour.articles.backToList')}
        </Button>
        <Tag size="small" color={ARTICLE_TYPE_COLORS[article.type] || 'default'} variant="soft">
          {t(`tour.articleType.${article.type}`)}
        </Tag>
      </div>
      <Card>
        <h2 className="tour-detail-title">{article.title}</h2>
        <p className="tour-meta-line">
          {article.no} · {fmtDate(article.publishedAt)}
        </p>
        <Divider type="thin" />
        <p className="tour-detail-text">{article.summary}</p>
        <p className="tour-detail-text">{article.body}</p>
      </Card>
    </div>
  );
}