// 居民权益:类型权益/义务、专属公告与跨署联动快捷通道。
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { CompassIcon, FileIcon, MailIcon, StarIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { fmtDate, toastResError } from './shared.jsx';

const CHANNELS = [
  { key: 'visaFast', icon: CompassIcon },
  { key: 'immigrationLane', icon: MailIcon },
  { key: 'activityPriority', icon: StarIcon },
  { key: 'identityCertificate', icon: FileIcon },
];

export default function ResidentBenefits() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    api
      .get('/resident/benefits')
      .then(setData)
      .catch((err) => {
        toastResError(t, err);
        setData({ channels: {}, announcements: [] });
      });
  }, [t]);

  if (!data) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  return (
    <div className="res-benefits-page">
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-green">
            {t('res.benefits.title')}
          </Title>
        </h1>
        {data.typeName && (
          <Tag color="app-green" variant="soft">
            {data.typeName}
          </Tag>
        )}
      </div>

      {data.card ? (
        <>
          <Card className="res-info-card">
            <h2>{t('res.benefits.myBenefits', { type: data.typeName || t('common.unknown') })}</h2>
            <p>{data.benefits || t('res.type.benefitsPlaceholder')}</p>
          </Card>
          <Card className="res-info-card">
            <h2>{t('res.type.duties')}</h2>
            <p>{data.duties || t('res.type.dutiesPlaceholder')}</p>
          </Card>
        </>
      ) : (
        <Card type="dashed">
          <p className="muted-text">{t('res.benefits.needResidency')}</p>
        </Card>
      )}

      <section>
        <h2 className="section-title">
          <Title size="middle">{t('res.benefits.channels')}</Title>
        </h2>
        <p className="muted-text">{t('res.benefits.channelsTip')}</p>
        <div className="res-channel-grid">
          {CHANNELS.map(({ key, icon: Icon }) => {
            const open = !!data.channels?.[key];
            const href = data.links?.[key];
            return (
              <Card key={key} className="res-channel-card" pattern="app-teal">
                <Icon size={28} />
                <b>{t(`res.channel.${key}.name`)}</b>
                <p className="muted-text">{t(`res.channel.${key}.desc`)}</p>
                <div className="res-channel-foot">
                  <Tag color={open ? 'app-green' : 'warm-peach-pink'} variant="soft" size="small">
                    {open ? t('res.channelState.open') : t('res.channelState.reserved')}
                  </Tag>
                  {open && href && (
                    <Link to={href}>
                      <Button type="primary" size="small">
                        {t('res.benefits.openChannel')}
                      </Button>
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="section-title">
          <Title size="middle" color="app-orange">
            {t('res.benefits.announcements')}
          </Title>
        </h2>
        <div className="res-ann-list">
          {data.announcements.map((n) => (
            <Card key={n.id} className="res-ann-item">
              <div className="res-ann-head">
                <b>{n.title}</b>
                <span className="muted-text">{fmtDate(n.createdAt)}</span>
              </div>
              <p className="res-ann-body">{n.body}</p>
            </Card>
          ))}
          {data.announcements.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('res.home.noAnnouncements')}</p>
            </Card>
          )}
        </div>
      </section>

      <Card pattern="app-yellow" className="res-fraud-card">
        <b>{t('res.benefits.achievements')}</b>
        <p>{t('res.benefits.achievementsTip')}</p>
      </Card>
    </div>
  );
}
