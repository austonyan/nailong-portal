// 验真中心(公开页):邀请函 / 活动凭证 / 接待方编号或二维码 token 验真。
// 结果脱敏,不展示联系方式与随行人员;带限流与防枚举提示。
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Background, Button, Card, Input, Tag, Title, Typewriter } from 'animal-island-ui';
import { SailboatIcon, SearchIcon, ShieldIcon } from 'naive-icons';
import { StatusTag, fmtDateTime } from './shared.jsx';
import { toastError } from './shared.jsx';
import './protocol.css';

export default function ProtocolVerify() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('no') || '');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (value, useToken = false) => {
    const q = String(value ?? query).trim();
    const token = useToken ? searchParams.get('token') : null;
    if (!q && !token) return;
    setBusy(true);
    try {
      const params = new URLSearchParams(token ? { token } : { no: q });
      const res = await fetch(`/api/protocol/verify?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        toastError(t(`api.${data.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
        return;
      }
      setResult({ ...data, query: q });
    } catch (err) {
      toastError(t(`api.${err.code || 'NETWORK_ERROR'}`, { defaultValue: t('api.NETWORK_ERROR') }));
    } finally {
      setBusy(false);
    }
  };

  // 依赖写成字符串:把 searchParams 对象放进依赖数组会让每次重渲染都重新验真,
  // 把公开接口的限流额度白白耗光(同一个二维码扫两次就报「限流」)。
  const tokenParam = searchParams.get('token');
  const noParam = searchParams.get('no');

  useEffect(() => {
    if (tokenParam) run(undefined, true);
    else if (noParam) run(noParam, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenParam, noParam]);

  const item = result?.item;

  return (
    <div className="protocol-verify-page">
      <header className="protocol-public-header">
        <a href="/" className="brand">
          <SailboatIcon size={24} className="brand-icon" />
          <span>{t('app.name')}</span>
        </a>
        <span className="muted-text">{t('protocol.officeName')}</span>
      </header>
      <Background type="sprinkles" className="protocol-verify-hero">
        <Title size="large">{t('protocol.verify.title')}</Title>
        <Typewriter speed={35}>
          <p className="protocol-hero-sub">{t('protocol.verify.subtitle')}</p>
        </Typewriter>
      </Background>

      <Card className="protocol-verify-card">
        <div className="protocol-verify-form">
          <Input
            size="large"
            allowClear
            placeholder={t('protocol.verify.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
          <Button type="primary" size="large" icon={<SearchIcon />} loading={busy} onClick={() => run()} disabled={busy}>
            {t('protocol.verify.action')}
          </Button>
        </div>
        <p className="muted-text">{t('protocol.verify.limitTip')}</p>
      </Card>

      {result && (
        <Card className="protocol-verify-result" color={item?.valid ? 'app-teal' : 'app-orange'}>
          {item ? (
            <div className="protocol-verify-found">
              <div className="protocol-verify-head">
                <Tag color="app-teal" variant="solid">{item.typeName}</Tag>
                <StatusTag status={item.status} />
                <Tag color={item.valid ? 'app-green' : 'app-red'} variant="soft">
                  {item.valid ? t('protocol.verify.valid') : t('protocol.verify.invalid')}
                </Tag>
              </div>
              <dl className="protocol-field-list">
                <div className="protocol-field-row"><dt>{t('protocol.field.no')}</dt><dd>{item.no}</dd></div>
                {item.name && <div className="protocol-field-row"><dt>{t('protocol.field.name')}</dt><dd>{item.name}</dd></div>}
                {item.eventTitle && <div className="protocol-field-row"><dt>{t('protocol.field.event')}</dt><dd>{item.eventTitle}</dd></div>}
                {item.eventTime && <div className="protocol-field-row"><dt>{t('protocol.field.startsAt')}</dt><dd>{fmtDateTime(item.eventTime)}</dd></div>}
                {item.venueName && <div className="protocol-field-row"><dt>{t('protocol.field.venue')}</dt><dd>{item.venueName}</dd></div>}
                {item.certNo && <div className="protocol-field-row"><dt>{t('protocol.field.certNo')}</dt><dd>{item.certNo}</dd></div>}
                {item.validUntil && <div className="protocol-field-row"><dt>{t('protocol.field.validUntil')}</dt><dd>{fmtDateTime(item.validUntil)}</dd></div>}
                <div className="protocol-field-row"><dt>{t('protocol.field.issuer')}</dt><dd>{item.issuedBy}</dd></div>
              </dl>
              {item.kind === 'invitation' && item.visaUsable && (
                <p className="protocol-status-note">{t('protocol.verify.visaUsable')}</p>
              )}
            </div>
          ) : (
            <div className="protocol-verify-missing">
              <ShieldIcon size={28} />
              <p>{t('protocol.verify.notFound')}</p>
            </div>
          )}
        </Card>
      )}

      <Card type="dashed" className="protocol-tip-card">
        <p>{t('protocol.verify.antiEnum')}</p>
      </Card>
    </div>
  );
}