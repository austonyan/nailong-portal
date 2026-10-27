// 文化旅游署首页:景点推荐、节庆公告、打卡任务入口与我的旅游速览。
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Background, Button, Card, Divider, Tag, Title, Typewriter } from 'animal-island-ui';
import { BookIcon, ClipboardIcon, MapIcon, TrophyIcon, UserIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import {
  ARTICLE_TYPE_COLORS,
  ATTRACTION_TYPE_COLORS,
  OPEN_STATE_COLORS,
  AttractionIcon,
  fmtDate,
  toastTourError,
} from './shared.jsx';

const QUICK_ENTRIES = [
  { to: '/tourism/attractions', key: 'attractions', icon: MapIcon, color: 'app-orange' },
  { to: '/tourism/articles', key: 'articles', icon: BookIcon, color: 'app-teal' },
  { to: '/tourism/collection', key: 'collection', icon: ClipboardIcon, color: 'app-yellow' },
  { to: '/tourism/badges', key: 'badges', icon: TrophyIcon, color: 'app-green' },
  { to: '/tourism/my', key: 'my', icon: UserIcon, color: 'app-pink' },
];

export default function TourismHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [home, setHome] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/tourism/home')
      .then((data) => {
        if (!cancelled) setHome(data);
      })
      .catch((err) => {
        toastTourError(t, err);
        if (!cancelled) {
          setFailed(true);
          setHome({ recommendations: [], festivals: [], stats: {}, rules: {} });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const stats = home?.stats ?? {};
  const rules = home?.rules ?? {};

  return (
    <div className="tour-page">
      <Background type="sprinkles" className="tour-hero">
        <Title size="large" color="app-pink">
          {t('tour.home.hero')}
        </Title>
        <Typewriter speed={35}>
          <p className="tour-hero-sub">{t('tour.home.tagline')}</p>
        </Typewriter>
      </Background>

      <section className="tour-stat-row">
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.home.statCheckins')}</span>
          <span className="tour-stat-number">{home ? stats.checkins ?? 0 : '…'}</span>
        </Card>
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.home.statBadges')}</span>
          <span className="tour-stat-number">{home ? stats.badges ?? 0 : '…'}</span>
        </Card>
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.home.statStamps')}</span>
          <span className="tour-stat-number">{home ? stats.stamps ?? 0 : '…'}</span>
        </Card>
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.home.statToday')}</span>
          <span className="tour-stat-number">{home ? stats.todayCheckins ?? 0 : '…'}</span>
        </Card>
      </section>

      <section className="tour-section">
        <div className="tour-section-head">
          <Title size="middle" color="app-orange">
            {t('tour.home.recommendations')}
          </Title>
          <Button size="small" onClick={() => navigate('/tourism/attractions')}>
            {t('tour.home.viewAll')}
          </Button>
        </div>
        <div className="tour-card-grid">
          {(home?.recommendations ?? []).map((item) => (
            <Card key={item.id} hoverable className="tour-attraction-card" onClick={() => navigate(`/tourism/attractions/${item.id}`)}>
              <div className="tour-card-head">
                <span className="tour-card-icon">
                  <AttractionIcon type={item.type} />
                </span>
                <div>
                  <h3 className="tour-card-title">{item.name}</h3>
                  <div className="tour-card-meta">
                    <Tag size="small" color={ATTRACTION_TYPE_COLORS[item.type] || 'default'} variant="soft">
                      {t(`tour.type.${item.type}`)}
                    </Tag>
                    <Tag size="small" color={OPEN_STATE_COLORS[item.openState] || 'default'} variant="soft">
                      {t(`tour.openState.${item.openState}`)}
                    </Tag>
                  </div>
                </div>
              </div>
              <p className="tour-card-summary">{item.summary}</p>
              <p className="tour-meta-line">{item.no}</p>
            </Card>
          ))}
          {home && home.recommendations.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{failed ? t('tour.error.loadFailed') : t('tour.home.noRecommendations')}</p>
            </Card>
          )}
        </div>
      </section>

      <section className="tour-section">
        <div className="tour-section-head">
          <Title size="middle" color="app-teal">
            {t('tour.home.quickEntries')}
          </Title>
        </div>
        <div className="tour-quick-grid">
          {QUICK_ENTRIES.map((entry) => {
            const Icon = entry.icon;
            return (
              <Card key={entry.key} color={entry.color} hoverable className="tour-quick-card" onClick={() => navigate(entry.to)}>
                <Icon size={30} />
                <h3>{t(`tour.nav.${entry.key}`)}</h3>
              </Card>
            );
          })}
        </div>
      </section>

      <Divider type="wave-yellow" />

      <section className="tour-section">
        <div className="tour-section-head">
          <Title size="middle" color="app-yellow">
            {t('tour.home.festivals')}
          </Title>
          <Button size="small" onClick={() => navigate('/tourism/articles')}>
            {t('tour.home.viewAllArticles')}
          </Button>
        </div>
        <div className="tour-ann-list">
          {(home?.festivals ?? []).map((article) => (
            <Card
              key={article.id}
              hoverable
              className="tour-article-card"
              onClick={() => navigate(`/tourism/articles/${article.id}`)}
            >
              <div className="tour-ann-head">
                <Tag size="small" color={ARTICLE_TYPE_COLORS[article.type] || 'default'} variant="soft">
                  {t(`tour.articleType.${article.type}`)}
                </Tag>
                <b>{article.title}</b>
                <span className="muted-text">{fmtDate(article.publishedAt)}</span>
              </div>
              <p className="tour-ann-body">{article.summary}</p>
            </Card>
          ))}
          {home && home.festivals.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('tour.home.noFestivals')}</p>
            </Card>
          )}
        </div>
      </section>

      <section className="tour-section">
        <Card>
          <b>{t('tour.home.rulesTitle')}</b>
          <p className="tour-card-summary">
            {t('tour.home.rulePerAttraction')}
          </p>
          <p className="tour-card-summary">
            {t('tour.home.ruleDaily', { limit: rules.dailyLimit ?? 10 })}
          </p>
        </Card>
      </section>

      <div className="tour-center-btn">
        <Button type="primary" size="large" onClick={() => navigate('/tourism/attractions')}>
          {t('tour.home.startCheckin')}
        </Button>
      </div>
    </div>
  );
}