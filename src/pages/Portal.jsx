import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Background, Button, Card, Divider, Tag, Typewriter } from 'animal-island-ui';
import { ArrowUpRightIcon } from 'naive-icons';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { serviceIcon } from '../components/icons.js';
import SsoConfirmModal from '../components/SsoConfirmModal.jsx';

export default function Portal() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [ssoService, setSsoService] = useState(null);
  const [ssoBusy, setSsoBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/services')
      .then((data) => {
        if (cancelled) return;
        setServices(data.items ?? []);
        setFailed(false);
      })
      .catch(() => {
        // 拉取失败保留独立错误态:不能退化成空列表,否则网络故障会被
        // 渲染成「还没有可用的服务」这种假空态。
        if (!cancelled) {
          setServices(null);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const displayName = user?.displayName || user?.username || '';
  const loading = services === null && !failed;
  const permissionCount = Array.isArray(user?.permissions) ? user.permissions.length : null;

  // 服务入口:external 新开外链;internal 直接进 SPA 路由;internal_sso 先弹
  // 单点登录身份确认,确认后再进入(签注申请署等站内服务);本会话确认过
  // (sessionStorage 标志,确认时写入)则直接进入,与各署 Shell 直连行为一致。
  const openService = (s) => {
    if (s.entryMode === 'external') {
      window.open(s.url, '_blank', 'noopener,noreferrer');
    } else if (s.entryMode === 'internal') {
      navigate(s.url || '/');
    } else if (sessionStorage.getItem(`nailong.${s.key}.sso`) === '1') {
      navigate(s.url || '/');
    } else {
      setSsoService(s);
    }
  };

  // 服务卡是 div 上的 role="button":键盘 Enter/Space 与服务卡点击同一条路径,
  // Space 必须 preventDefault,否则页面会跟着滚动。
  const openByKey = (event, s) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openService(s);
    }
  };

  return (
    <div className="portal-page">
      <Background type="sprinkles" className="portal-hero">
        <h1 className="page-title">{t('auth.welcomeBack', { name: displayName })}</h1>
        <Typewriter speed={40}>
          <p className="portal-tagline">{t('portal.tagline')}</p>
        </Typewriter>
      </Background>

      <div className="portal-stats">
        <Card className="stat-card">
          <span className="stat-label">{t('portal.myRoles')}</span>
          <div className="stat-value">
            {!user ? (
              <span className="muted-text">{t('common.loading')}</span>
            ) : user.roles?.length ? (
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
          <span className="stat-number">{loading ? t('common.loading') : services.length}</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('portal.permissionCount')}</span>
          <span className="stat-number">{permissionCount === null ? t('common.loading') : permissionCount}</span>
        </Card>
      </div>

      <Divider type="wave-yellow" />

      <section>
        <h2 className="section-title">{t('portal.services')}</h2>
        {loading ? (
          <div className="portal-grid">
            <Card type="dashed">
              <p className="muted-text">{t('common.loading')}</p>
            </Card>
          </div>
        ) : failed ? (
          <Card type="dashed">
            <p className="muted-text">{t('portal.servicesLoadFailed')}</p>
            <div className="table-actions">
              <Button type="primary" onClick={() => setReloadKey((k) => k + 1)}>
                {t('common.retry')}
              </Button>
            </div>
          </Card>
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
                  pattern={s.color}
                  hoverable
                  className="service-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => openService(s)}
                  onKeyDown={(e) => openByKey(e, s)}
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

      <SsoConfirmModal
        flag={ssoService ? `nailong.${ssoService.key}.sso` : null}
        open={ssoService !== null}
        busy={ssoBusy}
        service={ssoService?.name}
        pattern="app-teal"
        tip={t('portal.sso.tip')}
        onCancel={() => setSsoService(null)}
        onConfirm={(flagKey) => {
          if (!ssoService) return;
          setSsoBusy(true);
          // 通用站内服务 SSO 标志:签注署(nailong.visa.sso)等沿用既有键
          try {
            sessionStorage.setItem(flagKey, '1');
            setSsoService(null);
            navigate(ssoService.url || '/');
          } finally {
            setSsoBusy(false);
          }
        }}
      />
    </div>
  );
}
