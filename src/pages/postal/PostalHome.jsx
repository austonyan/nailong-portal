// 邮政与通信署首页:最新公告、订阅入口、明信片入口与消息中心入口。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { BellIcon, InboxIcon, MailIcon, RssIcon, SendIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { NOTICE_LEVEL_COLORS, POSTCARD_STATUS_COLORS, fmtDate, fmtDateTime, toastPostError } from './shared.jsx';

const EMPTY = {
  notices: [],
  templates: [],
  recentPostcards: [],
  unread: 0,
  subscribed: false,
  dailyLimit: 10,
  usedToday: 0,
};

function excerpt(text, max = 110) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export default function PostalHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get('/postal/home'));
    } catch (err) {
      toastPostError(t, err);
      setData(EMPTY);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const home = data ?? EMPTY;

  return (
    <div className="postal-home">
      <Card pattern="app-blue" className="postal-hero">
        <h1 className="page-title">
          <Title size="large" color="app-yellow">
            {t('post.officeName')}
          </Title>
        </h1>
        <p className="postal-hero-sub">{t('post.home.tagline')}</p>
        <div className="postal-hero-actions">
          <Button type="primary" icon={<SendIcon />} onClick={() => navigate('/postal/postcards/new')}>
            {t('post.home.writeCard')}
          </Button>
          <Button icon={<InboxIcon />} onClick={() => navigate('/postal/messages')}>
            {t('post.home.openMessages')}
          </Button>
          <Button type="dashed" icon={<RssIcon />} onClick={() => navigate('/postal/subscription')}>
            {t('post.home.openSubscription')}
          </Button>
        </div>
      </Card>

      <div className="postal-stat-row">
        <Card>
          <div className="postal-stat">
            <span className="postal-stat-value">{home.unread}</span>
            <span className="postal-stat-label">{t('post.home.statUnread')}</span>
          </div>
        </Card>
        <Card>
          <div className="postal-stat">
            <span className="postal-stat-value">
              {home.subscribed ? t('post.home.subscribedOn') : t('post.home.subscribedOff')}
            </span>
            <span className="postal-stat-label">{t('post.home.statSubscription')}</span>
          </div>
        </Card>
        <Card>
          <div className="postal-stat">
            <span className="postal-stat-value">
              {home.usedToday} / {home.dailyLimit}
            </span>
            <span className="postal-stat-label">{t('post.home.statQuota')}</span>
          </div>
        </Card>
      </div>

      <div className="postal-section">
        <div className="postal-section-head">
          <h2 className="section-title">
            <Title size="middle" color="app-teal">
              {t('post.home.latestNotices')}
            </Title>
          </h2>
          <Button type="text" size="small" onClick={() => navigate('/postal/notices')}>
            {t('post.home.viewAll')}
          </Button>
        </div>
        {data === null ? (
          <Card type="dashed">
            <p className="muted-text">{t('common.loading')}</p>
          </Card>
        ) : home.notices.length === 0 ? (
          <Card type="dashed">
            <div className="postal-empty">
              <RssIcon size={30} />
              <p className="muted-text">{t('post.home.noNotices')}</p>
            </div>
          </Card>
        ) : (
          <div className="postal-notice-list">
            {home.notices.map((notice) => (
              <Card
                key={notice.id}
                hoverable
                className="postal-notice-item"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/postal/notices/${notice.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/postal/notices/${notice.id}`);
                  }
                }}
              >
                <div className="postal-notice-head">
                  <Tag color={NOTICE_LEVEL_COLORS[notice.level] || 'brown'} variant="soft">
                    {t(`post.level.${notice.level}`)}
                  </Tag>
                  <b>{notice.title}</b>
                </div>
                <p className="postal-notice-body">{excerpt(notice.body)}</p>
                <div className="postal-notice-meta">
                  <span>{notice.no}</span>
                  <span>{fmtDate(notice.publishedAt || notice.createdAt)}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {home.recentPostcards.length > 0 && (
        <div className="postal-section">
          <div className="postal-section-head">
            <h2 className="section-title">
              <Title size="middle" color="app-pink">
                {t('post.home.recentCards')}
              </Title>
            </h2>
            <Button type="text" size="small" onClick={() => navigate('/postal/postcards')}>
              {t('post.home.viewAll')}
            </Button>
          </div>
          <div className="postal-postcard-list">
            {home.recentPostcards.map((card) => (
              <Card key={card.id}>
                <div className="postal-postcard">
                  <div className="postal-postcard-head">
                    <b>{card.templateName}</b>
                    <Tag
                      color={POSTCARD_STATUS_COLORS[card.status] || 'brown'}
                      variant="soft"
                      size="small"
                    >
                      {t(`post.postcardStatus.${card.status}`)}
                    </Tag>
                  </div>
                  <p className="postal-postcard-from">
                    {t('post.postcards.fromWhom', { name: card.senderName || card.senderUsername })}
                  </p>
                  <p className="postal-blessing">{card.blessing}</p>
                  <div className="postal-postcard-foot">
                    <span>{card.no}</span>
                    <span>{fmtDateTime(card.sentAt || card.createdAt)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="postal-section">
        <h2 className="section-title">
          <Title size="middle" color="app-yellow">
            {t('post.home.cardHall')}
          </Title>
        </h2>
        <div className="postal-card-grid">
          {home.templates.map((tpl) => (
            <Card key={tpl.id} pattern={tpl.color} className="postal-card-tile" hoverable>
              <div className="postal-card-preview">
                <span className="postal-card-name">{tpl.name}</span>
                <span className="postal-card-desc">{tpl.description}</span>
              </div>
            </Card>
          ))}
        </div>
        <div className="postal-hero-actions">
          <Button type="primary" icon={<MailIcon />} onClick={() => navigate('/postal/postcards/new')}>
            {t('post.home.writeCard')}
          </Button>
          <Button type="text" icon={<BellIcon />} onClick={() => navigate('/postal/subscription')}>
            {t('post.home.openSubscription')}
          </Button>
        </div>
      </div>
    </div>
  );
}