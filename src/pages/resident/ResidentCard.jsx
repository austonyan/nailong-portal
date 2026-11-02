// 电子居民卡:卡片展示、二维码验真、打印(PDF)、补发与续期入口。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Title, Button, Card, Modal } from 'animal-island-ui';
import { CopyIcon, PrinterIcon, RefreshIcon, ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { CARD_STATUS_COLORS, ResQr, StatusTag, fmtDate, fmtDateTime, resToast, toastResError, toastResSuccess } from './shared.jsx';

export default function ResidentCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [reissueOpen, setReissueOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/resident/card');
      setData(res);
    } catch (err) {
      if (err?.status === 404) setMissing(true);
      else toastResError(t, err);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  if (missing) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('res.card.empty')}</p>
        <Button type="primary" onClick={() => navigate('/resident/apply')}>
          {t('res.card.goApply')}
        </Button>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const { card, resident } = data;
  const verifyUrl = `${window.location.origin}/resident/verify?token=${card.verifyToken}`;

  const copyVerifyLink = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      toastResSuccess(t('res.card.linkCopied'));
    } catch {
      resToast('info', verifyUrl);
    }
  };

  const reissue = async () => {
    setBusy(true);
    try {
      await api.post('/resident/card/reissue');
      toastResSuccess(t('res.card.reissued'));
      setReissueOpen(false);
      load();
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="res-card-page">
      <div className="page-header">
        <h1 className="page-title"><Title size="middle" color="lime-green">{t('res.card.title')}</Title></h1>
      </div>

      <div className="res-card" data-status={card.status}>
        <div className="res-card-head">
          <div>
            <div className="res-card-issuer">{t('res.officeName')}</div>
            <div className="res-card-kind">{t('res.card.electronic')}</div>
          </div>
          <StatusTag value={card.status} map={CARD_STATUS_COLORS} i18nPrefix="res.cardStatus" />
        </div>
        <div className="res-card-body">
          <div className="res-card-grid">
            <div className="res-card-holder">
              <span className="res-card-avatar res-card-avatar-empty">{(card.nickname || '?').slice(0, 1)}</span>
              <div>
                <span className="res-card-label">{t('res.card.holder')}</span>
                <span className="res-card-value">{card.nickname || '-'}</span>
              </div>
            </div>
            <div>
              <span className="res-card-label">{t('res.card.noLabel')}</span>
              <span className="res-card-value res-card-no">{card.cardNo}</span>
            </div>
            <div>
              <span className="res-card-label">{t('res.card.type')}</span>
              <span className="res-card-value">{card.typeName || t('common.unknown')}</span>
            </div>
            <div>
              <span className="res-card-label">{t('res.card.issuedAt')}</span>
              <span className="res-card-value">{fmtDate(card.issuedAt)}</span>
            </div>
            <div>
              <span className="res-card-label">{t('res.card.validUntil')}</span>
              <span className="res-card-value">{fmtDate(card.validUntil)}</span>
            </div>
            <div>
              <span className="res-card-label">{t('res.card.issuer')}</span>
              <span className="res-card-value">{t('res.officeName')}</span>
            </div>
          </div>
          <div className="res-card-qr-box">
            <ResQr value={verifyUrl} size={132} />
            <span className="muted-text">{t('res.card.qrTip')}</span>
          </div>
        </div>
      </div>

      {card.status === 'frozen' && card.freezeReason && (
        <Card pattern="app-yellow" className="res-notice-card">
          <b>{t('res.card.frozenReason')}</b>
          <p>{card.freezeReason}</p>
        </Card>
      )}
      {card.status === 'expired' && (
        <Card pattern="app-orange" className="res-notice-card">
          <b>{t('res.card.expiredTip')}</b>
          <Button type="primary" size="small" onClick={() => navigate('/resident/changes?type=renewal')}>
            {t('res.card.renewNow')}
          </Button>
        </Card>
      )}

      <Card type="dashed" className="res-card-actions">
        <Button type="primary" icon={<PrinterIcon />} onClick={() => window.print()}>
          {t('res.card.print')}
        </Button>
        <Button icon={<CopyIcon />} onClick={copyVerifyLink}>
          {t('res.card.copyLink')}
        </Button>
        <Button icon={<RefreshIcon />} onClick={() => setReissueOpen(true)}>
          {t('res.card.reissue')}
        </Button>
      </Card>

      {resident && (
        <Card className="res-info-card">
          <h2>{t('res.card.infoTitle')}</h2>
          <dl className="res-info-list">
            <div>
              <dt>{t('res.form.virtualAddress')}</dt>
              <dd>{resident.virtualAddress || '-'}</dd>
            </div>
            <div>
              <dt>{t('res.form.bio')}</dt>
              <dd>{resident.bio || '-'}</dd>
            </div>
            <div>
              <dt>{t('res.card.since')}</dt>
              <dd>{fmtDateTime(resident.since)}</dd>
            </div>
          </dl>
          <Button size="small" onClick={() => navigate('/resident/changes?type=info')}>
            {t('res.card.editInfo')}
          </Button>
        </Card>
      )}

      <p className="muted-text res-card-meta">{t('res.card.meta', { time: fmtDateTime(card.issuedAt) })}</p>

      <Modal
        maskClosable={false}
        open={reissueOpen}
        title={t('res.card.reissueTitle')}
        onClose={() => setReissueOpen(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setReissueOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={reissue} disabled={busy}>
              {t('res.card.reissueConfirm')}
            </Button>
          </>
        }
      >
        <div className="res-reissue-body">
          <ShieldIcon size={28} />
          <p>{t('res.card.reissueTip')}</p>
        </div>
      </Modal>
    </div>
  );
}
