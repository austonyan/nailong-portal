// 使领馆/代表处展示: 代表处列表 + 详情(简介/联系方式/服务事项/公告)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Drawer, Tag, Title } from 'animal-island-ui';
import { HomeIcon, MapIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { DipNav, DipLevelTag, fmtDateTime, toastDipError } from '../../components/dip/shared.jsx';

export default function DipOffices() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [openCode, setOpenCode] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    api
      .get('/dip/offices')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastDipError(t, err);
        setItems([]);
      });
  }, [t]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!openCode) return;
    setDetail(null);
    api
      .get(`/dip/offices/${openCode}`)
      .then((data) => setDetail(data))
      .catch((err) => toastDipError(t, err));
  }, [openCode, t]);

  return (
    <div className="dip-page">
      <DipNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="purple">{t('dip.office.pageTitle')}</Title>
        </h1>
      </div>

      <div className="dip-office-grid">
        {(items ?? []).map((o) => (
          <Card
            key={o.code}
            hoverable
            className="dip-office-card"
            role="button"
            tabIndex={0}
            onClick={() => setOpenCode(o.code)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpenCode(o.code);
              }
            }}
          >
            <div className="dip-office-head">
              <HomeIcon size={22} />
              <b>{o.name}</b>
              <StatusInline status={o.status} />
            </div>
            <p className="muted-text"><MapIcon size={13} /> {o.location}</p>
            <p className="muted-text">{o.openHours}</p>
            <p>{o.intro}</p>
          </Card>
        ))}
        {(items ?? []).length === 0 && <p className="muted-text">{t('common.empty')}</p>}
      </div>

      <Drawer maskClosable={false} open={openCode !== null} title={detail?.office?.name ?? t('dip.office.detailTitle')} onClose={() => setOpenCode(null)} width={520}>
        {!detail ? (
          <p className="muted-text">{t('common.loading')}</p>
        ) : (
          <div className="dip-detail">
            <div className="dip-detail-head">
              <Tag color="app-blue" variant="soft">{detail.office.code}</Tag>
              <StatusInline status={detail.office.status} />
            </div>
            <Card>
              <p className="dip-info-row"><span className="dip-info-label">{t('dip.office.location')}</span><span>{detail.office.location}</span></p>
              <p className="dip-info-row"><span className="dip-info-label">{t('dip.office.hours')}</span><span>{detail.office.openHours}</span></p>
              <p className="dip-info-row"><span className="dip-info-label">{t('dip.office.intro')}</span><span>{detail.office.intro}</span></p>
              <p className="dip-info-row"><span className="dip-info-label">{t('dip.office.contact')}</span><span>{detail.office.contact}</span></p>
              <p className="dip-info-row"><span className="dip-info-label">{t('dip.office.services')}</span><span>{detail.office.services}</span></p>
            </Card>
            <Card>
              <b>{t('dip.office.notices')}</b>
              {(detail.notices ?? []).map((n) => (
                <div key={n.id} className="dip-notice-card dip-office-notice">
                  <div className="dip-notice-head">
                    <DipLevelTag level={n.level} />
                    <b>{n.title}</b>
                    <span className="dip-notice-time muted-text">{fmtDateTime(n.publishedAt)}</span>
                  </div>
                  <p className="dip-notice-body">{n.body}</p>
                </div>
              ))}
              {(detail.notices ?? []).length === 0 && <p className="muted-text">{t('common.empty')}</p>}
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function StatusInline({ status }) {
  const { t } = useTranslation();
  const colors = { open: 'app-green', closed: 'brown', maintenance: 'warm-peach-pink' };
  return (
    <Tag size="small" color={colors[status] ?? 'brown'} variant="soft">
      {t(`dip.status.${status}`)}
    </Tag>
  );
}
