// 验真中心(公开):申诉编号/复核编号/决定书编号查询,二维码 token 验真,
// 脱敏展示,限流与防枚举提示。
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Tag, Title } from 'animal-island-ui';
import { SearchIcon, ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { appealErrMsg } from './shared.jsx';
import { fmtDateTime } from '../../lib/date.js';

const KIND_COLORS = { appeal: 'app-blue', review: 'app-teal', decision: 'app-green' };

export default function AppealVerify() {
  const { t } = useTranslation();
  const [no, setNo] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const doVerify = async (e) => {
    e?.preventDefault?.();
    const query = no.trim();
    if (!query) return;
    setBusy(true);
    setError('');
    try {
      const data = await api.get(`/appeal/verify?no=${encodeURIComponent(query)}`);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(appealErrMsg(t, err));
    } finally {
      setBusy(false);
    }
  };

  const statusTag = (r) => {
    if (!r.found) return null;
    if (r.kind === 'appeal') {
      return <Tag color={r.valid ? 'app-green' : 'default'} variant="soft">{t(`appeal.status.${r.status}`)}</Tag>;
    }
    if (r.kind === 'review') {
      return <Tag color={r.valid ? 'app-green' : 'app-yellow'} variant="soft">{t(`appeal.reviewStatus.${r.status}`)}</Tag>;
    }
    return <Tag color={r.valid ? 'app-green' : 'app-red'} variant="soft">{t(`appeal.decisionStatus.${r.status}`)}</Tag>;
  };

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

      <Title size="middle" color="app-teal">
        {t('appeal.verify.title')}
      </Title>
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
                <Tag color={KIND_COLORS[result.kind] || 'default'} variant="soft">
                  {t(`appeal.verifyKind.${result.kind}`)}
                </Tag>
                <strong>{result.code}</strong>
                {statusTag(result)}
              </div>
              <dl className="appeal-verify-rows">
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
                {(result.resolvedAt || result.decidedAt || result.effectiveAt) && (
                  <div>
                    <dt>{t('appeal.verify.handledAt')}</dt>
                    <dd>{fmtDateTime(result.effectiveAt || result.resolvedAt || result.decidedAt)}</dd>
                  </div>
                )}
                <div>
                  <dt>{t('appeal.verify.office')}</dt>
                  <dd>{t('appeal.officeName')}</dd>
                </div>
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
