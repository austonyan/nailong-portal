// 礼宾与活动署首页:署内公告、活动分类、热门/即将开始、服务目录、办事指南、
// 快速入口与常见问题。
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Background, Button, Card, Collapse, Divider, Progress, Tag, Title, Typewriter } from 'animal-island-ui';
import {
  AlertTriangleIcon,
  CalendarIcon,
  CreditCardIcon,
  FileIcon,
  GiftIcon,
  HelpCircleIcon,
  HomeIcon,
  ImageIcon,
  MailIcon,
  SearchIcon,
  SendIcon,
  StarIcon,
  UserPlusIcon,
  UsersIcon,
} from 'naive-icons';
import { api } from '../../api/client.js';
import { StatusTag, fmtDate, fmtDateTime, fmtMonthDay, fmtTime, toastProtocolError } from './shared.jsx';

const TYPE_ICONS = [CalendarIcon, GiftIcon, ImageIcon, UsersIcon, StarIcon, HomeIcon];
const SERVICE_ICONS = [SendIcon, MailIcon, CreditCardIcon, UserPlusIcon, StarIcon, SearchIcon];

// Card 只是带 onClick 的 div:补 role/tabIndex 后由这里接住 Enter/Space。
function cardKeyDown(handler) {
  return (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler();
    }
  };
}

