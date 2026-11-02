// 我的签注:电子签注卡、状态、验真链接与打印(PDF)。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLoadError } from '../../components/LoadErrorBanner.jsx';
import { Title, Button, Card, Tabs, Tag } from 'animal-island-ui';
import { CopyIcon, PrinterIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { PERMIT_STATUS_COLORS, fmtDate } from './shared.jsx';
import { toastSuccess, toastInfo } from '../../components/toast.js';

export default function VisaPermits() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const loadError = useLoadError((items ?? []).length > 0);
  const [selected, setSelected] = useState(null);
  const load = useCallback(async function loadFn() {
    loadError.clear();
    try {
      const data = await api.get('/visa/permits');
      setItems(data.items);
      setSelected((prev) => data.items.find((p) => p.visaNo === prev?.visaNo) || data.items[0] || null);
    } catch (err) {
      loadError.report(err, loadFn);
      setItems((prev) => prev ?? []);
    }
  }, [t, loadError]);

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
      toastSuccess(t('visa.permit.linkCopied'));
    } catch {
      toastInfo(url);
    }
  };

  return (
    <div className="visa-permits-page">
      <div className="page-header">
        <h1 className="page-title"><Title size="middle" color="brown">{t('visa.permit.title')}</Title></h1>
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
            <Button icon={<CopyIcon />} onClick={copyVerifyLink}>
              {t('visa.permit.copyLink')}
            </Button>
            {selected.status === 'valid' && (
              <Button type="default" onClick={() => navigate(`/immigration/declare?visaNo=${encodeURIComponent(selected.visaNo)}`)}>
                {t('visa.permit.toImmigration')}
              </Button>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function EvisaCard({ permit }) {
  const { t } = useTranslation();
  return (
    <div className="evisa-card" data-status={permit.status}>
      <div className="evisa-head">
        <div>
          <div className="evisa-issuer">{t('visa.officeName')}</div>
          <div className="evisa-kind">{t('visa.permit.electronic')}</div>
        </div>
        <Tag color={PERMIT_STATUS_COLORS[permit.status] || 'brown'} variant="soft" size="large">
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
    </div>
  );
}
