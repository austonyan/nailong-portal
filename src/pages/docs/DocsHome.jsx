import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Background, Button, Card, Collapse, Divider, Notification, Tag, Title, Typewriter } from 'animal-island-ui';
import {
  AlertTriangleIcon,
  BadgeCheckIcon,
  BellIcon,
  CalendarIcon,
  ClipboardIcon,
  HelpCircleIcon,
  SearchIcon,
} from 'naive-icons';
import { api } from '../../api/client.js';

const NOTICE_LEVEL_COLORS = { info: 'app-red', policy: 'app-teal', event: 'app-yellow' };

export default function DocsHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notices, setNotices] = useState(null);
  const [types, setTypes] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/docs/notices'), api.get('/docs/types')])
      .then(([n, tp]) => {
        if (cancelled) return;
        setNotices(n.items || []);
        setTypes(tp.items || []);
      })
      .catch((err) => {
        Notification.error(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
        if (!cancelled) {
          setNotices([]);
          setTypes([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const quickEntries = [
    { key: 'apply', icon: ClipboardIcon, to: '/docs/apply', color: 'app-teal' },
    { key: 'certificates', icon: BadgeCheckIcon, to: '/docs/certificates', color: 'app-yellow' },
    { key: 'verify', icon: SearchIcon, to: '/docs/verify', color: 'app-blue' },
    { key: 'faq', icon: HelpCircleIcon, to: '/docs#faq', color: 'purple' },
  ];

  const guides = [
    { q: t('docs.home.faq1q'), a: t('docs.home.faq1a') },
    { q: t('docs.home.faq2q'), a: t('docs.home.faq2a') },
    { q: t('docs.home.faq3q'), a: t('docs.home.faq3a') },
    { q: t('docs.home.faq4q'), a: t('docs.home.faq4a') },
  ];

  return (
    <div className="docs-home">
      <Background type="sprinkles" className="docs-home-hero">
        <Title size="middle" color="app-yellow">
          {t('docs.home.welcome')}
        </Title>
        <Typewriter speed={35}>
          <p className="docs-home-tagline">{t('docs.home.tagline')}</p>
        </Typewriter>
      </Background>

      <div className="docs-quick-grid">
        {quickEntries.map((e) => {
          const Icon = e.icon;
          return (
            <Card key={e.key} color={e.color} hoverable className="docs-quick-card" onClick={() => navigate(e.to)}>
              <Icon size={30} />
              <span>{t(`docs.home.quick.${e.key}`)}</span>
            </Card>
          );
        })}
      </div>

      <div className="docs-notice-band">
        <Card color="app-red" pattern="app-red" className="docs-band-card">
          <div className="docs-band-head">
            <AlertTriangleIcon size={20} />
            <strong>{t('docs.home.antifraudTitle')}</strong>
          </div>
          <p>{t('docs.home.antifraudBody')}</p>
        </Card>
        <Card color="default" className="docs-band-card">
          <div className="docs-band-head">
            <BellIcon size={20} />
            <strong>{t('docs.home.entertainmentTitle')}</strong>
          </div>
          <p>{t('docs.home.entertainmentBody')}</p>
        </Card>
      </div>

      <Divider type="wave-yellow" />

      <section className="docs-section">
        <Title size="middle" color="app-teal">
          {t('docs.home.notices')}
        </Title>
        {notices === null ? (
          <Card type="dashed">
            <p className="muted-text">{t('common.loading')}</p>
          </Card>
        ) : notices.length === 0 ? (
          <Card type="dashed">
            <p className="muted-text">{t('common.empty')}</p>
          </Card>
        ) : (
          <div className="docs-notice-list">
            {notices.map((n) => (
              <Card key={n.id} className="docs-notice-item">
                <div className="docs-notice-head">
                  <Tag color={NOTICE_LEVEL_COLORS[n.level] || 'default'} size="small" variant="soft">
                    {t(`docs.noticeLevel.${n.level}`)}
                  </Tag>
                  <strong>{n.title}</strong>
                  <span className="muted-text docs-notice-date">
                    <CalendarIcon size={14} /> {String(n.createdAt).slice(0, 10)}
                  </span>
                </div>
                <p className="docs-notice-body">{n.body}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="docs-section">
        <Title size="middle" color="app-blue">
          {t('docs.home.catalog')}
        </Title>
        {types === null ? (
          <Card type="dashed">
            <p className="muted-text">{t('common.loading')}</p>
          </Card>
        ) : (
          <div className="portal-grid">
            {types.map((tp) => (
              <Card key={tp.code} hoverable className="docs-type-card" onClick={() => navigate(`/docs/types?focus=${tp.code}`)}>
                <h3 className="docs-type-name">{tp.name}</h3>
                <Tag size="small" variant="outlined">
                  {tp.code}
                </Tag>
                <p className="docs-type-desc">{tp.description}</p>
                <span className="muted-text docs-type-valid">{t('docs.types.validityDays', { days: tp.validityDays })}</span>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="docs-section" id="faq">
        <Title size="middle" color="purple">
          {t('docs.home.guide')}
        </Title>
        <Card className="docs-guide-card">
          {guides.map((g) => (
            <Collapse key={g.q} question={g.q} answer={g.a} />
          ))}
        </Card>
      </section>
    </div>
  );
}
