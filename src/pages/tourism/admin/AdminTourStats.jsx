// 基础统计:打卡量、徽章量与近 7 日趋势、热门景点,全部为简单 COUNT。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Card, Table, Tag, Title } from 'animal-island-ui';
import { TrophyIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastTourError } from '../shared.jsx';
import { TourAdminNav } from '../TourismShell.jsx';

export default function AdminTourStats() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/tourism/admin/stats')
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        toastTourError(t, err);
        if (!cancelled) setStats({});
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const maxTrend = Math.max(1, ...(stats?.trend ?? []).map((d) => d.checkins));
  const attr = stats?.attractions ?? {};
  const arts = stats?.articles ?? {};
  const checks = stats?.checkins ?? {};
  const badges = stats?.badges ?? {};

  const topColumns = [
    { title: t('common.name'), dataIndex: 'name' },
    { title: t('tour.admin.field.no'), dataIndex: 'no', width: 180 },
    { title: t('tour.admin.stats.checkins'), dataIndex: 'checkins', width: 100 },
  ];

  return (
    <div>
      <TourAdminNav />
      <div className="page-header">
        <Title size="middle" color="purple">
          {t('tour.admin.stats.title')}
        </Title>
      </div>

      <div className="tour-stats-grid">
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.admin.stats.attractions')}</span>
          <span className="tour-stat-number">{attr.total ?? 0}</span>
          <span className="tour-stat-label">
            {t('tour.admin.stats.onlineAttractions', { count: attr.online ?? 0 })}
          </span>
        </Card>
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.admin.stats.articles')}</span>
          <span className="tour-stat-number">{arts.total ?? 0}</span>
          <span className="tour-stat-label">
            {t('tour.admin.stats.publishedArticles', { count: arts.published ?? 0 })}
          </span>
        </Card>
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.admin.stats.checkinsTotal')}</span>
          <span className="tour-stat-number">{checks.total ?? 0}</span>
          <span className="tour-stat-label">
            {t('tour.admin.stats.checkinsToday', { count: checks.today ?? 0 })}
          </span>
        </Card>
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.admin.stats.checkinUsers')}</span>
          <span className="tour-stat-number">{checks.users ?? 0}</span>
          <span className="tour-stat-label">{t('tour.admin.stats.distinctCheckinUsers')}</span>
        </Card>
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.admin.stats.badgeDefinitions')}</span>
          <span className="tour-stat-number">{badges.definitions ?? 0}</span>
          <span className="tour-stat-label">
            {t('tour.admin.stats.badgeAwards', { count: badges.awards ?? 0 })}
          </span>
        </Card>
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.admin.stats.badgeRevoked')}</span>
          <span className="tour-stat-number">{badges.revoked ?? 0}</span>
          <span className="tour-stat-label">{t('tour.admin.stats.badgeRevokedHint')}</span>
        </Card>
      </div>

      <Card className="tour-section">
        <Title size="small">{t('tour.admin.stats.trendTitle')}</Title>
        <div className="tour-trend">
          {(stats?.trend ?? []).map((day) => (
            <div key={day.day} className="tour-trend-col" title={dayjs(day.day).format('YYYY-MM-DD')}>
              <span className="tour-trend-n">{day.checkins}</span>
              <div
                className="tour-trend-bar"
                style={{ height: `${Math.max(4, Math.round((day.checkins / maxTrend) * 90))}px` }}
              />
              <span className="tour-audit-detail">{dayjs(day.day).format('MM-DD')}</span>
            </div>
          ))}
          {!stats && <p className="muted-text">{t('common.loading')}</p>}
        </div>
      </Card>

      <Card className="tour-section">
        <div className="tour-section-head">
          <Title size="small">{t('tour.admin.stats.topAttractions')}</Title>
          <Tag size="small" color="app-orange" variant="soft">
            <TrophyIcon size={12} /> {t('tour.admin.stats.top5')}
          </Tag>
        </div>
        <Table
          className="table-fit"
          columns={topColumns}
          dataSource={stats?.topAttractions ?? []}
          loading={stats === null}
          rowKey="id"
          pagination={false}
          emptyText={t('tour.admin.stats.noData')}
        />
      </Card>
    </div>
  );
}
