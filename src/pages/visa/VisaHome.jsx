// 签注申请署首页:公告、签注类型、办事指南、入口与防诈骗提示。
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Background,
  Button,
  Card,
  Collapse,
  Divider,
  Tag,
  Title,
  Typewriter,
} from 'animal-island-ui';
import {
  AirplaneIcon,
  AlertTriangleIcon,
  FileIcon,
  HelpCircleIcon,
  MapIcon,
  SearchIcon,
  SendIcon,
} from 'naive-icons';
import { api } from '../../api/client.js';
import { NOTICE_LEVEL_COLORS, fmtDateTime, toastVisaError } from './shared.jsx';

export default function VisaHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [home, setHome] = useState(null);
  const [recs, setRecs] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/visa/home')
      .then((data) => {
        if (!cancelled) setHome(data);
      })
      .catch((err) => {
        toastVisaError(t, err);
        if (!cancelled) setHome({ notices: [], types: [], reviewHoursHint: 72, unread: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // 跨署联动:文化旅游署的上线景点推荐(/tourism/recs 仅要求登录)。
  // 拉取失败或没有数据时整节隐藏,不影响签注署页面本身。
  useEffect(() => {
    let cancelled = false;
    api
      .get('/tourism/recs')
      .then((data) => {
        if (!cancelled) setRecs(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancelled) setRecs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!home) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const touristType = home.types.find((tp) => tp.code === 'TOURIST');

  return (
    <div className="visa-home">
      <Background type="sprinkles" className="visa-hero">
        <Title size="large">{t('visa.home.heroTitle')}</Title>
        <Typewriter speed={30}>
          <p className="visa-hero-sub">{t('visa.home.heroSub')}</p>
        </Typewriter>
        <div className="visa-hero-actions">
          <Button type="primary" size="large" icon={<SendIcon />} onClick={() => navigate('/visa/apply')}>
            {t('visa.home.applyEntry')}
          </Button>
          <Button type="default" size="large" icon={<FileIcon />} onClick={() => navigate('/visa/applications')}>
            {t('visa.home.progressEntry')}
          </Button>
          <Button type="dashed" size="large" icon={<SearchIcon />} onClick={() => navigate('/visa/verify')}>
            {t('visa.home.verifyEntry')}
          </Button>
        </div>
      </Background>

      <Card color="app-yellow" className="visa-scam-banner">
        <div className="visa-scam-inner">
          <AlertTriangleIcon size={22} />
          <div>
            <strong>{t('visa.home.scamTitle')}</strong>
            <p>{t('visa.home.scamBody')}</p>
          </div>
        </div>
      </Card>

      <section className="visa-section">
        <Title size="middle" color="app-teal">
          {t('visa.home.notices')}
        </Title>
        <div className="visa-notice-list">
          {home.notices.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('common.empty')}</p>
            </Card>
          )}
          {home.notices.map((n) => (
            <Card key={n.id} className="visa-notice-card">
              <div className="visa-notice-head">
                <Tag color={NOTICE_LEVEL_COLORS[n.level] || 'default'} variant="soft">
                  {t(`visa.noticeLevel.${n.level}`)}
                </Tag>
                <strong>{n.title}</strong>
                <span className="muted-text visa-notice-time">{fmtDateTime(n.createdAt)}</span>
              </div>
              <p className="visa-notice-body">{n.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="visa-section">
        <Title size="middle" color="app-orange">
          {t('visa.home.types')}
        </Title>
        <div className="visa-type-grid">
          {home.types.map((tp) => (
            <Card key={tp.code} hoverable className="visa-type-card" onClick={() => navigate(`/visa/apply/${tp.code}`)}>
              <div className="visa-type-top">
                <AirplaneIcon size={30} />
                <Tag color={tp.code === 'TOURIST' ? 'app-teal' : 'default'} variant="soft">
                  {t(`visa.typeAvail.${tp.enabled ? 'open' : 'soon'}`)}
                </Tag>
              </div>
              <h3 className="visa-type-name">{tp.name}</h3>
              <p className="visa-type-desc">{tp.description}</p>
              <div className="visa-type-meta">
                <Tag variant="outlined">{t('visa.typeMeta.stay', { days: tp.stayDays })}</Tag>
                <Tag variant="outlined">{t('visa.typeMeta.valid', { days: tp.validDays })}</Tag>
              </div>
            </Card>
          ))}
          {home.types.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('common.empty')}</p>
            </Card>
          )}
        </div>
      </section>

      {!!recs?.length && (
        <section className="visa-section">
          <div className="visa-notice-head">
            <Title size="middle" color="app-green">
              {t('visa.home.tourismTitle')}
            </Title>
            <Link to="/tourism" className="visa-link">
              {t('visa.home.tourismAll')}
            </Link>
          </div>
          <p className="muted-text">{t('visa.home.tourismSub')}</p>
          <div className="visa-type-grid">
            {recs.map((spot) => (
              <Card key={spot.id} hoverable className="visa-type-card" onClick={() => navigate('/tourism')}>
                <div className="visa-type-top">
                  <MapIcon size={30} />
                  <Tag color="app-green" variant="soft">
                    {t(`visa.tourismType.${spot.type}`)}
                  </Tag>
                </div>
                <h3 className="visa-type-name">{spot.name}</h3>
                <p className="visa-type-desc">{spot.summary || spot.description}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="visa-section">
        <Title size="middle" color="app-blue">
          {t('visa.home.guide')}
        </Title>
        <div className="visa-guide-grid">
          <Card className="visa-guide-card">
            <h4>{t('visa.home.guideCondition')}</h4>
            <p>{t('visa.home.guideConditionBody')}</p>
          </Card>
          <Card className="visa-guide-card">
            <h4>{t('visa.home.guideMaterials')}</h4>
            <p>{t('visa.home.guideMaterialsBody')}</p>
          </Card>
          <Card className="visa-guide-card">
            <h4>{t('visa.home.guideDuration', { hours: home.reviewHoursHint })}</h4>
            <p>{t('visa.home.guideDurationBody', { hours: home.reviewHoursHint })}</p>
          </Card>
          {touristType && (
            <Card className="visa-guide-card">
              <h4>{t('visa.home.guideValidity', { days: touristType.validDays })}</h4>
              <p>{t('visa.home.guideValidityBody', { days: touristType.validDays, stay: touristType.stayDays })}</p>
            </Card>
          )}
        </div>
      </section>

      <Divider type="wave-yellow" />

      <section className="visa-section">
        <Title size="middle" color="purple">
          {t('visa.home.faq')}
        </Title>
        <div className="visa-faq">
          {['reject', 'fee', 'real', 'duration', 'port'].map((key) => (
            <Collapse key={key} question={t(`visa.faq.${key}.q`)} answer={t(`visa.faq.${key}.a`)} />
          ))}
        </div>
        <Card type="dashed" className="visa-support-card">
          <HelpCircleIcon size={20} />
          <span>{t('visa.home.supportTip')}</span>
          <Link to="/visa/messages" className="visa-link">
            {t('visa.nav.messages')}
          </Link>
        </Card>
      </section>

    </div>
  );
}
