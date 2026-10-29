// 景点详情:开放状态、打卡点与当日打卡(每用户每景点每日 1 次)。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Divider, Input, Tag, Title } from 'animal-island-ui';
import { ArrowLeftIcon, CheckCircleIcon, LocationIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastInfo, toastSuccess } from '../../components/toast.js';
import {
  ATTRACTION_TYPE_COLORS,
  OPEN_STATE_COLORS,
  AttractionIcon,
  splitLines,
  toastTourError,
} from './shared.jsx';

export default function TourismAttractionDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [attraction, setAttraction] = useState(null);
  const [missing, setMissing] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/tourism/attractions/${id}`);
      setAttraction(data.attraction);
    } catch (err) {
      toastTourError(t, err);
      setMissing(true);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const checkIn = async () => {
    setBusy(true);
    try {
      const data = await api.post(`/tourism/attractions/${id}/checkin`, { note: note.trim() });
      setNote('');
      toastSuccess(t('tour.checkin.success', { name: attraction?.name ?? '' }));
      for (const badge of data.newBadges ?? []) {
        toastInfo(t('tour.checkin.newBadge', { name: badge.name }));
      }
      await load();
    } catch (err) {
      toastTourError(t, err);
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <div className="center-screen">
        <h2>{t('tour.attractions.notFound')}</h2>
        <Button type="primary" onClick={() => navigate('/tourism/attractions')}>
          {t('tour.attractions.backToList')}
        </Button>
      </div>
    );
  }

  if (!attraction) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const points = splitLines(attraction.checkinPoints);
  const closed = attraction.openState === 'closed';

  return (
    <div className="tour-detail">
      <div className="tour-section-head">
        <Button size="small" icon={<ArrowLeftIcon />} onClick={() => navigate('/tourism/attractions')}>
          {t('tour.attractions.backToList')}
        </Button>
        <Tag size="small" color={OPEN_STATE_COLORS[attraction.openState] || 'brown'} variant="soft">
          {t(`tour.openState.${attraction.openState}`)}
        </Tag>
      </div>

      <Card>
        <div className="tour-detail-head">
          <span className="tour-card-icon">
            <AttractionIcon type={attraction.type} size={30} />
          </span>
          <div>
            <h1 className="page-title tour-detail-title">{attraction.name}</h1>
            <div className="tour-card-meta">
              <Tag size="small" color={ATTRACTION_TYPE_COLORS[attraction.type] || 'brown'} variant="soft">
                {t(`tour.type.${attraction.type}`)}
              </Tag>
              <Tag size="small" variant="soft">
                {attraction.no}
              </Tag>
            </div>
          </div>
        </div>
        <Divider type="thin" />
        <p className="tour-detail-text">{attraction.summary}</p>
        <p className="tour-detail-text">{attraction.description}</p>
      </Card>

      <Card>
        <Title size="small" color="app-teal">
          {t('tour.attractions.points')}
        </Title>
        <div className="tour-points">
          {points.map((point) => (
            <Tag key={point} color="app-teal" variant="outlined">
              <LocationIcon size={12} /> {point}
            </Tag>
          ))}
          {points.length === 0 && <span className="muted-text">{t('tour.attractions.noPoints')}</span>}
        </div>
      </Card>

      <Card>
        <b>{t('tour.checkin.title')}</b>
        <p className="tour-card-summary">{t('tour.checkin.rule')}</p>
        {attraction.myCheckinToday ? (
          <div className="tour-checkin-row">
            <Tag color="app-green" variant="soft">
              <CheckCircleIcon size={12} /> {t('tour.checkin.doneToday')}
            </Tag>
            <span className="muted-text">{t('tour.checkin.comeBackTomorrow')}</span>
          </div>
        ) : (
          <div className="tour-checkin-box">
            <Input
              size="large"
              value={note}
              maxLength={200}
              allowClear
              placeholder={t('tour.checkin.notePlaceholder')}
              onChange={(e) => setNote(e.target.value)}
              onClear={() => setNote('')}
            />
            <div className="tour-checkin-row">
              <Button
                type="primary"
                loading={busy}
                disabled={busy || closed}
                onClick={checkIn}
              >
                {t('tour.checkin.button')}
              </Button>
              {closed && <span className="muted-text">{t('tour.checkin.closed')}</span>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}