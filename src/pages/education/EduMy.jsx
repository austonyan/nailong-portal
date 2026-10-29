// 我的学习:阅读历史(内容下架/删除后标记不可再读)、收藏、成就徽章与统计。
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Tag, Title } from 'animal-island-ui';
import { BookIcon, FileIcon, HeartIcon, StarIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { TargetTypeTag, fmtDateTime, toastEduError } from './shared.jsx';

export default function EduMy() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/education/my');
      setData(res);
    } catch (err) {
      toastEduError(t, err);
      setData({ history: [], favorites: [], badges: [], stats: {} });
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const stats = data.stats ?? {};

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-blue">
            {t('edu.my.title')}
          </Title>
        </h1>
      </div>

      <div className="edu-stat-grid">
        <Card className="edu-stat-card">
          <span className="edu-stat-value">{stats.reads ?? 0}</span>
          <span className="edu-stat-label">{t('edu.home.myReads')}</span>
        </Card>
        <Card className="edu-stat-card">
          <span className="edu-stat-value">{stats.favorites ?? 0}</span>
          <span className="edu-stat-label">{t('edu.home.myFavorites')}</span>
        </Card>
        <Card className="edu-stat-card">
          <span className="edu-stat-value">{stats.completedTasks ?? 0}</span>
          <span className="edu-stat-label">{t('edu.home.myCompleted')}</span>
        </Card>
        <Card className="edu-stat-card">
          <span className="edu-stat-value">{stats.badges ?? 0}</span>
          <span className="edu-stat-label">{t('edu.home.myBadges')}</span>
        </Card>
      </div>

      <div className="edu-section">
        <div className="edu-section-head">
          <Title size="small">{t('edu.my.history')}</Title>
        </div>
        <div className="edu-related-list">
          {data.history.map((item) => (
            <Card key={item.id} className="edu-card">
              <div className="edu-related-item">
                <TargetTypeTag value={item.targetType} />
                {item.available ? (
                  <Link to={item.targetType === 'entry' ? `/education/entries/${item.targetId}` : `/education/articles/${item.targetId}`}>
                    {item.title}
                  </Link>
                ) : (
                  <span className="muted-text">{item.title}</span>
                )}
                <Tag size="small" color={item.available ? 'app-green' : 'brown'} variant="soft">
                  {item.available ? t('edu.my.readable') : t('edu.my.unavailable')}
                </Tag>
                <span className="edu-task-meta">{fmtDateTime(item.readAt)}</span>
              </div>
            </Card>
          ))}
          {data.history.length === 0 && <p className="edu-empty">{t('edu.my.historyEmpty')}</p>}
        </div>
      </div>

      <div className="edu-section">
        <div className="edu-section-head">
          <Title size="small">{t('edu.my.favorites')}</Title>
        </div>
        <div className="edu-related-list">
          {data.favorites.map((item) => (
            <Card key={`${item.targetType}-${item.targetId}`} className="edu-card">
              <div className="edu-related-item">
                <TargetTypeTag value={item.targetType} />
                <Link to={item.targetType === 'entry' ? `/education/entries/${item.targetId}` : `/education/articles/${item.targetId}`}>
                  {item.title}
                </Link>
                <span className="edu-task-meta">{fmtDateTime(item.favoritedAt)}</span>
              </div>
            </Card>
          ))}
          {data.favorites.length === 0 && <p className="edu-empty">{t('edu.my.favoritesEmpty')}</p>}
        </div>
      </div>

      <div className="edu-section">
        <div className="edu-section-head">
          <Title size="small">{t('edu.badges.title')}</Title>
        </div>
        <div className="edu-badge-grid">
          {data.badges.map((badge) => (
            <span key={badge.code} className="edu-badge-card">
              <StarIcon size={16} />
              {badge.name}
              <small>{fmtDateTime(badge.grantedAt)}</small>
            </span>
          ))}
          {data.badges.length === 0 && <p className="edu-empty">{t('edu.badges.empty')}</p>}
        </div>
      </div>

      <div className="edu-section">
        <div className="edu-section-head">
          <Title size="small">{t('edu.my.continueReading')}</Title>
        </div>
        <div className="edu-meta">
          <Link to="/education/entries" className="edu-link">
            <BookIcon size={14} /> {t('edu.nav.entries')}
          </Link>
          <Link to="/education/articles" className="edu-link">
            <FileIcon size={14} /> {t('edu.nav.articles')}
          </Link>
          <Link to="/education/tasks" className="edu-link">
            <HeartIcon size={14} /> {t('edu.nav.tasks')}
          </Link>
        </div>
      </div>
    </div>
  );
}