export default function ProtocolHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [home, setHome] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/protocol/home')
      .then((data) => !cancelled && setHome(data))
      .catch((err) => {
        toastProtocolError(t, err);
        if (!cancelled) setHome({ notices: [], types: [], hot: [], upcoming: [], courtesyTypes: [], unread: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (!home) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const services = [
    { key: 'apply', to: '/protocol/events', icon: SendIcon },
    { key: 'invitations', to: '/protocol/invitations', icon: MailIcon },
    { key: 'passes', to: '/protocol/passes', icon: CreditCardIcon },
    { key: 'host', to: '/protocol/hosts', icon: UserPlusIcon },
    { key: 'courtesy', to: '/protocol/courtesy', icon: StarIcon },
    { key: 'verify', to: '/protocol/verify', icon: SearchIcon },
  ];

  const guides = [
    { key: 'apply', to: '/protocol/events' },
    { key: 'invitation', to: '/protocol/invitations' },
    { key: 'pass', to: '/protocol/passes' },
  ];

  const faqs = ['fee', 'real', 'deadline', 'waitlist', 'identity'];

  return (
    <div className="protocol-home">
      <Background type="sprinkles" className="protocol-hero">
        <h1 className="page-title">
          <Title size="large">{t('protocol.home.heroTitle')}</Title>
        </h1>
        <Typewriter speed={30}>
          <p className="protocol-hero-sub">{t('protocol.home.heroSub')}</p>
        </Typewriter>
        <div className="protocol-hero-actions">
          <Button type="primary" size="large" icon={<CalendarIcon />} onClick={() => navigate('/protocol/events')}>
            {t('protocol.home.browseEvents')}
          </Button>
          <Button type="default" size="large" icon={<FileIcon />} onClick={() => navigate('/protocol/registrations')}>
            {t('protocol.home.myRegistrations')}
          </Button>
          <Button type="dashed" size="large" icon={<SearchIcon />} onClick={() => navigate('/protocol/verify')}>
            {t('protocol.home.verifyEntry')}
          </Button>
        </div>
        <div className="protocol-hero-stats">
          <Tag color="app-teal" variant="solid">
            {t('protocol.home.statOpen', { count: home.openCount })}
          </Tag>
          <Tag color="app-blue" variant="soft">
            {t('protocol.home.statTypes', { count: home.types.length })}
          </Tag>
          <Tag color="app-blue" variant="soft">
            {t('protocol.home.statHours', { hours: home.reviewHoursHint })}
          </Tag>
        </div>
      </Background>

      <Card pattern="app-yellow" className="protocol-scam-banner">
        <div className="protocol-scam-inner">
          <AlertTriangleIcon size={22} />
          <div>
            <strong>{t('protocol.scamTitle')}</strong>
            <p>{t('protocol.scamBody')}</p>
          </div>
        </div>
      </Card>

      <section className="protocol-section">
        <h2 className="section-title">
          <Title size="middle" color="app-teal">
            {t('protocol.home.notices')}
          </Title>
        </h2>
        <div className="protocol-notice-list">
          {home.notices.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('common.empty')}</p>
            </Card>
          )}
          {home.notices.map((n) => (
            <Card key={n.id} className="protocol-notice-card">
              <div className="protocol-notice-head">
                <Tag color={n.level === 'policy' ? 'warm-peach-pink' : n.level === 'event' ? 'app-pink' : 'app-blue'} variant="soft">
                  {t(`protocol.level.${n.level}`, { defaultValue: t('common.unknown') })}
                </Tag>
                <strong>{n.title}</strong>
                <span className="muted-text protocol-notice-time">{fmtDateTime(n.createdAt)}</span>
              </div>
              <p className="protocol-notice-body">{n.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="protocol-section">
        <h2 className="section-title">
          <Title size="middle" color="app-orange">
            {t('protocol.home.categories')}
          </Title>
        </h2>
        <p className="muted-text protocol-section-sub">{t('protocol.home.categoriesSub')}</p>
        <div className="protocol-type-grid">
          {home.types.map((tp, i) => {
            const Icon = TYPE_ICONS[i % TYPE_ICONS.length];
            return (
              <Card
                key={tp.code}
                hoverable
                className="protocol-type-card"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/protocol/events?type=${tp.code}`)}
                onKeyDown={cardKeyDown(() => navigate(`/protocol/events?type=${tp.code}`))}
              >
                <Icon size={30} />
                <h3>{tp.name}</h3>
                <p>{tp.description}</p>
                <Tag variant="outlined" size="small">
                  {t('protocol.home.typeCapacity', { count: tp.defaultCapacity })}
                </Tag>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="protocol-section">
        <div className="protocol-section-head">
          <h2 className="section-title">
            <Title size="middle" color="app-pink">
              {t('protocol.home.hot')}
            </Title>
          </h2>
          <Link to="/protocol/events?open=1" className="protocol-link">
            {t('protocol.home.viewAll')}
          </Link>
        </div>
        <div className="protocol-event-grid">
          {home.hot.map((ev) => (
            <Card
              key={ev.id}
              hoverable
              className="protocol-event-card"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/protocol/events/${ev.eventNo}`)}
              onKeyDown={cardKeyDown(() => navigate(`/protocol/events/${ev.eventNo}`))}
            >
              <div className="protocol-event-card-top">
                <Tag color="app-teal" variant="soft">
                  {ev.typeName}
                </Tag>
                <StatusTag status={ev.status} />
              </div>
              <h3>{ev.title}</h3>
              <p className="muted-text">{ev.subtitle}</p>
              <div className="protocol-event-meta">
                <span>
                  <CalendarIcon size={14} /> {fmtDateTime(ev.startsAt)}
                </span>
                <span>
                  <HomeIcon size={14} /> {ev.venueName}
                </span>
              </div>
              <Progress
                percent={ev.capacity ? Math.round((ev.approvedCount / ev.capacity) * 100) : 0}
                size="small"
                infoFormat={() => `${ev.approvedCount}/${ev.capacity}`}
              />
            </Card>
          ))}
          {home.hot.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('common.empty')}</p>
            </Card>
          )}
        </div>
      </section>

      <section className="protocol-section">
        <h2 className="section-title">
          <Title size="middle" color="app-blue">
            {t('protocol.home.upcoming')}
          </Title>
        </h2>
        <div className="protocol-upcoming-list">
          {home.upcoming.map((ev) => (
            <Card
              key={ev.id}
              hoverable
              className="protocol-upcoming-row"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/protocol/events/${ev.eventNo}`)}
              onKeyDown={cardKeyDown(() => navigate(`/protocol/events/${ev.eventNo}`))}
            >
              <div className="protocol-upcoming-date">
                <strong>{fmtMonthDay(ev.startsAt)}</strong>
                <span>{fmtTime(ev.startsAt)}</span>
              </div>
              <div className="protocol-upcoming-main">
                <strong>{ev.title}</strong>
                <span className="muted-text">
                  {ev.typeName} · {ev.venueName}
                </span>
              </div>
              <div className="protocol-upcoming-side">
                <Tag color={ev.seatsLeft > 0 ? 'app-green' : 'brown'} variant="soft">
                  {ev.seatsLeft > 0 ? t('protocol.home.seatsLeft', { count: ev.seatsLeft }) : t('protocol.home.full')}
                </Tag>
                <Tag variant="outlined" size="small">
                  {t('protocol.home.deadline', { date: fmtDate(ev.registrationDeadline) })}
                </Tag>
              </div>
            </Card>
          ))}
          {home.upcoming.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('common.empty')}</p>
            </Card>
          )}
        </div>
      </section>

      <section className="protocol-section">
        <h2 className="section-title">
          <Title size="middle" color="purple">
            {t('protocol.home.services')}
          </Title>
        </h2>
        <div className="protocol-service-grid">
          {services.map((svc, i) => {
            const Icon = SERVICE_ICONS[i];
            return (
              <Card
                key={svc.key}
                hoverable
                className="protocol-service-card"
                role="button"
                tabIndex={0}
                onClick={() => navigate(svc.to)}
                onKeyDown={cardKeyDown(() => navigate(svc.to))}
              >
                <span className="protocol-service-icon">
                  <Icon size={24} />
                </span>
                <div>
                  <strong>{t(`protocol.home.service.${svc.key}`)}</strong>
                  <p className="muted-text">{t(`protocol.home.serviceHint.${svc.key}`)}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="protocol-section">
        <h2 className="section-title">
          <Title size="middle" color="app-green">
            {t('protocol.home.guide')}
          </Title>
        </h2>
        <div className="protocol-guide-grid">
          {guides.map((g) => (
            <Card
              key={g.key}
              className="protocol-guide-card"
              hoverable
              role="button"
              tabIndex={0}
              onClick={() => navigate(g.to)}
              onKeyDown={cardKeyDown(() => navigate(g.to))}
            >
              <h3>{t(`protocol.home.guide_${g.key}`)}</h3>
              <p>{t(`protocol.home.guide_${g.key}_body`)}</p>
              <span className="protocol-link">{t('protocol.home.learnMore')}</span>
            </Card>
          ))}
          <Card className="protocol-guide-card">
            <h3>{t('protocol.home.guide_rules')}</h3>
            <p>{t('protocol.home.guide_rules_body')}</p>
          </Card>
        </div>
      </section>

      <Divider type="wave-yellow" />

      <section className="protocol-section">
        <h2 className="section-title">
          <Title size="middle" color="brown">
            {t('protocol.home.faq')}
          </Title>
        </h2>
        <div className="protocol-faq">
          {faqs.map((key) => (
            <Collapse key={key} question={t(`protocol.faq.${key}.q`)} answer={t(`protocol.faq.${key}.a`)} />
          ))}
        </div>
        <Card type="dashed" className="protocol-support-card">
          <HelpCircleIcon size={20} />
          <span>{t('protocol.home.supportTip')}</span>
          <Link to="/protocol/help" className="protocol-link">
            {t('protocol.home.helpCenter')}
          </Link>
          <Link to="/protocol/messages" className="protocol-link">
            {t('protocol.nav.messages')}
          </Link>
        </Card>
      </section>

    </div>
  );
}