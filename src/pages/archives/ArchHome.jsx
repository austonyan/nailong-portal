// 皇家档案与记录署 — 首页:服务目录、本人档案概况与办事指南。
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Background, Button, Card, Collapse, Title, Typewriter } from 'animal-island-ui';
import { CalendarIcon, CompassIcon, InboxIcon, ListIcon, MailIcon, ShieldIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ArchNav, OfficeTag, RequestStatusTag, toastArchError } from './shared.jsx';

const QUICK_ENTRIES = [
  { to: '/archives/records', key: 'records', icon: ListIcon, color: 'app-teal' },
  { to: '/archives/requests', key: 'requests', icon: TrashIcon, color: 'app-orange' },
  { to: '/archives/messages', key: 'messages', icon: MailIcon, color: 'app-yellow' },
  { to: '/archives/help', key: 'help', icon: CompassIcon, color: 'app-green' },
];

const EMPTY_OVERVIEW = { recordTypes: [], counts: { visa: 0, immigration: 0, total: 0 }, guides: [], export: { limit: 3, used: 0 } };

export default function ArchHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/archives/overview')
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        toastArchError(err);
        if (!cancelled) setData(EMPTY_OVERVIEW);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = user?.displayName || user?.username || '';

  return (
    <div className="arch-page">
      <ArchNav />
      <Background type="sprinkles" className="arch-hero">
        <Title size="large" color="brown">
          {t('arch.home.hero')}
        </Title>
        <Typewriter speed={35}>
          <p className="arch-hero-sub">{t('arch.home.tagline')}</p>
        </Typewriter>
        <p className="muted-text">{t('auth.welcomeBack', { name: displayName })}</p>
      </Background>

      <section className="arch-stat-grid">
        <div className="arch-stat-card">
          <span className="arch-stat-label">{t('arch.home.totalArchived')}</span>
          <span className="arch-stat-value">{data ? data.counts.total : '…'}</span>
        </div>
        <div className="arch-stat-card">
          <span className="arch-stat-label">{t('arch.office.visa')}</span>
          <span className="arch-stat-value">{data ? data.counts.visa : '…'}</span>
        </div>
        <div className="arch-stat-card">
          <span className="arch-stat-label">{t('arch.office.immigration')}</span>
          <span className="arch-stat-value">{data ? data.counts.immigration : '…'}</span>
        </div>
        <div className="arch-stat-card">
          <span className="arch-stat-label">{t('arch.home.exportQuota')}</span>
          <span className="arch-stat-value">
            {data ? `${data.export.limit - data.export.used}/${data.export.limit}` : '…'}
          </span>
        </div>
      </section>

      {(data?.activeRequest || (data?.unreadMessages ?? 0) > 0) && (
        <Card color="app-yellow" className="arch-tag-row">
          <ShieldIcon size={18} />
          {data.activeRequest ? (
            <>
              <span>{t('arch.home.activeRequest')}</span>
              <RequestStatusTag value={data.activeRequest.status} />
              <Button type="text" size="small" onClick={() => navigate(`/archives/requests/${data.activeRequest.id}`)}>
                {t('arch.home.viewProgress')}
              </Button>
            </>
          ) : (
            <>
              <InboxIcon size={18} />
              <span>{t('arch.home.unreadTip', { count: data.unreadMessages })}</span>
              <Button type="text" size="small" onClick={() => navigate('/archives/messages')}>
                {t('arch.nav.messages')}
              </Button>
            </>
          )}
        </Card>
      )}

      <section>
        <Title size="middle" color="brown">
          {t('arch.home.quickEntries')}
        </Title>
        <div className="arch-quick-grid">
          {QUICK_ENTRIES.map((entry) => {
            const Icon = entry.icon;
            return (
              <Card key={entry.key} color={entry.color} hoverable className="arch-quick-card" onClick={() => navigate(entry.to)}>
                <Icon size={28} />
                <h3>{t(`arch.nav.${entry.key}`)}</h3>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <Title size="middle" color="brown">
          {t('arch.home.catalog')}
        </Title>
        <div className="arch-type-grid">
          {(data?.recordTypes ?? []).map((type) => (
            <Card key={type.code} hoverable className="arch-type-card" onClick={() => navigate(`/archives/records?office=${type.office}&type=${type.code}`)}>
              <div className="arch-type-head">
                <h3>{type.name}</h3>
                <OfficeTag office={type.office} />
              </div>
              <p className="arch-type-desc">{type.description}</p>
              <p className="arch-type-retention">
                <CalendarIcon size={12} /> {type.retention}
              </p>
            </Card>
          ))}
          {data && data.recordTypes.length === 0 && (
            <Card type="dashed">
              <p className="arch-empty">{t('arch.home.noTypes')}</p>
            </Card>
          )}
        </div>
      </section>

      <section>
        <Title size="middle" color="brown">
          {t('arch.home.guides')}
        </Title>
        <div className="arch-guide-list">
          {(data?.guides ?? []).map((guide) => (
            <Collapse key={guide.code} question={guide.title} answer={guide.body} />
          ))}
          {data && data.guides.length === 0 && (
            <Card type="dashed">
              <p className="arch-empty">{t('arch.home.noGuides')}</p>
            </Card>
          )}
        </div>
      </section>

      <Card color="brown" className="arch-note-card">
        <b>{t('arch.home.noteTitle')}</b>
        <p>{t('arch.home.noteBody')}</p>
      </Card>
    </div>
  );
}