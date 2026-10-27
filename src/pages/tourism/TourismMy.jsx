// 我的旅游:打卡 / 收集册 / 徽章的聚合视图。
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Table, Tag, Title } from 'animal-island-ui';
import { ClipboardIcon, TrophyIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import {
  BadgeIcon,
  StampIcon,
  fmtDateTime,
  toastTourError,
} from './shared.jsx';

export default function TourismMy() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/tourism/me')
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        toastTourError(t, err);
        if (!cancelled) {
          setData({
            stats: { checkins: 0, visited: 0, badges: 0, stamps: 0 },
            recentCheckins: [],
            badges: [],
            stamps: [],
            rules: { dailyLimit: 10 },
            todayCheckins: 0,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const stats = data?.stats ?? { checkins: 0, visited: 0, badges: 0, stamps: 0 };

  const columns = [
    { title: t('tour.collection.attraction'), dataIndex: 'attractionName' },
    { title: t('tour.collection.checkinNo'), dataIndex: 'no', width: 190 },
    { title: t('tour.collection.date'), dataIndex: 'checkinDate', width: 110 },
    { title: t('tour.collection.time'), dataIndex: 'createdAt', width: 150, render: fmtDateTime },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle" color="app-pink">
          {t('tour.my.title')}
        </Title>
      </div>
      <p className="muted-text">
        {t('tour.my.todayLine', { today: data?.todayCheckins ?? 0, limit: data?.rules?.dailyLimit ?? 10 })}
      </p>

      <div className="tour-stat-row">
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.my.statCheckins')}</span>
          <span className="tour-stat-number">{stats.checkins}</span>
        </Card>
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.my.statVisited')}</span>
          <span className="tour-stat-number">{stats.visited}</span>
        </Card>
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.my.statBadges')}</span>
          <span className="tour-stat-number">{stats.badges}</span>
        </Card>
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.my.statStamps')}</span>
          <span className="tour-stat-number">{stats.stamps}</span>
        </Card>
      </div>

      <section className="tour-section">
        <div className="tour-section-head">
          <Title size="small" color="app-yellow">
            {t('tour.my.badgesTitle')}
          </Title>
          <Button size="small" icon={<TrophyIcon />} onClick={() => navigate('/tourism/badges')}>
            {t('tour.my.viewBadges')}
          </Button>
        </div>
        <div className="tour-badge-grid">
          {(data?.badges ?? []).map((badge) => (
            <Card key={badge.id} className="tour-badge-card">
              <div className="tour-badge-head">
                <span className="tour-badge-emblem">
                  <BadgeIcon name={badge.icon} />
                </span>
                <div>
                  <div className="tour-badge-name">{badge.name}</div>
                  <div className="tour-meta-line">{fmtDateTime(badge.awardedAt)}</div>
                </div>
              </div>
              <p className="tour-card-summary">{badge.description}</p>
            </Card>
          ))}
          {data && data.badges.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('tour.my.noBadges')}</p>
            </Card>
          )}
        </div>
      </section>

      <section className="tour-section">
        <div className="tour-section-head">
          <Title size="small" color="app-teal">
            {t('tour.my.stampsTitle')}
          </Title>
          <Button size="small" icon={<ClipboardIcon />} onClick={() => navigate('/tourism/collection')}>
            {t('tour.my.viewCollection')}
          </Button>
        </div>
        <div className="tour-stamp-grid">
          {(data?.stamps ?? []).map((stamp) => (
            <Card key={stamp.no} className="tour-stamp-card">
              <span className="tour-stamp-emblem">
                <StampIcon style={stamp.stampStyle} />
              </span>
              <div>
                <div className="tour-stamp-name">{stamp.no}</div>
                <div className="tour-meta-line">
                  {stamp.portName || t('tour.collection.unknownPort')} · {stamp.entryDate}
                </div>
              </div>
            </Card>
          ))}
          {data && data.stamps.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('tour.my.noStamps')}</p>
            </Card>
          )}
        </div>
      </section>

      <section className="tour-section">
        <Title size="small" color="app-orange">
          {t('tour.my.recentCheckins')}
        </Title>
        <Card>
          <Table
            className="table-fit"
            columns={columns}
            dataSource={data?.recentCheckins ?? []}
            loading={data === null}
            rowKey="id"
            pagination={false}
            emptyText={t('tour.collection.noCheckins')}
          />
        </Card>
      </section>

      <div className="tour-center-btn">
        <Button type="primary" onClick={() => navigate('/tourism/attractions')}>
          {t('tour.my.goCheckin')}
        </Button>
      </div>

      {data && data.badges.length > 0 && (
        <div className="tour-center-btn">
          <Tag color="app-green" variant="soft">
            {t('tour.my.badgeCount', { count: data.badges.length })}
          </Tag>
        </div>
      )}
    </div>
  );
}