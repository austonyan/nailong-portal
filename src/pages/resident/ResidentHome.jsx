// 居民登记署首页:署内公告、居民类型展示、办事指南、快速入口、防诈骗提示。
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Background, Button, Card, Collapse, Divider, Tag, Title, Typewriter } from 'animal-island-ui';
import { BadgeCheckIcon, BellIcon, ClipboardIcon, HelpCircleIcon, ListIcon, SearchIcon, ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { NOTICE_LEVEL_COLORS, fmtDateTime, toastResError } from './shared.jsx';

const QUICK_ENTRIES = [
  { to: '/resident/apply', key: 'apply', icon: ClipboardIcon, color: 'app-green' },
  { to: '/resident/card', key: 'card', icon: ShieldIcon, color: 'app-teal' },
  { to: '/resident/changes', key: 'changes', icon: ListIcon, color: 'app-yellow' },
  { to: '/resident/verify', key: 'verify', icon: SearchIcon, color: 'app-blue' },
  { to: '/resident/guide', key: 'guide', icon: HelpCircleIcon, color: 'app-orange' },
];

const GUIDE_KEYS = ['conditions', 'materials', 'duration', 'rights'];

const FAQ_KEYS = ['realWorld', 'fee', 'howLong', 'rejected'];

export default function ResidentHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [home, setHome] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/resident/home')
      .then((data) => {
        if (!cancelled) setHome(data);
      })
      .catch((err) => {
        toastResError(t, err);
        if (!cancelled) setHome({ notices: [], types: [], myApplication: null, myCard: null });
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div className="res-home">
      <Background type="sprinkles" className="res-hero">
        <Title size="large" color="app-green">
          {t('res.home.hero')}
        </Title>
        <Typewriter speed={35}>
          <p className="res-hero-sub">{t('res.home.tagline')}</p>
        </Typewriter>
      </Background>

      <section className="res-home-status">
        <Card className="res-status-card" color={home?.myCard ? 'app-green' : 'app-teal'}>
          <div className="res-status-head">
            <BadgeCheckIcon size={20} />
            <span>{t('res.home.myResidency')}</span>
          </div>
          {home?.myCard ? (
            <>
              <h3 className="res-status-name">{home.myCard.nickname || home.myCard.cardNo}</h3>
              <p className="muted-text">{home.myCard.cardNo}</p>
              <div className="res-status-tags">
                <Tag color="app-green" variant="soft">
                  {t(`res.cardStatus.${home.myCard.status}`)}
                </Tag>
              </div>
              <Button size="small" className="res-status-btn" onClick={() => navigate('/resident/card')}>
                {t('res.home.viewCard')}
              </Button>
            </>
          ) : (
            <p className="muted-text">{t('res.home.notResidentYet')}</p>
          )}
        </Card>
        <Card className="res-status-card">
          <div className="res-status-head">
            <ListIcon size={18} />
            <span>{t('res.home.myApplication')}</span>
          </div>
          {home?.myApplication ? (
            <>
              <h3 className="res-status-name">{home.myApplication.appNo}</h3>
              <div className="res-status-tags">
                <Tag color="app-yellow" variant="soft">
                  {t(`res.appStatus.${home.myApplication.status}`)}
                </Tag>
              </div>
              <Button size="small" className="res-status-btn" onClick={() => navigate(`/resident/applications/${home.myApplication.id}`)}>
                {t('res.home.trackProgress')}
              </Button>
            </>
          ) : (
            <p className="muted-text">{t('res.home.noApplication')}</p>
          )}
        </Card>
        <Card className="res-status-card">
          <div className="res-status-head">
            <BellIcon size={18} />
            <span>{t('res.home.messages')}</span>
          </div>
          <div className="res-my-mini">
            <span>
              {t('res.home.unread')}: <b>{home?.unread ?? '…'}</b>
            </span>
            <span>
              {t('res.home.reviewHint', { hours: home?.reviewHoursHint ?? '…' })}
            </span>
          </div>
        </Card>
      </section>

      <section>
        <Title size="middle" color="app-green">
          {t('res.home.quickEntries')}
        </Title>
        <div className="res-quick-grid">
          {QUICK_ENTRIES.map((entry) => {
            const Icon = entry.icon;
            return (
              <Card key={entry.key} color={entry.color} hoverable className="res-quick-card" onClick={() => navigate(entry.to)}>
                <Icon size={30} />
                <h3>{t(`res.nav.${entry.key}`)}</h3>
              </Card>
            );
          })}
        </div>
      </section>

      <Divider type="wave-yellow" />

      <section>
        <Title size="middle" color="app-teal">
          {t('res.home.types')}
        </Title>
        <div className="res-type-grid">
          {(home?.types ?? []).map((type) => (
            <Card key={type.code} hoverable className="res-type-card" onClick={() => navigate(`/resident/guide#${type.code}`)}>
              <div className="res-type-head">
                <b>{type.name}</b>
                <Tag color="app-green" variant="soft" size="small">
                  {t('res.type.open')}
                </Tag>
              </div>
              <p className="muted-text">{type.description}</p>
              <p className="muted-text">{t('res.type.validYears', { years: type.validYears })}</p>
            </Card>
          ))}
          {home && home.types.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('res.home.noTypes')}</p>
            </Card>
          )}
        </div>
      </section>

      <section>
        <Title size="middle">{t('res.home.guide')}</Title>
        <div className="res-faq">
          {GUIDE_KEYS.map((key) => (
            <Collapse key={key} question={t(`res.home.guideItems.${key}.q`)} answer={t(`res.home.guideItems.${key}.a`)} />
          ))}
        </div>
      </section>

      <section>
        <Title size="middle" color="app-orange">
          {t('res.home.announcements')}
        </Title>
        <div className="res-ann-list">
          {(home?.notices ?? []).map((n) => (
            <Card key={n.id} className="res-ann-item">
              <div className="res-ann-head">
                <Tag color={NOTICE_LEVEL_COLORS[n.level] || 'default'} variant="soft" size="small">
                  {t(`res.noticeLevel.${n.level}`)}
                </Tag>
                <b>{n.title}</b>
                <span className="muted-text">{fmtDateTime(n.createdAt)}</span>
              </div>
              <p className="res-ann-body">{n.body}</p>
            </Card>
          ))}
          {home && home.notices.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('res.home.noAnnouncements')}</p>
            </Card>
          )}
        </div>
      </section>

      <section>
        <Title size="middle">{t('res.home.faq')}</Title>
        <div className="res-faq">
          {FAQ_KEYS.map((key) => (
            <Collapse key={key} question={t(`res.faq.${key}.q`)} answer={t(`res.faq.${key}.a`)} />
          ))}
        </div>
      </section>

      <Card color="app-yellow" className="res-fraud-card">
        <b>{t('res.fraud.title')}</b>
        <p>{home?.disclaimerText || t('res.disclaimer.default')}</p>
        <Link to="/resident/guide" className="res-link">
          {t('res.fraud.more')}
        </Link>
      </Card>

      <div className="res-center-btn">
        <Button type="primary" size="large" onClick={() => navigate('/resident/apply')}>
          {t('res.home.startApply')}
        </Button>
      </div>
    </div>
  );
}
