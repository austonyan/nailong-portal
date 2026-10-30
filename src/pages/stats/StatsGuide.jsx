// 数据说明:统计口径、来源、更新方式与功能性提示。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Divider, Tag, Title } from 'animal-island-ui';
import { InfoIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { fmtDateTime, toastStatError } from './shared.jsx';

export default function StatsGuide() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/stats/metrics')
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        toastStatError(t, err);
        if (!cancelled) setData({ asOf: null, items: [] });
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

  return (
    <div className="stat-page">
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-teal">
            {t('stat.guide.title')}
          </Title>
        </h1>
        <span className="stat-updated">{t('stat.home.updatedAt', { time: fmtDateTime(data.asOf) })}</span>
      </div>
      <p className="muted-text">{t('stat.guide.tip')}</p>

      <div className="stat-metric-grid">
        <Card className="stat-metric-card">
          <h2 className="block-heading">{t('stat.guide.frequencyTitle')}</h2>
          <p className="stat-metric-desc">{t('stat.guide.frequencyBody')}</p>
        </Card>
        <Card className="stat-metric-card">
          <h2 className="block-heading">{t('stat.guide.privacyTitle')}</h2>
          <p className="stat-metric-desc">{t('stat.guide.privacyBody')}</p>
        </Card>
        <Card className="stat-metric-card">
          <h2 className="block-heading">{t('stat.guide.scopeTitle')}</h2>
          <p className="stat-metric-desc">{t('stat.guide.scopeBody')}</p>
        </Card>
      </div>

      <Divider type="wave-yellow" />

      <h2 className="section-title">
        <Title size="middle" color="app-orange">
          {t('stat.guide.metricsTitle')}
        </Title>
      </h2>
      <div className="stat-metric-grid">
        {data.items.map((metric) => (
          <Card key={metric.code} className="stat-metric-card">
            <div className="stat-board-head">
              <span className="stat-metric-name">{metric.name}</span>
              <Tag variant="outlined" color="app-blue">
                {t(`stat.office.${metric.sourceOffice}`)}
              </Tag>
            </div>
            <strong className={metric.available ? 'stat-metric-value' : 'stat-metric-value is-muted'}>
              {metric.available ? metric.value : t('stat.home.unavailable')}
            </strong>
            <p className="stat-metric-desc">{metric.description}</p>
            <p className="stat-metric-desc">
              <InfoIcon size={13} /> {t('stat.guide.formula')}: {metric.formula || '-'}
            </p>
            <p className="stat-metric-desc">
              {t('stat.guide.source')}: {metric.tableName}
            </p>
          </Card>
        ))}
        {data.items.length === 0 && (
          <Card type="dashed">
            <p className="muted-text">{t('common.empty')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}