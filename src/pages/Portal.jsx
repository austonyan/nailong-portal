import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Background, Card, Divider, Notification, Tag, Title, Typewriter } from 'animal-island-ui';
import { ArrowUpRightIcon } from 'naive-icons';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { serviceIcon } from '../components/icons.js';

export default function Portal() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [services, setServices] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/services')
      .then((data) => {
        if (!cancelled) setServices(data.items);
      })
      .catch((err) => {
        Notification.error(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
        if (!cancelled) setServices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const displayName = user?.displayName || user?.username || '';

  return (
    <div className="portal-page">
      <Background type="sprinkles" className="portal-hero">
        <Title size="large">{t('auth.welcomeBack', { name: displayName })}</Title>
        <Typewriter speed={40}>
          <p className="portal-tagline">{t('portal.tagline')}</p>
        </Typewriter>
      </Background>

      <div className="portal-stats">
        <Card className="stat-card">
          <span className="stat-label">{t('portal.myRoles')}</span>
          <div className="stat-value">
            {user?.roles?.length ? (
              user.roles.map((r) => (
                <Tag key={r.key} color="app-teal" variant="soft">
                  {r.name}
                </Tag>
              ))
            ) : (
              <span className="muted-text">-</span>
            )}
          </div>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('portal.serviceCount')}</span>
          <span className="stat-number">{services?.length ?? '…'}</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('portal.permissionCount')}</span>
          <span className="stat-number">{user?.permissions?.length ?? 0}</span>
        </Card>
      </div>

      <Divider type="wave-yellow" />

      <section>
        <Title size="middle" color="app-teal">
          {t('portal.services')}
        </Title>
        {services === null ? (
          <div className="portal-grid">
            <Card type="dashed">
              <p className="muted-text">{t('common.loading')}</p>
            </Card>
          </div>
        ) : services.length === 0 ? (
          <Card type="dashed">
            <p className="muted-text">{t('portal.servicesEmpty')}</p>
          </Card>
        ) : (
          <div className="portal-grid">
            {services.map((s) => {
              const Icon = serviceIcon(s.icon);
              return (
                <Card
                  key={s.key}
                  color={s.color}
                  hoverable
                  className="service-card"
                  onClick={() => window.open(s.url, '_blank', 'noopener,noreferrer')}
                >
                  <div className="service-card-top">
                    <Icon size={36} />
                    <ArrowUpRightIcon size={18} className="service-card-arrow" />
                  </div>
                  <h3 className="service-card-name">{s.name}</h3>
                  <p className="service-card-desc">{s.description}</p>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
