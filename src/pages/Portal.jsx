import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Background, Button, Card, Divider, Modal, Notification, Tag, Title, Typewriter } from 'animal-island-ui';
import { ArrowUpRightIcon } from 'naive-icons';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { serviceIcon } from '../components/icons.js';

export default function Portal() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState(null);
  const [ssoService, setSsoService] = useState(null);

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

  // 服务入口:external 新开外链;internal 直接进 SPA 路由;internal_sso 先弹
  // 单点登录身份确认,确认后再进入(签注申请署等站内服务)。
  const openService = (s) => {
    if (s.entryMode === 'external') {
      window.open(s.url, '_blank', 'noopener,noreferrer');
    } else if (s.entryMode === 'internal') {
      navigate(s.url);
    } else {
      setSsoService(s);
    }
  };

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
                  onClick={() => openService(s)}
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

      <Modal
        open={ssoService !== null}
        title={t('visa.sso.title')}
        onClose={() => setSsoService(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setSsoService(null)}>{t('common.cancel')}</Button>
            <Button
              type="primary"
              onClick={() => {
                const target = ssoService;
                // 通用站内服务 SSO 标志:签注署(nailong.visa.sso)等沿用既有键
                sessionStorage.setItem(`nailong.${target?.key}.sso`, '1');
                setSsoService(null);
                if (target) navigate(target.url);
              }}
            >
              {t('visa.sso.confirm')}
            </Button>
          </>
        }
      >
        <div className="visa-sso-body">
          <Card color="app-teal" className="visa-sso-card">
            <div className="visa-sso-identity">
              <Avatar size="large">{displayName.slice(0, 1)}</Avatar>
              <div>
                <div className="visa-sso-name">{displayName}</div>
                <div className="visa-sso-account">@{user?.username}</div>
              </div>
            </div>
          </Card>
          <p className="muted-text">{t('visa.sso.portalTip')}</p>
        </div>
      </Modal>
    </div>
  );
}
