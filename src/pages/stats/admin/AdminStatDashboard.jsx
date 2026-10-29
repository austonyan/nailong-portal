// 平台总看板:各署核心 COUNT(申请量/待处理/通过率/平均处理时长)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { RefreshIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { StatsAdminNav } from '../StatsShell.jsx';
import { fmtDateTime, pct, toastStatError } from '../shared.jsx';

export default function AdminStatDashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get('/stats/admin/dashboard'));
    } catch (err) {
      toastStatError(t, err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="stat-admin-page">
      <StatsAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-blue">
            {t('stat.admin.dashboard.title')}
          </Title>
        </h1>
        <div className="table-actions">
          {data?.asOf && (
            <span className="stat-updated">{t('stat.home.updatedAt', { time: fmtDateTime(data.asOf) })}</span>
          )}
          <Button icon={<RefreshIcon />} loading={loading} disabled={loading} onClick={load}>
            {t('stat.admin.dashboard.refresh')}
          </Button>
        </div>
      </div>
      <p className="muted-text">{t('stat.admin.dashboard.tip')}</p>

      <div className="stat-board-grid">
        {(data?.offices ?? []).map((office) => (
          <Card
            key={office.key}
            className="stat-board-card"
            type={office.available ? 'default' : 'dashed'}
          >
            <div className="stat-board-head">
              <strong>{t(`stat.office.${office.key}`)}</strong>
              <Tag variant="soft" color={office.available ? 'app-green' : 'brown'}>
                {office.available ? t('stat.admin.dashboard.live') : t('stat.admin.dashboard.unavailable')}
              </Tag>
            </div>

            {office.available ? (
              <>
                <div className="stat-board-metrics">
                  <div className="stat-board-metric">
                    <strong>{office.total}</strong>
                    <span>{t('stat.admin.dashboard.total')}</span>
                  </div>
                  {office.pending !== null && (
                    <div className="stat-board-metric">
                      <strong>{office.pending}</strong>
                      <span>{t('stat.admin.dashboard.pending')}</span>
                    </div>
                  )}
                  {office.approvalRate !== null && (
                    <div className="stat-board-metric">
                      <strong>{pct(office.approvalRate)}</strong>
                      <span>{t('stat.admin.dashboard.approvalRate')}</span>
                    </div>
                  )}
                  {office.avgHours !== null && (
                    <div className="stat-board-metric">
                      <strong>{office.avgHours}</strong>
                      <span>{t('stat.admin.dashboard.avgHours')}</span>
                    </div>
                  )}
                </div>
                {office.extras?.length > 0 && (
                  <div className="stat-board-extras">
                    {office.extras.map((extra) => (
                      <Tag key={extra.key} variant="outlined" color="app-teal">
                        {t(`stat.admin.extra.${extra.key}`)}: {extra.value}
                      </Tag>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted-text">{t('stat.admin.dashboard.unavailableTip')}</p>
            )}
          </Card>
        ))}
        {data && data.offices.length === 0 && (
          <Card type="dashed">
            <p className="muted-text">{t('common.empty')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}