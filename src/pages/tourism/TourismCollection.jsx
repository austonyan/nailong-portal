// 收集册:我的打卡记录 + 入境纪念章(读取入境署通关记录,只读展示)。
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Table, Tag, Title } from 'animal-island-ui';
import { api } from '../../api/client.js';
import { StampIcon, fmtDateTime, toastTourError } from './shared.jsx';

const STAMP_STATUS_COLORS = {
  entered: 'app-teal',
  exited: 'app-blue',
  invalid: 'app-red',
};

export default function TourismCollection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/tourism/collection')
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        toastTourError(t, err);
        if (!cancelled) setData({ checkins: [], stamps: [], counts: { checkins: 0, visited: 0, stamps: 0 } });
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const counts = data?.counts ?? { checkins: 0, visited: 0, stamps: 0 };

  const columns = [
    { title: t('tour.collection.checkinNo'), dataIndex: 'no', width: 190 },
    { title: t('tour.collection.attraction'), dataIndex: 'attractionName' },
    { title: t('tour.collection.date'), dataIndex: 'checkinDate', width: 110 },
    { title: t('tour.collection.note'), dataIndex: 'note', render: (v) => v || '-' },
    { title: t('tour.collection.time'), dataIndex: 'createdAt', width: 150, render: fmtDateTime },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-yellow">
            {t('tour.collection.title')}
          </Title>
        </h1>
        <Button size="small" onClick={() => navigate('/tourism/attractions')}>
          {t('tour.collection.moreCheckins')}
        </Button>
      </div>

      <div className="tour-stat-row">
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.collection.statCheckins')}</span>
          <span className="tour-stat-number">{counts.checkins}</span>
        </Card>
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.collection.statVisited')}</span>
          <span className="tour-stat-number">{counts.visited}</span>
        </Card>
        <Card className="tour-stat-card">
          <span className="tour-stat-label">{t('tour.collection.statStamps')}</span>
          <span className="tour-stat-number">{counts.stamps}</span>
        </Card>
      </div>

      <section className="tour-section">
        <Title size="small" color="app-teal">
          {t('tour.collection.stampsTitle')}
        </Title>
        <p className="muted-text">{t('tour.collection.stampsHint')}</p>
        <div className="tour-stamp-grid">
          {(data?.stamps ?? []).map((stamp) => (
            <Card key={stamp.no} className="tour-stamp-card">
              <span className="tour-stamp-emblem">
                <StampIcon style={stamp.stampStyle} />
              </span>
              <div>
                <div className="tour-stamp-name">{stamp.no}</div>
                <div className="tour-meta-line">
                  {stamp.portName || t('tour.collection.unknownPort')} · {stamp.entryDate}
                </div>
                <div className="tour-card-meta">
                  <Tag size="small" color="app-teal" variant="soft">
                    {t(`tour.stamp.style.${stamp.stampStyle}`)}
                  </Tag>
                  <Tag size="small" color={STAMP_STATUS_COLORS[stamp.status] || 'brown'} variant="soft">
                    {t(`tour.stamp.status.${stamp.status}`)}
                  </Tag>
                </div>
              </div>
            </Card>
          ))}
          {data && data.stamps.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('tour.collection.noStamps')}</p>
              <Button size="small" onClick={() => navigate('/immigration')}>
                {t('tour.collection.goImmigration')}
              </Button>
            </Card>
          )}
        </div>
      </section>

      <section className="tour-section">
        <Title size="small" color="app-orange">
          {t('tour.collection.checkinsTitle')}
        </Title>
        <Card>
          <Table
            className="table-fit"
            columns={columns}
            dataSource={data?.checkins ?? []}
            loading={data === null}
            rowKey="id"
            pagination={false}
            emptyText={t('tour.collection.noCheckins')}
          />
        </Card>
      </section>

      <p className="muted-text tour-section">{t('tour.collection.footnote')}</p>
    </div>
  );
}