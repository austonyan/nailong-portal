// 百科词条详情:正文 + 收藏 + 关联词条。打开即落一条阅读历史并推进学习任务,
// 有任务在本此阅读中完成时 toast 庆祝一次。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Card, Divider, Tag, Title } from 'animal-island-ui';
import { ArrowLeftIcon, EyeIcon, HeartIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { fmtDateTime, toastEduError } from './shared.jsx';
import { toastSuccess } from '../../components/toast.js';

export default function EduEntryDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [entry, setEntry] = useState(null);
  const [missing, setMissing] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/education/entries/${id}`);
      setEntry(data.entry);
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
      const data = await api.post(`/education/entries/${id}/favorite`, {});
      setEntry((prev) => (prev ? { ...prev, favorited: data.favorited, favoriteCount: data.favoriteCount } : prev));
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
        <h2>{t('edu.entries.notFound')}</h2>
        <Button type="primary" onClick={() => navigate('/education/entries')}>
          {t('edu.entries.backToList')}
        </Button>
      </div>
    );
  }

  if (!entry) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  return (
    <div>
      <div className="edu-section-head">
        <Button size="small" icon={<ArrowLeftIcon />} onClick={() => navigate('/education/entries')}>
          {t('edu.entries.backToList')}
        </Button>
        <Button
          size="small"
          type={entry.favorited ? 'primary' : 'default'}
          icon={<HeartIcon />}
          loading={favBusy}
          disabled={favBusy}
          onClick={toggleFavorite}
        >
          {entry.favorited ? t('edu.favorite.remove') : t('edu.favorite.add')}
        </Button>
      </div>

      <Card>
        <h2 className="edu-detail-title">{entry.title}</h2>
        <p className="edu-detail-sub">{entry.summary}</p>
        <div className="edu-meta">
          <span>{entry.no}</span>
          <span>
            <EyeIcon size={12} /> {t('edu.field.viewCount', { count: entry.viewCount })}
          </span>
          <span>
            <HeartIcon size={12} /> {entry.favoriteCount}
          </span>
          <span>{fmtDateTime(entry.publishedAt)}</span>
        </div>
        {entry.tags.length > 0 && (
          <div className="edu-meta">
            {entry.tags.map((tag) => (
              <Tag key={tag} size="small" variant="outlined">
                {tag}
              </Tag>
            ))}
          </div>
        )}
        <Divider type="thin" />
        <div className="edu-body">{entry.body}</div>
      </Card>

      {(entry.related ?? []).length > 0 && (
        <div className="edu-section">
          <div className="edu-section-head">
            <Title size="small">{t('edu.entries.related')}</Title>
          </div>
          <div className="edu-related-list">
            {entry.related.map((item) => (
              <Card key={item.id} className="edu-card" hoverable>
                <h3 className="edu-card-title">
                  <Link to={`/education/entries/${item.id}`}>{item.title}</Link>
                </h3>
                <p className="edu-card-summary">{item.summary}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
