// 统计署首页:平台趣味统计(跨署只读聚合)与年度报告入口。
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Background, Button, Card, Divider, Tag, Title, Typewriter } from 'animal-island-ui';
import { FileIcon, PrinterIcon, StarIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { fmtDateTime, toastStatError } from './shared.jsx';

export default function StatsHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [home, setHome] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/stats/home')
      .then((data) => {
        if (!cancelled) setHome(data);
      })
      .catch((err) => {
        toastStatError(t, err);
        if (!cancelled) setHome({ asOf: null, metrics: [], my: { reports: 0, latest: null } });
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (!home) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  return (
    <div className="stat-page">
      <Background type="sprinkles" className="stat-hero">
        <Title size="large">{t('stat.home.heroTitle')}</Title>
        <Typewriter speed={30}>
          <p className="stat-hero-sub">{t('stat.home.heroSub')}</p>
        </Typewriter>
        <div className="stat-hero-actions">
          <Button type="primary" size="large" icon={<StarIcon />} onClick={() => navigate('/stats/reports')}>
            {t('stat.home.entryReports')}
          </Button>
          <Button type="default" size="large" icon={<FileIcon />} onClick={() => navigate('/stats/guide')}>
            {t('stat.home.entryGuide')}
          </Button>
        </div>
      </Background>

      <section className="stat-section">
        <div className="page-header">
          <Title size="middle" color="app-teal">
            {t('stat.home.metricsTitle')}
          </Title>
          <span className="stat-updated">{t('stat.home.updatedAt', { time: fmtDateTime(home.asOf) })}</span>
        </div>
        <p className="muted-text">{t('stat.home.metricsTip')}</p>
        <div className="stat-metric-grid">
          {home.metrics.map((metric) => (
            <Card key={metric.code} className="stat-metric-card">
              <span className="stat-metric-name">{metric.name}</span>
              <strong className={metric.available ? 'stat-metric-value' : 'stat-metric-value is-muted'}>
                {metric.available ? metric.value : t('stat.home.unavailable')}
              </strong>
              <p className="stat-metric-desc">{metric.description}</p>
            </Card>
          ))}
          {home.metrics.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('common.empty')}</p>
            </Card>
          )}
        </div>
      </section>

      <Divider type="wave-yellow" />

      <section className="stat-section">
        <Title size="middle" color="app-blue">
          {t('stat.home.latestTitle')}
        </Title>
        <Card className="stat-report-hero">
          {home.my.latest ? (
            <>
              <div className="stat-report-head">
                <h3>{t('stat.home.latestYear', { year: home.my.latest.year })}</h3>
                <Tag variant="soft" color="app-green">
                  {home.my.latest.no}
                </Tag>
              </div>
              <p className="muted-text">
                {t('stat.home.latestGenerated', { time: fmtDateTime(home.my.latest.generatedAt) })}
              </p>
              <div className="stat-hero-actions">
                <Button
                  type="primary"
                  icon={<PrinterIcon />}
                  onClick={() => navigate(`/stats/reports/${home.my.latest.id}`)}
                >
                  {t('stat.home.openLatest')}
                </Button>
                <Button icon={<FileIcon />} onClick={() => navigate('/stats/reports')}>
                  {t('stat.nav.reports')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="muted-text">{t('stat.home.latestEmpty')}</p>
              <div className="stat-hero-actions">
                <Button type="primary" icon={<StarIcon />} onClick={() => navigate('/stats/reports')}>
                  {t('stat.reports.generate')}
                </Button>
              </div>
            </>
          )}
        </Card>
      </section>
    </div>
  );
}