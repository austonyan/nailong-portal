import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Divider, Tabs, Tag, Title } from 'animal-island-ui';
import { ArrowUpRightIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastApiError } from '../../components/immigration/apiError.js';
import { AnnouncementLevelTag, ImNav, StatusTag } from '../../components/immigration/shared.jsx';

// 虚构口岸平面示意 — 用装饰性色块拼出通关动线,不涉及真实地图。
function PortMap({ mapDesc }) {
  const { t } = useTranslation();
  return (
    <div className="im-port-map" role="img" aria-label={t('imm.ports.mapAria')}>
      <div className="im-map-block im-map-gate">{t('imm.ports.mapGate')}</div>
      <div className="im-map-flow">
        <div className="im-map-block im-map-hall">{t('imm.ports.mapHall')}</div>
        <div className="im-map-block im-map-lane">{t('imm.ports.mapLane')}</div>
        <div className="im-map-block im-map-plaza">{t('imm.ports.mapPlaza')}</div>
      </div>
      <div className="im-map-block im-map-garden">{t('imm.ports.mapGarden')}</div>
      <p className="muted-text">{mapDesc}</p>
    </div>
  );
}

export default function ImmigrationPortDetail() {
  const { t } = useTranslation();
  const { code } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/immigration/ports/${code}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        toastApiError(err);
        if (!cancelled) setData({ port: null, channels: [], announcements: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!data) return null;
  const { port, channels, announcements } = data;

  return (
    <div className="im-page">
      <ImNav />
      {port ? (
        <>
          <div className="page-header">
            <Title size="middle" color="app-orange">
              {port.name}
            </Title>
            <StatusTag value={port.status} i18nPrefix="imm.portStatus" />
          </div>
          <p className="muted-text">
            {port.code} · {t(`imm.portType.${port.type}`)} · {port.openHours}
          </p>

          <Tabs
            items={[
              {
                key: 'overview',
                label: t('imm.ports.tabOverview'),
                children: (
                  <div className="im-port-overview">
                    <Card>
                      <b>{t('imm.ports.notice')}</b>
                      <p>{port.notice}</p>
                    </Card>
                    <PortMap mapDesc={port.mapDesc} />
                  </div>
                ),
              },
              {
                key: 'channels',
                label: t('imm.ports.tabChannels'),
                children: (
                  <div className="im-channel-list">
                    {channels.map((c) => (
                      <Card key={c.id} className="im-channel-item">
                        <div className="im-ann-head">
                          <Tag color={c.type === 'special' ? 'purple' : 'app-teal'} variant="soft">
                            {t(`imm.channelType.${c.type}`)}
                          </Tag>
                          <b>{c.name}</b>
                          {!c.enabled && <Tag size="small">{t('imm.ports.channelClosed')}</Tag>}
                        </div>
                        <p className="im-ann-body">{c.description}</p>
                      </Card>
                    ))}
                  </div>
                ),
              },
              {
                key: 'announcements',
                label: t('imm.ports.tabAnnouncements'),
                children: (
                  <div className="im-ann-list">
                    {announcements.map((a) => (
                      <Card key={a.id} className="im-ann-item">
                        <div className="im-ann-head">
                          <AnnouncementLevelTag level={a.level} />
                          <b>{a.title}</b>
                          <span className="muted-text">{a.publishedAt?.slice(0, 10)}</span>
                        </div>
                        <p className="im-ann-body">{a.body}</p>
                      </Card>
                    ))}
                    {announcements.length === 0 && (
                      <Card type="dashed">
                        <p className="muted-text">{t('imm.home.noAnnouncements')}</p>
                      </Card>
                    )}
                  </div>
                ),
              },
            ]}
          />

          <Divider type="squiggle" />
          <div className="im-center-btn">
            <Link to="/immigration/declare">
              <Button type="primary" size="large" disabled={port.status !== 'open'} icon={<ArrowUpRightIcon />}>
                {port.status === 'open' ? t('imm.ports.startDeclare') : t('imm.ports.declareBlocked')}
              </Button>
            </Link>
          </div>
        </>
      ) : (
        <Card type="dashed">
          <p className="muted-text">{t('imm.ports.notFound')}</p>
        </Card>
      )}
    </div>
  );
}
