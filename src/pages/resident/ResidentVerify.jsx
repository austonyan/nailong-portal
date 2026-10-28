// 验真中心(公开页):输入居民编号/申请编号或通过链接 token 验真。
// 结果脱敏,不展示持有人个人信息;带限流提示。
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Background, Button, Card, Input, Tag, Title, Typewriter } from 'animal-island-ui';
import { SearchIcon, ShieldIcon, UsersIcon } from 'naive-icons';
import { CARD_STATUS_COLORS, fmtDate, resToast } from './shared.jsx';

export default function ResidentVerify() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [no, setNo] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const verify = async (query) => {
    const token = typeof query === 'object' ? query.token : null;
    const value = typeof query === 'object' ? null : String(query ?? no).trim();
    if (!token && !value) return;
    setBusy(true);
    try {
      const qs = token ? `token=${encodeURIComponent(token)}` : `no=${encodeURIComponent(value)}`;
      const res = await fetch(`/api/resident/verify?${qs}`);
      const data = await res.json();
      if (!res.ok) {
        resToast('error', t(`api.${data.code}`, { defaultValue: data.message || t('api.INTERNAL_ERROR') }));
        return;
      }
      setResult({ ...data, query: value || '' });
    } catch {
      resToast('error', t('api.NETWORK_ERROR'));
    } finally {
      setBusy(false);
    }
  };

  // 验真链接(二维码扫码预留):带 token 直接查询。
  // 依赖写成 token 字符串本身 —— 用 searchParams 对象会让每次重渲染都重新验真,
  // 把公开接口的限流额度耗光,用户看到的是「查询过于频繁」。
  const tokenParam = searchParams.get('token');
  useEffect(() => {
    if (tokenParam) verify({ token: tokenParam });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenParam]);

  return (
    <div className="res-verify-page">
      <header className="res-public-header">
        <a href="/" className="brand">
          <UsersIcon size={24} className="brand-icon" />
          <span>{t('app.name')}</span>
        </a>
        <span className="muted-text">{t('res.officeName')}</span>
      </header>
      <Background type="sprinkles" className="res-verify-hero">
        <Title size="large">{t('res.verify.title')}</Title>
        <Typewriter speed={35}>
          <p className="res-hero-sub">{t('res.verify.subtitle')}</p>
        </Typewriter>
      </Background>

      <Card className="res-verify-card">
        <div className="res-verify-form">
          <Input
            size="large"
            allowClear
            placeholder={t('res.verify.placeholder')}
            value={no}
            onChange={(e) => setNo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') verify();
            }}
          />
          <Button type="primary" size="large" icon={<SearchIcon />} loading={busy} onClick={() => verify()} disabled={busy}>
            {t('res.verify.action')}
          </Button>
        </div>
        <p className="muted-text">{t('res.verify.limitTip')}</p>
      </Card>

      {result && (
        <Card className="res-verify-result" color={result.found ? 'app-green' : 'app-orange'}>
          {result.found ? (
            <div className="res-verify-found">
              <div className="res-verify-row">
                <span className="res-card-label">{t('res.card.noLabel')}</span>
                <strong>{result.cardNo}</strong>
              </div>
              <div className="res-verify-row">
                <span className="res-card-label">{t('common.status')}</span>
                <Tag color={CARD_STATUS_COLORS[result.status] || 'default'} variant="solid">
                  {t(`res.cardStatus.${result.status}`)}
                </Tag>
              </div>
              <div className="res-verify-row">
                <span className="res-card-label">{t('res.card.type')}</span>
                <span>{result.typeName}</span>
              </div>
              <div className="res-verify-row">
                <span className="res-card-label">{t('res.card.issuedAt')}</span>
                <span>{fmtDate(result.issuedAt)}</span>
              </div>
              <div className="res-verify-row">
                <span className="res-card-label">{t('res.card.validUntil')}</span>
                <span>{fmtDate(result.validUntil)}</span>
              </div>
              <div className="res-verify-row">
                <span className="res-card-label">{t('res.card.issuer')}</span>
                <span>{result.issuer}</span>
              </div>
            </div>
          ) : (
            <div className="res-verify-missing">
              <ShieldIcon size={28} />
              <p>{t('res.verify.notFound')}</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
