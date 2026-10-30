// 互免协议: 公示列表 / 详情 / 我的互免资格查询 / 常见问题。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Collapse, Input, Tag, Title } from 'animal-island-ui';
import { SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { DipNav, StatusTag, fmtDate, toastDipError } from '../../components/dip/shared.jsx';
import { toastSuccess, toastWarning } from '../../components/toast.js';

const FAQ_KEYS = ['effect', 'fee', 'reality'];

export default function DipAgreements() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);

  const load = useCallback(() => {
    api
      .get('/dip/agreements')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastDipError(t, err);
        setItems([]);
      });
  }, [t]);

  useEffect(load, [load]);

  const check = async () => {
    if (!code.trim()) {
      toastWarning(t('dip.agreement.codeFirst'));
      return;
    }
    try {
      const data = await api.post('/dip/agreements/eligibility', { code: code.trim() });
      setResult(data);
      toastSuccess(
        data.items.length ? t('dip.agreement.hit', { count: data.items.length }) : t('dip.agreement.noHit')
      );
    } catch (err) {
      setResult(null);
      toastDipError(t, err);
    }
  };

  return (
    <div className="dip-page">
      <DipNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="purple">{t('dip.agreement.title')}</Title>
        </h1>
      </div>

      <Card>
        <Title size="small">{t('dip.agreement.checkTitle')}</Title>
        <p className="muted-text">{t('dip.agreement.checkTip')}</p>
        <div className="dip-check-row">
          <Input
            size="large"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="NLD20261025-XXXXXX / NLE…"
            allowClear
            maxLength={40}
          />
          <Button type="primary" icon={<SearchIcon />} onClick={check}>{t('dip.agreement.check')}</Button>
        </div>
        {result && (
          <div className="dip-eligibility-result">
            <p>
              <Tag color="app-teal" variant="soft">{result.source === 'identity' ? t('dip.agreement.sourceIdentity') : t('dip.agreement.sourceRelation')}</Tag>
              {t('dip.agreement.entity')}: <b>{result.entity}</b>
            </p>
            {(result.items ?? []).map((a) => (
              <Card key={a.no} className="dip-agreement-item">
                <div className="dip-agreement-head">
                  <b>{a.no}</b>
                  <Tag size="small" color="app-blue" variant="soft">
                    {t(`dip.agreementType.${a.type}`, { defaultValue: t('common.unknown') })}
                  </Tag>
                </div>
                <p>{a.partyA} × {a.partyB}</p>
                <p className="muted-text">
                  {t('dip.agreement.validRange', { from: fmtDate(a.effectiveFrom), to: fmtDate(a.effectiveTo) })}
                  {a.courtesies ? ` · ${a.courtesies}` : ''}
                </p>
                {a.coveredScope && <p className="muted-text">{t('dip.agreement.scope')}: {a.coveredScope}</p>}
              </Card>
            ))}
            {(result.items ?? []).length === 0 && <p className="muted-text">{t('dip.agreement.noHit')}</p>}
          </div>
        )}
      </Card>

      <Card>
        <Title size="small">{t('dip.agreement.listTitle')}</Title>
        <div className="dip-agreement-list">
          {(items ?? []).map((a) => (
            <Card key={a.no} className="dip-agreement-item">
              <div className="dip-agreement-head">
                <b>{a.no}</b>
                <Tag size="small" color="app-blue" variant="soft">
                  {t(`dip.agreementType.${a.type}`, { defaultValue: t('common.unknown') })}
                </Tag>
                <StatusTag value={a.status} />
              </div>
              <p className="dip-agreement-parties">{a.partyA} × {a.partyB}</p>
              <p className="muted-text">{t('dip.agreement.validRange', { from: fmtDate(a.effectiveFrom), to: fmtDate(a.effectiveTo) })}</p>
              {a.courtesies && <p>{t('dip.agreement.courtesies')}: {a.courtesies}</p>}
              {a.coveredScope && <p className="muted-text">{t('dip.agreement.scope')}: {a.coveredScope}</p>}
              {a.note && <p className="muted-text">{a.note}</p>}
            </Card>
          ))}
          {(items ?? []).length === 0 && <p className="muted-text">{t('common.empty')}</p>}
        </div>
      </Card>

      <Card id="faq">
        <Title size="small">{t('dip.faq.title')}</Title>
        <div className="dip-faq">
          {FAQ_KEYS.map((k) => (
            <Collapse key={k} question={t(`dip.faq.${k}Q`)} answer={<p className="muted-text">{t(`dip.faq.${k}A`)}</p>} />
          ))}
        </div>
      </Card>
    </div>
  );
}
