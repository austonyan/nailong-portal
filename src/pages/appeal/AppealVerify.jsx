// 验真中心(公开):十二署业务编号统一核验,决定书二维码 token 验真,
// 脱敏展示,限流与防枚举提示。
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Title, Button, Card, Input, Tag } from 'animal-island-ui';
import { SearchIcon, ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { appealErrMsg } from './shared.jsx';
import { linkageStatusLabel } from '../../components/linkage/shared.js';
import { fmtDate, fmtDateTime } from '../../lib/date.js';

const when = (value) => (typeof value === 'string' && value.length === 10 ? fmtDate(value) : fmtDateTime(value));

export default function AppealVerify() {
  const { t } = useTranslation();
  const [no, setNo] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const autoQueried = useRef(false);

  const runLookup = useCallback(
    async (query, token = '') => {
      const value = String(query || '').trim();
      if (!value && !token) return;
      setBusy(true);
      setError('');
      try {
        const qs = token
          ? `token=${encodeURIComponent(token)}`
          : `no=${encodeURIComponent(value)}`;
        const data = await api.get(`/appeal/verify?${qs}`);
        setResult(data);
      } catch (err) {
        setResult(null);
        setError(appealErrMsg(t, err));
      } finally {
        setBusy(false);
      }
    },
    [t]
  );

  // 决定书二维码带 ?token=,旧的 ?no= 链接也继续支持;只自动查询一次,
  // 避免 StrictMode 双执行重复消耗限流额度。
  useEffect(() => {
    if (autoQueried.current) return;
    autoQueried.current = true;
    const params = new URLSearchParams(window.location.search);
    const query = params.get('no')?.trim() || '';
    const token = params.get('token')?.trim() || '';
    if (query) setNo(query);
    if (query || token) runLookup(query, token);
  }, [runLookup]);

  const doVerify = (e) => {
    e?.preventDefault?.();
    runLookup(no);
  };

  const office = result ? result.office || 'appeal' : '';
  const statusText = result ? linkageStatusLabel(t, office, result.kind, result.status) : '';
  const kindText = result
    ? t(`appeal.verifyKind.${result.kind}`, { defaultValue: t('common.unknown') })
    : '';
  const officeText = result
    ? t(`appeal.verifyOffice.${office}`, { defaultValue: t('common.unknown') })
    : '';
  const issuedAt = result ? result.issuedAt || result.createdAt : null;
  const handledAt = result ? result.effectiveAt || result.resolvedAt || result.decidedAt : null;

  return (
    <div className="appeal-verify-page">
      <div className="appeal-public-header">
        <span className="appeal-office-emblem">
          <ShieldIcon size={20} />
        </span>
        <div>
          <div className="appeal-office-name">{t('appeal.officeName')}</div>
          <div className="appeal-office-sub">{t('appeal.verify.headerSub')}</div>
        </div>
      </div>

      <h1 className="page-title"><Title size="middle" color="yellow-green">{t('appeal.verify.title')}</Title></h1>
      <p className="muted-text">{t('appeal.verify.tip')}</p>

      <Card className="appeal-verify-card">
        <form className="appeal-verify-form" onSubmit={doVerify}>
          <Input
            size="large"
            allowClear
            maxLength={64}
            prefix={<SearchIcon size={14} />}
            placeholder={t('appeal.verify.placeholder')}
            value={no}
            onChange={(e) => setNo(e.target.value)}
          />
          <Button type="primary" size="large" loading={busy} disabled={busy || (!no.trim())} onClick={doVerify}>
            {t('appeal.verify.action')}
          </Button>
        </form>
        {error && <p className="appeal-verify-error">{error}</p>}
      </Card>

      {result && (
        <Card className="appeal-verify-result">
          {result.found ? (
            <>
              <div className="appeal-verify-head">
                <Tag color="app-blue" variant="soft">{kindText}</Tag>
                <strong>{result.code}</strong>
                <Tag color={result.valid ? 'app-green' : 'brown'} variant="soft">
                  {result.valid ? t('appeal.verify.valid') : t('appeal.verify.notEffective')}
                </Tag>
              </div>
              <dl className="appeal-verify-rows">
                <div>
                  <dt>{t('appeal.verify.number')}</dt>
                  <dd>{result.code}</dd>
                </div>
                <div>
                  <dt>{t('appeal.verify.office')}</dt>
                  <dd>{officeText}</dd>
                </div>
                {statusText && (
                  <div>
                    <dt>{t('appeal.verify.status')}</dt>
                    <dd>{statusText}</dd>
                  </div>
                )}
                {issuedAt && (
                  <div>
                    <dt>{t('appeal.verify.issuedAt')}</dt>
                    <dd>{when(issuedAt)}</dd>
                  </div>
                )}
                {result.validUntil && (
                  <div>
                    <dt>{t('appeal.verify.validUntil')}</dt>
                    <dd>{when(result.validUntil)}</dd>
                  </div>
                )}
                {result.checkedAt && (
                  <div>
                    <dt>{t('appeal.verify.checkedAt')}</dt>
                    <dd>{when(result.checkedAt)}</dd>
                  </div>
                )}
                {result.appealCode && (
                  <div>
                    <dt>{t('appeal.verify.appealNo')}</dt>
                    <dd>{result.appealCode}</dd>
                  </div>
                )}
                {result.bizType && (
                  <div>
                    <dt>{t('appeal.apply.bizType')}</dt>
                    <dd>{t(`appeal.bizType.${result.bizType}`)}</dd>
                  </div>
                )}
                {result.decisionType && (
                  <div>
                    <dt>{t('appeal.verify.decisionType')}</dt>
                    <dd>{t(`appeal.decisionType.${result.decisionType}`)}</dd>
                  </div>
                )}
                {handledAt && (
                  <div>
                    <dt>{t('appeal.verify.handledAt')}</dt>
                    <dd>{when(handledAt)}</dd>
                  </div>
                )}
              </dl>
              <p className="muted-text">{t('appeal.verify.maskTip')}</p>
            </>
          ) : (
            <div className="appeal-verify-missing">
              <p>{t('appeal.verify.notFound')}</p>
              <p className="muted-text">{t('appeal.verify.notFoundTip')}</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
