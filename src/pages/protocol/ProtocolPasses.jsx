// 我的活动凭证:电子票、二维码、状态、下载与验真。
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { CalendarIcon, CreditCardIcon, DownloadIcon, HomeIcon, SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { PASS_STATUS_COLORS, ProtocolQr, StatusTag, downloadProtocolFile, fmtDateTime, toastProtocolError } from './shared.jsx';

export default function ProtocolPasses() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/protocol/passes')
      .then((data) => !cancelled && setItems(data.items))
      .catch((err) => {
        toastProtocolError(t, err);
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const download = async (pass) => {
    try {
      await downloadProtocolFile(`/protocol/passes/${pass.id}/file`, `${pass.passNo}.html`);
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('protocol.passes.title')}</Title>
        </h1>
        <p className="muted-text">{t('protocol.passes.subtitle')}</p>
      </div>

      <div className="protocol-pass-grid">
        {items === null && (
          <Card type="dashed" className="protocol-empty-card">
            <p className="muted-text">{t('common.loading')}</p>
          </Card>
        )}
        {(items ?? []).map((pass) => (
          <div key={pass.id} className="protocol-pass-card" data-status={pass.status}>
            <div className="protocol-pass-head">
              <div>
                <div className="protocol-pass-issuer">{t('protocol.officeName')}</div>
                <div className="protocol-pass-kind">{t('protocol.passes.kind')}</div>
              </div>
              <StatusTag status={pass.status} />
            </div>
            <div className="protocol-pass-body">
              <div className="protocol-pass-info">
                <h2>{pass.eventTitle}</h2>
                <p className="protocol-pass-no">{pass.passNo}</p>
                <div className="protocol-pass-meta">
                  <span><CalendarIcon size={14} /> {fmtDateTime(pass.eventStartsAt)}</span>
                  <span><HomeIcon size={14} /> {pass.venueName}</span>
                  <span><CreditCardIcon size={14} /> {t('protocol.passes.holder')}: {pass.holderName}</span>
                </div>
                <Tag color={PASS_STATUS_COLORS[pass.status] ?? 'brown'} variant="soft">
                  {t(`protocol.passes.statusNote_${pass.status}`, { defaultValue: t(`protocol.status.${pass.status}`) })}
                </Tag>
              </div>
              <div className="protocol-pass-qr">
                <ProtocolQr value={`${window.location.origin}${pass.verifyUrl}`} />
                <small>{t('protocol.passes.qrTip')}</small>
              </div>
            </div>
            <div className="protocol-pass-foot">
              <div className="protocol-pass-actions">
                <Button type="default" size="small" icon={<DownloadIcon />} onClick={() => download(pass)}>
                  {t('protocol.action.download')}
                </Button>
                <Button
                  type="text"
                  size="small"
                  icon={<SearchIcon />}
                  onClick={() => navigate(`/protocol/verify?no=${encodeURIComponent(pass.passNo)}`)}
                >
                  {t('protocol.action.verify')}
                </Button>
              </div>
            </div>
          </div>
        ))}
        {items && items.length === 0 && (
          <Card type="dashed" className="protocol-empty-card">
            <CreditCardIcon size={28} />
            <p className="muted-text">{t('protocol.passes.empty')}</p>
            <Button type="dashed" onClick={() => navigate('/protocol/registrations')}>
              {t('protocol.nav.registrations')}
            </Button>
          </Card>
        )}
      </div>

      <Card type="dashed" className="protocol-tip-card">
        <p>{t('protocol.passes.checkinTip')}</p>
      </Card>
    </div>
  );
}