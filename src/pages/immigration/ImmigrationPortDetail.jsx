import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Divider, Tabs, Tag, Title } from 'animal-island-ui';
import { ArrowUpRightIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastApiError } from '../../components/immigration/apiError.js';
import { fmtDate, fmtDateTime } from '../../lib/date.js';
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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/immigration/ports/${code}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setFailed(false);
      })
      .catch((err) => {
        toastApiError(err);
        if (!cancelled) {
          setData(null);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  // 加载期间给出加载卡片,而不是 return null 的空白页。
  if (!data) {
    return (
      <div className="im-page">
        <ImNav />
        <Card type="dashed">
          <p className="muted-text">{failed ? t('common.loadFailed') : t('common.loading')}</p>
        </Card>
      </div>
    );
  }

  const { port, channels, announcements, eventHints = [], courtesies } = data;

  return (
    <div className="im-page">
      <ImNav />
      {port ? (
        <>
          <div className="page-header">
            <h1 className="page-title">
              <Title size="middle" color="app-orange">
                {port.name}
              </Title>
            </h1>
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
                    {eventHints.length > 0 && (
                      <Card pattern="app-teal">
                        <b>{t('imm.ports.eventHints')}</b>
                        <p className="muted-text">{t('imm.ports.eventHintsTip')}</p>
                        <ul className="im-ann-list">
                          {eventHints.map((ev) => (
                            <li key={ev.eventNo} className="muted-text">
                              {fmtDateTime(ev.startsAt)} · {ev.title}
                              {ev.venueName ? ` · ${ev.venueName}` : ''}
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                    {courtesies?.eligible && (
                      <Card pattern="purple">
                        <b>{t('imm.ports.courtesyTitle')}</b>
                        <p className="muted-text">{t('imm.ports.courtesyTip', { no: courtesies.identityNo })}</p>
                        <div className="table-actions">
                          {(courtesies.items || []).map((c) => (
                            <Tag key={c.code} color="purple" variant="soft" size="small">
                              {c.name}
                            </Tag>
                          ))}
                        </div>
                      </Card>
                    )}
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
                          {!c.enabled && <Tag size="small" color="brown" variant="soft">{t('imm.ports.channelClosed')}</Tag>}
                        </div>
                        <p className="im-ann-body">{c.description}</p>
                      </Card>
                    ))}
                    {channels.length === 0 && (
                      <Card type="dashed">
                        <p className="muted-text">{t('imm.ports.channelsEmpty')}</p>
                      </Card>
                    )}
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
                          <span className="muted-text">{fmtDate(a.publishedAt)}</span>
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
