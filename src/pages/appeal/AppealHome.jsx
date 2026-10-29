// 申诉与监察署首页:署内公告、服务目录、办事指南与快速入口。
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Background, Button, Card, Collapse, Divider, Tag, Title, Typewriter } from 'animal-island-ui';
import {
  AlertTriangleIcon,
  FileIcon,
  FolderIcon,
  HelpCircleIcon,
  InboxIcon,
  MailIcon,
  SearchIcon,
  SendIcon,
  ShieldIcon,
} from 'naive-icons';
import { api } from '../../api/client.js';
import { NOTICE_LEVEL_COLORS, activateByKey, fmtDateTime, toastAppealError } from './shared.jsx';

export default function AppealHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [home, setHome] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/appeal/home')
      .then((data) => {
        if (!cancelled) setHome(data);
      })
      .catch((err) => {
        toastAppealError(t, err);
        if (!cancelled) setHome({ notices: [], bizTypes: [], counts: {}, hints: {} });
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
    { key: 'apply', icon: <SendIcon size={26} />, color: 'app-yellow', onClick: () => navigate('/appeal/apply') },
    { key: 'my', icon: <FolderIcon size={26} />, color: 'app-blue', onClick: () => navigate('/appeal/my') },
    { key: 'review', icon: <FileIcon size={26} />, color: 'app-green', onClick: () => navigate('/appeal/reviews') },
    { key: 'complaint', icon: <MailIcon size={26} />, color: 'app-pink', onClick: () => navigate('/appeal/complaints') },
    { key: 'ticket', icon: <InboxIcon size={26} />, color: 'app-teal', onClick: () => navigate('/appeal/tickets') },
    { key: 'publicity', icon: <ShieldIcon size={26} />, color: 'purple', onClick: () => navigate('/appeal/publicity') },
  ];

  return (
    <div className="appeal-home">
      <Background type="sprinkles" className="appeal-hero">
        <h1 className="page-title">
          <Title size="large">{t('appeal.home.heroTitle')}</Title>
        </h1>
        <Typewriter speed={30}>
          <p className="appeal-hero-sub">{t('appeal.home.heroSub')}</p>
        </Typewriter>
        <div className="appeal-hero-actions">
          <Button type="primary" size="large" icon={<SendIcon />} onClick={() => navigate('/appeal/apply')}>
            {t('appeal.home.entryApply')}
          </Button>
          <Button type="default" size="large" icon={<FolderIcon />} onClick={() => navigate('/appeal/my')}>
            {t('appeal.home.entryMy')}
          </Button>
          <Button type="dashed" size="large" icon={<SearchIcon />} onClick={() => navigate('/appeal/verify')}>
            {t('appeal.home.entryVerify')}
          </Button>
        </div>
        <p className="muted-text appeal-hero-counts">
          {t('appeal.home.openAppeals', { count: home.counts.appealsOpen || 0 })} ·{' '}
          {t('appeal.home.validDecisions', { count: home.counts.decisions || 0 })} ·{' '}
          {t('appeal.home.unread', { count: home.counts.unread || 0 })}
        </p>
      </Background>

      <Card pattern="app-yellow" className="appeal-scam-banner">
        <div className="appeal-scam-inner">
          <AlertTriangleIcon size={22} />
          <div>
            <strong>{t('appeal.home.scamTitle')}</strong>
            <p>{t('appeal.home.scamBody')}</p>
          </div>
        </div>
      </Card>

      <section className="appeal-section">
        <h2 className="section-title">
          <Title size="middle" color="app-teal">
            {t('appeal.home.services')}
          </Title>
        </h2>
        <div className="appeal-service-grid">
          {services.map((s) => (
            <Card
              key={s.key}
              hoverable
              className="appeal-service-card"
              role="button"
              tabIndex={0}
              onClick={s.onClick}
              onKeyDown={(e) => activateByKey(e, s.onClick)}
            >
              <span className={`appeal-service-icon ${s.color}`}>
                {s.icon}
              </span>
              <h3>{t(`appeal.home.service.${s.key}`)}</h3>
              <p className="muted-text">{t(`appeal.home.serviceDesc.${s.key}`)}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="appeal-section">
        <h2 className="section-title">
          <Title size="middle" color="app-orange">
            {t('appeal.home.notices')}
          </Title>
        </h2>
        <div className="appeal-notice-list">
          {home.notices.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('common.empty')}</p>
            </Card>
          )}
          {home.notices.map((n) => (
            <Card key={n.id} className="appeal-notice-card">
              <div className="appeal-notice-head">
                <Tag color={NOTICE_LEVEL_COLORS[n.level] || 'brown'} variant="soft">
                  {t(`appeal.noticeLevel.${n.level}`)}
                </Tag>
                <strong>{n.title}</strong>
                <span className="muted-text appeal-notice-time">{fmtDateTime(n.createdAt)}</span>
              </div>
              <p className="appeal-notice-body">{n.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="appeal-section">
        <h2 className="section-title">
          <Title size="middle" color="app-blue">
            {t('appeal.home.guide')}
          </Title>
        </h2>
        <div className="appeal-guide-grid">
          <Card className="appeal-guide-card">
            <h3>{t('appeal.home.guideScope')}</h3>
            <p>{t('appeal.home.guideScopeBody')}</p>
          </Card>
          <Card className="appeal-guide-card">
            <h3>{t('appeal.home.guideMaterials')}</h3>
            <p>{t('appeal.home.guideMaterialsBody')}</p>
          </Card>
          <Card className="appeal-guide-card">
            <h3>{t('appeal.home.guideSla', { accept: home.hints.acceptSlaHours, resolve: home.hints.resolveSlaHours })}</h3>
            <p>{t('appeal.home.guideSlaBody', { accept: home.hints.acceptSlaHours, resolve: home.hints.resolveSlaHours })}</p>
          </Card>
          <Card className="appeal-guide-card">
            <h3>{t('appeal.home.guideReview', { days: home.hints.reviewDays })}</h3>
            <p>{t('appeal.home.guideReviewBody', { days: home.hints.reviewDays })}</p>
          </Card>
        </div>
        <div className="appeal-guide-actions">
          <Button onClick={() => navigate('/appeal/guide')}>{t('appeal.home.guideMore')}</Button>
        </div>
      </section>

      <Divider type="wave-yellow" />

      <section className="appeal-section">
        <h2 className="section-title">
          <Title size="middle" color="purple">
            {t('appeal.home.faq')}
          </Title>
        </h2>
        <div className="appeal-faq">
          {['duration', 'effect', 'fee', 'review', 'anonymous'].map((key) => (
            <Collapse key={key} question={t(`appeal.faq.${key}.q`)} answer={t(`appeal.faq.${key}.a`)} />
          ))}
        </div>
        <Card type="dashed" className="appeal-support-card">
          <HelpCircleIcon size={20} />
          <span>{t('appeal.home.supportTip')}</span>
          <Button type="text" onClick={() => navigate('/appeal/tickets')}>
            {t('appeal.nav.tickets')}
          </Button>
        </Card>
      </section>

    </div>
  );
}
