// 学习任务:阅读打卡任务进度 + 已获得的成就徽章。
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Progress, Tag, Title } from 'animal-island-ui';
import { BulbIcon, StarIcon, TrophyIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { fmtDateTime, pct, toastEduError } from './shared.jsx';

export default function EduTasks() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/education/tasks');
      setData(res);
    } catch (err) {
      toastEduError(t, err);
      setData({ items: [], badges: [] });
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

  return (
    <div>
      <div className="page-header">
        <Title size="middle" color="app-yellow">
          {t('edu.tasks.title')}
        </Title>
      </div>
      <p className="muted-text">{t('edu.tasks.tip')}</p>

      <div className="edu-list">
        {data.items.map((task) => (
          <Card key={task.id} className="edu-task-card">
            <div className="edu-task-head">
              <BulbIcon size={18} />
              <h3>{task.title}</h3>
              <Tag size="small" color={task.completed ? 'app-teal' : 'app-yellow'} variant="soft">
                {task.completed ? t('edu.recordStatus.completed') : t('edu.recordStatus.in_progress')}
              </Tag>
              <span className="edu-task-meta">
                {t('edu.task.badgeLabel', { name: task.badgeName || t('edu.task.noBadge') })}
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
            {task.completedAt && (
              <p className="edu-empty">
                {t('edu.task.completedAt', { time: fmtDateTime(task.completedAt) })}
              </p>
            )}
          </Card>
        ))}
        {data.items.length === 0 && (
          <Card type="dashed">
            <p className="muted-text">
              <TrophyIcon size={14} /> {t('edu.tasks.empty')}
            </p>
          </Card>
        )}
      </div>

      <div className="edu-section">
        <div className="edu-section-head">
          <Title size="small">{t('edu.badges.title')}</Title>
          <Link to="/education/my" className="edu-link">
            {t('edu.badges.viewAll')}
          </Link>
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
    </div>
  );
}
