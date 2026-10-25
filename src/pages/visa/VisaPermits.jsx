// 我的签注:电子签注卡、状态、验真链接与打印(PDF)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Notification, Tabs, Tag, Title } from 'animal-island-ui';
import { DownloadIcon, PrinterIcon, SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { PERMIT_STATUS_COLORS, fmtDate, fmtDateTime, toastVisaError } from './shared.jsx';

export default function VisaPermits() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/visa/permits');
      setItems(data.items);
      setSelected((prev) => data.items.find((p) => p.visaNo === prev?.visaNo) || data.items[0] || null);
    } catch (err) {
      toastVisaError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  if (items === null) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('visa.permit.empty')}</p>
      </Card>
    );
  }

  const copyVerifyLink = async () => {
    const url = `${window.location.origin}/visa/verify?token=${selected.verifyToken}`;
    try {
      await navigator.clipboard.writeText(url);
      Notification.success(t('visa.permit.linkCopied'));
    } catch {
      Notification.info(url);
    }
  };

  return (
    <div className="visa-permits-page">
      <div className="page-header">
        <Title size="middle">{t('visa.permit.title')}</Title>
      </div>

      <Tabs
        activeKey={selected?.visaNo}
        onChange={(key) => setSelected(items.find((p) => p.visaNo === key) || null)}
        items={items.map((p) => ({
          key: p.visaNo,
          label: p.visaNo,
          children: <EvisaCard permit={p} />,
        }))}
      />

      {selected && (
        <>
          <Card type="dashed" className="visa-permit-actions">
            <Button type="primary" icon={<PrinterIcon />} onClick={() => window.print()}>
              {t('visa.permit.print')}
            </Button>
            <Button icon={<SearchIcon />} onClick={() => window.open(`/visa/verify?token=${selected.verifyToken}`, '_blank')}>
              {t('visa.permit.verifyLink')}
            </Button>
            <Button icon={<DownloadIcon />} onClick={copyVerifyLink}>
              {t('visa.permit.copyLink')}
            </Button>
          </Card>

          <p className="muted-text visa-permit-meta">
            {t('visa.permit.meta', { time: fmtDateTime(selected.issuedAt) })}
          </p>
        </>
      )}
    </div>
  );
}

function EvisaCard({ permit }) {
  const { t } = useTranslation();
  return (
    <div className="evisa-card" data-status={permit.status}>
      <div className="evisa-watermark" aria-hidden>
        {t('visa.permit.watermark')}
      </div>
      <div className="evisa-head">
        <div>
          <div className="evisa-issuer">{t('visa.officeName')}</div>
          <div className="evisa-kind">{t('visa.permit.electronic')}</div>
        </div>
        <Tag color={PERMIT_STATUS_COLORS[permit.status] || 'default'} variant="solid" size="large">
          {t(`visa.permitStatus.${permit.status}`)}
        </Tag>
      </div>
      <div className="evisa-grid">
        <div>
          <span className="evisa-label">{t('visa.permit.noLabel')}</span>
          <span className="evisa-value evisa-no">{permit.visaNo}</span>
        </div>
        <div>
          <span className="evisa-label">{t('visa.field.type')}</span>
          <span className="evisa-value">{permit.typeName}</span>
        </div>
        <div>
          <span className="evisa-label">{t('visa.permit.holder')}</span>
          <span className="evisa-value">{permit.holderName || '-'}</span>
        </div>
        <div>
          <span className="evisa-label">{t('visa.permit.issuedAt')}</span>
          <span className="evisa-value">{fmtDate(permit.issuedAt)}</span>
        </div>
        <div>
          <span className="evisa-label">{t('visa.permit.validUntil')}</span>
          <span className="evisa-value">{fmtDate(permit.validUntil)}</span>
        </div>
        <div>
          <span className="evisa-label">{t('visa.field.appNo')}</span>
          <span className="evisa-value">{permit.appNo}</span>
        </div>
      </div>
      <div className="evisa-footer">
        <span>{t('visa.disclaimerShort')}</span>
      </div>
    </div>
  );
}
