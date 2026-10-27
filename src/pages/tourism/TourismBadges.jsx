// 成就徽章:打卡次数达标自动发放,展示进度与获得时间。
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Progress, Tag, Title } from 'animal-island-ui';
import { api } from '../../api/client.js';
import { BadgeIcon, fmtDateTime, toastTourError } from './shared.jsx';

export default function TourismBadges() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/tourism/badges')
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        toastTourError(t, err);
        if (!cancelled) setData({ total: 0, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const total = data?.total ?? 0;

  return (
    <div>
      <div className="page-header">
        <Title size="middle" color="app-green">
          {t('tour.badges.title')}
        </Title>
        <Button size="small" onClick={() => navigate('/tourism/attractions')}>
          {t('tour.badges.goCheckin')}
        </Button>
      </div>
      <p className="muted-text">{t('tour.badges.tip', { total })}</p>

      <div className="tour-badge-grid">
        {(data?.items ?? []).map((badge) => {
          const percent = badge.threshold > 0 ? Math.min(100, Math.round((total / badge.threshold) * 100)) : 0;
          return (
            <Card key={badge.id} className="tour-badge-card">
              <div className="tour-badge-head">
                <span className={`tour-badge-emblem${badge.awarded ? '' : ' locked'}`}>
                  <BadgeIcon name={badge.icon} />
                </span>
                <div>
                  <div className="tour-badge-name">{badge.name}</div>
                  <div className="tour-meta-line">{badge.no}</div>
                </div>
              </div>
              <p className="tour-card-summary">{badge.description}</p>
              <div className="tour-badge-progress">
                <Progress
                  percent={percent}
                  size="small"
                  infoFormat={() => `${Math.min(total, badge.threshold)} / ${badge.threshold}`}
                />
                {badge.awarded ? (
                  <Tag size="small" color="app-green" variant="soft">
                    {t('tour.badges.awardedAt', { time: fmtDateTime(badge.awardedAt) })}
                  </Tag>
                ) : (
                  <Tag size="small" variant="soft">
                    {t('tour.badges.inProgress')}
                  </Tag>
                )}
              </div>
            </Card>
          );
        })}
        {data && data.items.length === 0 && (
          <Card type="dashed">
            <p className="muted-text">{t('tour.badges.empty')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}