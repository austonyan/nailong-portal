// 科普文章详情:正文 + 收藏 + 更多文章。打开即落一条阅读历史并推进学习任务。
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Divider, Tag, Title } from 'animal-island-ui';
import { ArrowLeftIcon, EyeIcon, HeartIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { fmtDateTime, toastEduError } from './shared.jsx';
import { toastSuccess } from '../../components/toast.js';

export default function EduArticleDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [missing, setMissing] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/education/articles/${id}`);
      setArticle(data.article);
      for (const task of data.tasksCompleted ?? []) {
        toastSuccess(t('edu.task.completedToast', { title: task.title, badge: task.badgeName }));
      }
    } catch (err) {
      toastEduError(t, err);
      setMissing(true);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFavorite = async () => {
    setFavBusy(true);
    try {
      const data = await api.post(`/education/articles/${id}/favorite`, {});
      setArticle((prev) => (prev ? { ...prev, favorited: data.favorited, favoriteCount: data.favoriteCount } : prev));
      toastSuccess(t(data.favorited ? 'edu.favorite.added' : 'edu.favorite.removed'));
    } catch (err) {
      toastEduError(t, err);
    } finally {
      setFavBusy(false);
    }
  };

  if (missing) {
    return (
      <div className="center-screen">
        <h2>{t('edu.articles.notFound')}</h2>
        <Button type="primary" onClick={() => navigate('/education/articles')}>
          {t('edu.articles.backToList')}
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
    <div>
      <div className="edu-section-head">
        <Button size="small" icon={<ArrowLeftIcon />} onClick={() => navigate('/education/articles')}>
          {t('edu.articles.backToList')}
        </Button>
        <Button
          size="small"
          type={article.favorited ? 'primary' : 'default'}
          icon={<HeartIcon />}
          loading={favBusy}
          disabled={favBusy}
          onClick={toggleFavorite}
        >
          {article.favorited ? t('edu.favorite.remove') : t('edu.favorite.add')}
        </Button>
      </div>

      <Card>
        <h1 className="page-title edu-detail-title">{article.title}</h1>
        <p className="edu-detail-sub">{article.summary}</p>
        <div className="edu-meta">
          <span>{article.no}</span>
          <span>
            <EyeIcon size={12} /> {t('edu.field.viewCount', { count: article.viewCount })}
          </span>
          <span>
            <HeartIcon size={12} /> {article.favoriteCount}
          </span>
          <span>{fmtDateTime(article.publishedAt)}</span>
        </div>
        {article.tags.length > 0 && (
          <div className="edu-meta">
            {article.tags.map((tag) => (
              <Tag key={tag} size="small" variant="outlined">
                {tag}
              </Tag>
            ))}
          </div>
        )}
        <Divider type="thin" />
        <div className="edu-body">{article.body}</div>
      </Card>

      {(article.more ?? []).length > 0 && (
        <div className="edu-section">
          <div className="edu-section-head">
            <Title size="small">{t('edu.articles.more')}</Title>
          </div>
          <div className="edu-related-list">
            {article.more.map((item) => (
              <Card key={item.id} className="edu-card" hoverable>
                <h2 className="edu-card-title">
                  <Link to={`/education/articles/${item.id}`}>{item.title}</Link>
                </h2>
                <p className="edu-card-summary">{item.summary}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
