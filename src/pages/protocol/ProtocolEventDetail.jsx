// 活动详情:介绍、日程、虚构地点示意图、报名条件、所需材料、公告与变更通知。
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Divider, Progress, Tag, Title } from 'animal-island-ui';
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  FileIcon,
  HomeIcon,
  MailIcon,
  SearchIcon,
  SendIcon,
} from 'naive-icons';
import { api } from '../../api/client.js';
import { StatusTag, fmtDateTime, toastProtocolError } from './shared.jsx';

export default function ProtocolEventDetail() {
  const { t } = useTranslation();
  const { no } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/protocol/events/${encodeURIComponent(no)}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => {
        toastProtocolError(t, e);
        if (!cancelled) setErr(true);
      });
    return () => {
      cancelled = true;
    };
  }, [no, t]);

  if (err) {
    return (
      <Card type="dashed">
        <p>{t('protocol.eventDetail.notFound')}</p>
        <Button onClick={() => navigate('/protocol/events')}>{t('protocol.action.back')}</Button>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const { event, notices, materialsRequired, myRegistration, myInvitation, myPass } = data;
  const full = event.seatsLeft <= 0;
  const canApply = event.status === 'registration' && !myRegistration && (!full || event.waitlistEnabled);
  const applyDisabledTip = full
    ? event.waitlistEnabled
      ? t('protocol.eventDetail.waitlistTip')
      : t('protocol.eventDetail.fullTip')
    : event.status !== 'registration'
      ? t('protocol.eventDetail.closedTip')
      : '';

  return (
    <div className="protocol-event-detail">
      <Card className="protocol-detail-hero">
        <div className="protocol-detail-hero-main">
          <div className="protocol-event-card-top">
            <Tag color="app-teal" variant="solid">{event.typeName}</Tag>
            <StatusTag status={event.status} />
            {event.residentOnly && <Tag color="app-green" variant="outlined">{t('protocol.eventDetail.residentOnly')}</Tag>}
            {event.diplomaticOnly && <Tag color="purple" variant="outlined">{t('protocol.eventDetail.diplomaticOnly')}</Tag>}
          </div>
          <Title size="large">{event.title}</Title>
          <p className="protocol-detail-sub">{event.subtitle}</p>
          <div className="protocol-detail-meta">
            <span>
              <CalendarIcon size={16} /> {fmtDateTime(event.startsAt)} ~ {fmtDateTime(event.endsAt)}
            </span>
            <span>
              <HomeIcon size={16} /> {event.venueName}
            </span>
            <span>
              <ClockIcon size={16} /> {t('protocol.eventDetail.deadlineLabel')} {fmtDateTime(event.registrationDeadline)}
            </span>
          </div>
          <Progress
            percent={event.capacity ? Math.round((event.approvedCount / event.capacity) * 100) : 0}
            infoFormat={() => t('protocol.events.capacityInfo', { used: event.approvedCount, total: event.capacity })}
          />
          <div className="protocol-detail-actions">
            {myRegistration ? (
              <Button type="primary" icon={<CheckCircleIcon />} onClick={() => navigate(`/protocol/registrations/${myRegistration.id}`)}>
                {t('protocol.eventDetail.myRegistration', { status: t(`protocol.status.${myRegistration.status}`) })}
              </Button>
            ) : (
              <Button
                type="primary"
                size="large"
                icon={<SendIcon />}
                disabled={!canApply}
                onClick={() => navigate(`/protocol/events/${event.eventNo}/apply`)}
              >
                {full && event.waitlistEnabled ? t('protocol.eventDetail.joinWaitlist') : t('protocol.action.applyNow')}
              </Button>
            )}
            <Button type="default" size="large" icon={<MailIcon />} onClick={() => navigate('/protocol/invitations')}>
              {t('protocol.eventDetail.inviteEntry')}
            </Button>
            <Button type="dashed" size="large" icon={<SearchIcon />} onClick={() => navigate(`/protocol/verify?no=${encodeURIComponent(myPass?.passNo || '')}`)}>
              {t('protocol.action.verify')}
            </Button>
          </div>
          {applyDisabledTip && <p className="muted-text protocol-detail-tip">{applyDisabledTip}</p>}
          {myInvitation && (
            <div className="protocol-status-note">
              <MailIcon size={16} />
              <span>{t('protocol.eventDetail.hasInvitation', { no: myInvitation.inviteNo })}</span>
              <Button type="text" size="small" onClick={() => navigate('/protocol/invitations')}>
                {t('protocol.action.view')}
              </Button>
            </div>
          )}
        </div>
        <div className="protocol-venue-map" aria-label={t('protocol.eventDetail.venue')}>
          <div className="protocol-venue-grid" />
          <span className="protocol-venue-pin">
            <HomeIcon size={26} />
          </span>
          <div className="protocol-venue-label">
            <strong>{event.venueName}</strong>
            <span>{event.venueNote}</span>
          </div>
          <em>{t('protocol.eventDetail.venueMock')}</em>
        </div>
      </Card>

      <div className="protocol-detail-columns">
        <section className="protocol-section">
          <Title size="middle" color="app-blue">{t('protocol.eventDetail.intro')}</Title>
          <Card>
            <p className="protocol-preline">{event.description}</p>
          </Card>
        </section>

        <section className="protocol-section">
          <Title size="middle" color="app-orange">{t('protocol.eventDetail.schedule')}</Title>
          <Card>
            {event.schedule.length === 0 && <p className="muted-text">{t('common.empty')}</p>}
            <ul className="protocol-schedule">
              {event.schedule.map((row, i) => (
                <li key={`${row.time}-${i}`}>
                  <span className="protocol-schedule-time">{row.time}</span>
                  <span>{row.title}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section className="protocol-section">
          <Title size="middle" color="app-green">{t('protocol.eventDetail.conditions')}</Title>
          <Card>
            <p className="protocol-preline">{event.conditions || t('protocol.eventDetail.noConditions')}</p>
          </Card>
        </section>

        <section className="protocol-section">
          <Title size="middle" color="purple">{t('protocol.eventDetail.materials')}</Title>
          <Card>
            {materialsRequired.length === 0 && <p className="muted-text">{t('protocol.eventDetail.noMaterials')}</p>}
            <ul className="protocol-material-req">
              {materialsRequired.map((m) => (
                <li key={`${m.kind}-${m.required ? 1 : 0}`}>
                  <FileIcon size={16} />
                  <span>{t(`protocol.materialKind.${m.kind}`, { defaultValue: t('common.unknown') })}</span>
                  <Tag color={m.required ? 'app-orange' : 'default'} variant="soft" size="small">
                    {m.required ? t('protocol.common.required') : t('protocol.common.optional')}
                  </Tag>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>

      <Divider type="squiggle" />

      <section className="protocol-section">
        <Title size="middle" color="app-yellow">{t('protocol.eventDetail.notices')}</Title>
        <div className="protocol-notice-list">
          {notices.length === 0 && <Card type="dashed"><p className="muted-text">{t('common.empty')}</p></Card>}
          {notices.map((n) => (
            <Card key={n.id} className="protocol-notice-card">
              <div className="protocol-notice-head">
                <Tag color={n.level === 'change' ? 'app-orange' : n.level === 'cancel' ? 'app-red' : 'app-blue'} variant="soft">
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

      <Card color="app-yellow" className="protocol-scam-banner">
        <div className="protocol-scam-inner">
          <AlertTriangleIcon size={22} />
          <div>
            <strong>{t('protocol.scamTitle')}</strong>
            <p>{event.notice || t('protocol.scamBody')}</p>
          </div>
        </div>
      </Card>

    </div>
  );
}