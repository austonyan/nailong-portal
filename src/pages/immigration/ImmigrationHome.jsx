import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Background, Button, Card, Collapse, Divider, Tag, Title, Typewriter } from 'animal-island-ui';
import { BellIcon, CodeIcon, CompassIcon, FileIcon, ListIcon, MapIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { toastApiError } from '../../components/immigration/apiError.js';
import { AnnouncementLevelTag, CrowdMeter, ImNav, StatusTag } from '../../components/immigration/shared.jsx';
import { fmtDate } from '../../lib/date.js';

const QUICK_ENTRIES = [
  { to: '/immigration/declare', key: 'declare', icon: FileIcon, color: 'app-teal' },
  { to: '/immigration/declarations', key: 'myDeclarations', icon: ListIcon, color: 'app-yellow' },
  { to: '/immigration/pass-codes', key: 'passCodes', icon: CodeIcon, color: 'app-blue' },
  { to: '/immigration/records', key: 'records', icon: MapIcon, color: 'app-orange' },
  { to: '/immigration/help', key: 'help', icon: CompassIcon, color: 'app-green' },
];

const FAQ_KEYS = ['visaInvalid', 'passUsage', 'recordsWhere', 'fee'];

export default function ImmigrationHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/immigration/overview')
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch((err) => {
        toastApiError(err);
        if (!cancelled) setOverview({ ports: [], announcements: [], crowding: null, my: {} });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const port = overview?.ports?.[0];
  const displayName = user?.displayName || user?.username || '';

  return (
    <div className="im-page">
      <ImNav />
      <Background type="sprinkles" className="im-hero">
        <Title size="large" color="app-orange">
          {t('imm.home.hero')}
        </Title>
        <Typewriter speed={35}>
          <p className="im-hero-sub">{t('imm.home.tagline')}</p>
        </Typewriter>
        <p className="muted-text">{t('auth.welcomeBack', { name: displayName })}</p>
      </Background>

      <section className="im-home-status">
        <Card className="im-status-card" color={port?.status === 'open' ? 'app-teal' : 'app-orange'}>
          <div className="im-status-head">
            <CompassIcon size={22} />
            <span>{t('imm.home.portStatus')}</span>
          </div>
          {port ? (
            <>
              <h3 className="im-status-name">{port.name}</h3>
              <p className="muted-text">{port.code}</p>
              <div className="im-status-tags">
                <StatusTag value={port.status} i18nPrefix="imm.portStatus" />
              </div>
              <p className="muted-text">{port.openHours}</p>
            </>
          ) : (
            <p className="muted-text">{t('common.loading')}</p>
          )}
        </Card>
        <Card className="im-status-card">
          <div className="im-status-head">
            <span>{t('imm.home.crowding')}</span>
          </div>
          <CrowdMeter crowding={overview?.crowding} />
          <p className="muted-text">{t('imm.home.crowdingTip')}</p>
        </Card>
        <Card className="im-status-card">
          <div className="im-status-head">
            <BellIcon size={18} />
            <span>{t('imm.home.myImmigration')}</span>
          </div>
          <div className="im-my-mini">
            <span>
              {t('imm.home.inReview')}: <b>{overview?.my?.pending ?? '…'}</b>
            </span>
            <span>
              {t('imm.home.passReady')}: <b>{overview?.my?.approved ?? '…'}</b>
            </span>
            <span>
              {t('imm.home.unread')}: <b>{overview?.my?.unreadMessages ?? '…'}</b>
            </span>
            {overview?.my?.expiringEntries > 0 && (
              <Tag color="app-orange" variant="soft" size="small">
                {t('imm.home.expiring', { count: overview.my.expiringEntries })}
              </Tag>
            )}
          </div>
        </Card>
      </section>

      <section>
        <Title size="middle" color="app-orange">
          {t('imm.home.quickEntries')}
        </Title>
        <div className="im-quick-grid">
          {QUICK_ENTRIES.map((entry) => {
            const Icon = entry.icon;
            return (
              <Card key={entry.key} color={entry.color} hoverable className="im-quick-card" onClick={() => navigate(entry.to)}>
                <Icon size={30} />
                <h3>{t(`imm.nav.${entry.key}`)}</h3>
              </Card>
            );
          })}
        </div>
      </section>

      <Divider type="wave-yellow" />

      <section>
        <Title size="middle" color="app-teal">
          {t('imm.home.announcements')}
        </Title>
        <div className="im-ann-list">
          {(overview?.announcements ?? []).map((a) => (
            <Card key={a.id} className="im-ann-item">
              <div className="im-ann-head">
                <AnnouncementLevelTag level={a.level} />
                <b>{a.title}</b>
                <span className="muted-text">{fmtDate(a.publishedAt)}</span>
              </div>
              <p className="im-ann-body">{a.body}</p>
            </Card>
          ))}
          {overview && overview.announcements?.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('imm.home.noAnnouncements')}</p>
            </Card>
          )}
        </div>
      </section>

      <section>
        <Title size="middle">{t('imm.home.faq')}</Title>
        <div className="im-faq">
          {FAQ_KEYS.map((key) => (
            <Collapse key={key} question={t(`imm.faq.${key}.q`)} answer={t(`imm.faq.${key}.a`)} />
          ))}
        </div>
      </section>

      <Card color="app-yellow" className="im-fraud-card">
        <b>{t('imm.fraud.title')}</b>
        <p>{t('imm.fraud.body')}</p>
        <Link to="/immigration/help" className="im-link">
          {t('imm.fraud.more')}
        </Link>
      </Card>

      <div className="im-center-btn">
        <Button type="primary" size="large" onClick={() => navigate('/immigration/declare')}>
          {t('imm.home.startDeclare')}
        </Button>
      </div>
    </div>
  );
}
