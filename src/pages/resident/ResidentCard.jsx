// 电子居民卡:卡片展示、二维码验真、打印(PDF)、补发与续期入口。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Modal, Tag, Title } from 'animal-island-ui';
import { PrinterIcon, RefreshIcon, SearchIcon, ShieldIcon } from 'naive-icons';
import { api, requestBlob } from '../../api/client.js';
import { CARD_STATUS_COLORS, ResQr, StatusTag, fmtDate, fmtDateTime, resToast, toastResError, toastResSuccess } from './shared.jsx';

export default function ResidentCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [reissueOpen, setReissueOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);

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

  // 头像走受限下载,拿 blob 展示
  useEffect(() => {
    let url = null;
    if (data?.resident?.avatarMaterialId) {
      requestBlob(`/resident/materials/${data.resident.avatarMaterialId}`)
        .then((blob) => {
          url = URL.createObjectURL(blob);
          setAvatarUrl(url);
        })
        .catch(() => setAvatarUrl(null));
    } else {
      setAvatarUrl(null);
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [data?.resident?.avatarMaterialId]);

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
        <Title size="middle" color="app-green">
          {t('res.card.title')}
        </Title>
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
              {avatarUrl ? (
                <img className="res-card-avatar" src={avatarUrl} alt={card.nickname} />
              ) : (
                <span className="res-card-avatar res-card-avatar-empty">{(card.nickname || '?').slice(0, 1)}</span>
              )}
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
              <span className="res-card-value">{card.typeName}</span>
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
              <span className="res-card-label">{t('res.card.statusLabel')}</span>
              <span className="res-card-value">{t(`res.cardStatus.${card.status}`)}</span>
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
        <Card color="app-yellow" className="res-notice-card">
          <b>{t('res.card.frozenReason')}</b>
          <p>{card.freezeReason}</p>
        </Card>
      )}
      {card.status === 'expired' && (
        <Card color="app-orange" className="res-notice-card">
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
        <Button icon={<SearchIcon />} onClick={() => window.open(`/resident/verify?token=${card.verifyToken}`, '_blank')}>
          {t('res.card.verifyLink')}
        </Button>
        <Button icon={<SearchIcon />} onClick={copyVerifyLink}>
          {t('res.card.copyLink')}
        </Button>
        <Button icon={<RefreshIcon />} onClick={() => setReissueOpen(true)}>
          {t('res.card.reissue')}
        </Button>
      </Card>

      {resident && (
        <Card className="res-info-card">
          <h4>{t('res.card.infoTitle')}</h4>
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
