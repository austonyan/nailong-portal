// 处理公示:脱敏统计(申诉量/受理率/时长/结果分布)、典型案例与质量报告,
// 不含申诉人信息与敏感细节,公示内容均带娱乐声明。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Tag, Title } from 'animal-island-ui';
import { api } from '../../api/client.js';
import { fmtDateTime, toastAppealError } from './shared.jsx';

const PCT = (v) => `${Math.round((v || 0) * 100)}%`;

export default function AppealPublicity() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api
      .get('/appeal/publicity')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastAppealError(t, err);
        setItems([]);
      });
    api
      .get('/appeal/publicity/stats')
      .then((data) => setStats(data))
      .catch(() => setStats(null));
  }, [t]);

  const pubColor = (kind) => (kind === 'stats' ? 'app-blue' : kind === 'report' ? 'app-teal' : 'app-pink');

  return (
    <div className="appeal-publicity-page">
      <Title size="middle" color="app-teal">
        {t('appeal.publicity.title')}
      </Title>
      <p className="muted-text">{t('appeal.publicity.maskTip')}</p>

      {stats && (
        <Card className="appeal-stats-card">
          <h4>{t('appeal.publicity.statsTitle')}</h4>
          <div className="appeal-stat-grid">
            <div className="appeal-stat-item">
              <strong>{stats.submitted}</strong>
              <span>{t('appeal.publicity.submitted')}</span>
            </div>
            <div className="appeal-stat-item">
              <strong>{PCT(stats.acceptRate)}</strong>
              <span>{t('appeal.publicity.acceptRate')}</span>
            </div>
            <div className="appeal-stat-item">
              <strong>{PCT(stats.rejectAcceptRate)}</strong>
              <span>{t('appeal.publicity.rejectRate')}</span>
            </div>
            <div className="appeal-stat-item">
              <strong>{stats.avgResolveDays}</strong>
              <span>{t('appeal.publicity.avgDays')}</span>
            </div>
            <div className="appeal-stat-item">
              <strong>{stats.reviewCompleted}/{stats.reviewTotal}</strong>
              <span>{t('appeal.publicity.reviews')}</span>
            </div>
          </div>
          <div className="appeal-dist-row">
            {(stats.decisionDistribution ?? []).map((d) => (
              <Tag key={d.type} variant="soft" color="app-blue">
                {t(`appeal.decisionType.${d.type}`)}: {d.n}
              </Tag>
            ))}
          </div>
          <p className="muted-text appeal-pub-disclaimer">{t('appeal.publicity.statsDisclaimer')}</p>
        </Card>
      )}

      {items === null && (
        <Card type="dashed">
          <p className="muted-text">{t('common.loading')}</p>
        </Card>
      )}
      {items !== null && items.length === 0 && (
        <Card type="dashed">
          <p className="muted-text">{t('common.empty')}</p>
        </Card>
      )}

      {(items ?? []).map((p) => (
        <Card key={p.id} className="appeal-notice-card">
          <div className="appeal-notice-head">
            <Tag color={pubColor(p.kind)} variant="soft">
              {t(`appeal.publicityKind.${p.kind}`)}
            </Tag>
            <strong>{p.title}</strong>
            <span className="muted-text appeal-notice-time">{fmtDateTime(p.publishedAt)}</span>
          </div>
          <p className="appeal-notice-body">{p.body}</p>
        </Card>
      ))}

      <Card type="dashed" className="appeal-disclaimer-card">
        <p>{t('appeal.publicity.disclaimer')}</p>
      </Card>
    </div>
  );
}
