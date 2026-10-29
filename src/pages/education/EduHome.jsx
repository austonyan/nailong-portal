// 教育与科学署首页:百科入口、科普专题、学习任务入口与我的学习概览。
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Background, Button, Card, Progress, Tag, Title } from 'animal-island-ui';
import { BookIcon, BulbIcon, FileIcon, StarIcon, TrophyIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { pct, toastEduError } from './shared.jsx';

const SERVICE_CARDS = [
  { to: '/education/entries', icon: BookIcon, key: 'entries' },
  { to: '/education/articles', icon: FileIcon, key: 'articles' },
  { to: '/education/tasks', icon: TrophyIcon, key: 'tasks' },
];

export default function EduHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/education/home')
      .then((res) => !cancelled && setData(res))
      .catch((err) => {
        toastEduError(t, err);
        if (!cancelled) {
          setData({ entries: [], articles: [], categories: [], tasks: [], counts: {}, badges: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (!data) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const categoryName = (code) => data.categories.find((c) => c.code === code)?.name ?? code;

  return (
    <div className="edu-section">
      <Background type="sprinkles" className="edu-hero">
        <h1 className="page-title">
          <Title size="large" color="app-blue">
            {t('edu.home.hero')}
          </Title>
        </h1>
        <p className="edu-hero-sub">{t('edu.home.heroSub')}</p>
        <div className="edu-hero-actions">
          <Button type="primary" size="large" icon={<BookIcon />} onClick={() => navigate('/education/entries')}>
            {t('edu.home.entryCta')}
          </Button>
          <Button type="default" size="large" icon={<FileIcon />} onClick={() => navigate('/education/articles')}>
            {t('edu.home.articleCta')}
          </Button>
          <Button type="dashed" size="large" icon={<TrophyIcon />} onClick={() => navigate('/education/tasks')}>
            {t('edu.home.taskCta')}
          </Button>
        </div>
        <div className="edu-hero-stats">
          <Tag color="app-blue" variant="soft">
            {t('edu.home.countEntries', { count: data.counts.entries ?? 0 })}
          </Tag>
          <Tag color="app-teal" variant="soft">
            {t('edu.home.countArticles', { count: data.counts.articles ?? 0 })}
          </Tag>
          <Tag color="app-blue" variant="soft">
            {t('edu.home.countReads', { count: data.counts.reads ?? 0 })}
          </Tag>
          <Tag color="purple" variant="soft">
            {t('edu.home.countBadges', { count: (data.badges ?? []).length })}
          </Tag>
        </div>
      </Background>

      <div className="edu-section">
        <div className="edu-section-head">
          <h2 className="section-title">
            <Title size="middle">{t('edu.home.services')}</Title>
          </h2>
        </div>
        <div className="edu-service-grid">
          {SERVICE_CARDS.map(({ to, icon: Icon, key }) => (
            <Link key={key} to={to} className="edu-service-card">
              <Icon size={24} />
              <span>
                {t(`edu.home.service.${key}`)}
                <small>{t(`edu.home.serviceTip.${key}`)}</small>
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="edu-section">
        <div className="edu-section-head">
          <h2 className="section-title">
            <Title size="middle">{t('edu.home.featuredEntries')}</Title>
          </h2>
          <Link to="/education/entries" className="edu-link">
            {t('edu.home.viewAll')}
          </Link>
        </div>
        <div className="edu-grid">
          {data.entries.map((item) => (
            <Card key={item.id} className="edu-card" hoverable>
              <h3 className="edu-card-title">
                <Link to={`/education/entries/${item.id}`}>{item.title}</Link>
              </h3>
              <p className="edu-card-summary">{item.summary}</p>
              <div className="edu-meta">
                <Tag size="small" color="app-blue" variant="soft">
                  {categoryName(item.categoryCode)}
                </Tag>
                <span>{item.no}</span>
              </div>
            </Card>
          ))}
          {data.entries.length === 0 && <p className="edu-empty">{t('common.empty')}</p>}
        </div>
      </div>

      <div className="edu-section">
        <div className="edu-section-head">
          <h2 className="section-title">
            <Title size="middle">{t('edu.home.featuredArticles')}</Title>
          </h2>
          <Link to="/education/articles" className="edu-link">
            {t('edu.home.viewAll')}
          </Link>
        </div>
        <div className="edu-grid">
          {data.articles.map((item) => (
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
          {data.articles.length === 0 && <p className="edu-empty">{t('common.empty')}</p>}
        </div>
      </div>

      <div className="edu-section">
        <div className="edu-section-head">
          <h2 className="section-title">
            <Title size="middle">{t('edu.home.tasksTitle')}</Title>
          </h2>
          <Link to="/education/tasks" className="edu-link">
            {t('edu.home.viewAll')}
          </Link>
        </div>
        <div className="edu-list">
          {data.tasks.map((task) => (
            <Card key={task.id} className="edu-task-card">
              <div className="edu-task-head">
                <BulbIcon size={18} />
                <h3>{task.title}</h3>
                <Tag size="small" color={task.completed ? 'app-green' : 'app-blue'} variant="soft">
                  {task.completed ? t('edu.recordStatus.completed') : t('edu.recordStatus.in_progress')}
                </Tag>
                <span className="edu-task-meta">
                  {t('edu.task.badgeLabel', { name: task.badgeName })}
                </span>
              </div>
              <p className="edu-card-summary">{task.description}</p>
              <div className="edu-task-progress">
                <Progress
                  percent={pct(task.progress, task.targetCount)}
                  infoFormat={() => t('edu.task.progressLabel', { progress: task.progress, target: task.targetCount })}
                  aria-label={task.title}
                />
              </div>
            </Card>
          ))}
          {data.tasks.length === 0 && <p className="edu-empty">{t('common.empty')}</p>}
        </div>
      </div>

      <div className="edu-section">
        <div className="edu-section-head">
          <h2 className="section-title">
            <Title size="middle">{t('edu.home.myTitle')}</Title>
          </h2>
          <Link to="/education/my" className="edu-link">
            {t('edu.home.viewAll')}
          </Link>
        </div>
        <div className="edu-stat-grid">
          <Card className="edu-stat-card">
            <span className="edu-stat-value">{data.counts.reads ?? 0}</span>
            <span className="edu-stat-label">{t('edu.home.myReads')}</span>
          </Card>
          <Card className="edu-stat-card">
            <span className="edu-stat-value">{data.counts.favorites ?? 0}</span>
            <span className="edu-stat-label">{t('edu.home.myFavorites')}</span>
          </Card>
          <Card className="edu-stat-card">
            <span className="edu-stat-value">{data.counts.completedTasks ?? 0}</span>
            <span className="edu-stat-label">{t('edu.home.myCompleted')}</span>
          </Card>
          <Card className="edu-stat-card">
            <span className="edu-stat-value">{(data.badges ?? []).length}</span>
            <span className="edu-stat-label">{t('edu.home.myBadges')}</span>
          </Card>
        </div>
        <div className="edu-badge-grid">
          {(data.badges ?? []).map((badge) => (
            <span key={badge.code} className="edu-badge-card">
              <StarIcon size={16} />
              {badge.name}
              <small>{badge.code}</small>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}