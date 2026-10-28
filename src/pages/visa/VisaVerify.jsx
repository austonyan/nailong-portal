// 验真中心(公开页):输入签注编号/申请编号或通过链接 token 验真。
// 结果脱敏,不展示持有人个人信息;带限流提示。
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Background, Card, Input, Tag, Title, Typewriter } from 'animal-island-ui';
import { SailboatIcon, SearchIcon, ShieldIcon } from 'naive-icons';
import { PERMIT_STATUS_COLORS, fmtDate, toastVisaError } from './shared.jsx';
import { toastError } from '../../components/toast.js';

export default function VisaVerify() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [no, setNo] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const verifyByNo = async (value) => {
    const query = String(value ?? no).trim();
    if (!query) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/visa/verify?no=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) {
        toastError(t(`api.${data.code}`, { defaultValue: data.message || t('api.INTERNAL_ERROR') }));
        return;
      }
      setResult({ ...data, query });
    } catch (err) {
      toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const verifyByToken = async (token) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/visa/verify?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) {
        toastError(t(`api.${data.code}`, { defaultValue: data.message || t('api.INTERNAL_ERROR') }));
        return;
      }
      setResult({ ...data, query: '' });
    } catch (err) {
      toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
  };

  // 验真链接(扫码预留):带 token 直接查询
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) verifyByToken(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="visa-verify-page">
      <header className="visa-public-header">
        <a href="/" className="brand">
          <SailboatIcon size={24} className="brand-icon" />
          <span>{t('app.name')}</span>
        </a>
        <span className="muted-text">{t('visa.officeName')}</span>
      </header>
      <Background type="sprinkles" className="visa-verify-hero">
        <Title size="large">{t('visa.verify.title')}</Title>
        <Typewriter speed={35}>
          <p className="visa-hero-sub">{t('visa.verify.subtitle')}</p>
        </Typewriter>
      </Background>

      <Card className="visa-verify-card">
        <div className="visa-verify-form">
          <Input
            size="large"
            allowClear
            placeholder={t('visa.verify.placeholder')}
            aria-label={t('visa.verify.placeholder')}
            value={no}
            onChange={(e) => setNo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') verifyByNo();
            }}
          />
          <Button type="primary" size="large" icon={<SearchIcon />} loading={busy} onClick={() => verifyByNo()} disabled={busy}>
            {t('visa.verify.action')}
          </Button>
        </div>
        <p className="muted-text">{t('visa.verify.limitTip')}</p>
      </Card>

      {result && (
        <Card className="visa-verify-result" color={result.found ? 'app-teal' : 'app-orange'}>
          {result.found ? (
            <div className="visa-verify-found">
              <div className="visa-verify-row">
                <span className="evisa-label">{t('visa.permit.noLabel')}</span>
                <strong>{result.visaNo}</strong>
              </div>
              <div className="visa-verify-row">
                <span className="evisa-label">{t('common.status')}</span>
                <Tag color={PERMIT_STATUS_COLORS[result.status] || 'default'} variant="solid">
                  {t(`visa.permitStatus.${result.status}`)}
                </Tag>
              </div>
              <div className="visa-verify-row">
                <span className="evisa-label">{t('visa.field.type')}</span>
                <span>{result.typeName}</span>
              </div>
              <div className="visa-verify-row">
                <span className="evisa-label">{t('visa.permit.validUntil')}</span>
                <span>{fmtDate(result.validUntil)}</span>
              </div>
              <div className="visa-verify-row">
                <span className="evisa-label">{t('visa.permit.issuer')}</span>
                <span>{result.issuer}</span>
              </div>
            </div>
          ) : (
            <div className="visa-verify-missing">
              <ShieldIcon size={28} />
              <p>{t('visa.verify.notFound')}</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
