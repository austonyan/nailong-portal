// 验真中心 — 公开页,无需登录。
// 输入建交编号 / 外交身份编号 / 协议编号,或扫身份卡二维码(token)验真。
// 服务端脱敏:只返回编号、类型、状态、所属虚构实体、有效期与签发机构。
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Notification, Tag, Title } from 'animal-island-ui';
import { CompassIcon, SearchIcon, ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { StatusTag, fmtDate } from '../../components/dip/shared.jsx';

export default function DipVerify() {
  const { t } = useTranslation();
  const location = useLocation();
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);

  const runCode = async (value) => {
    try {
      const data = await api.post('/dip/verify', { code: value });
      setResult(data);
    } catch (err) {
      if (err?.status === 429) {
        Notification.error(t('api.DIP_RATE_LIMITED', { defaultValue: t('dip.verify.rateLimited') }));
        return;
      }
      Notification.error(t(`api.${err?.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
    }
  };

  useEffect(() => {
    if (!token) return;
    api
      .get(`/dip/verify?token=${encodeURIComponent(token)}`)
      .then(setResult)
      .catch((err) => {
        if (err?.status === 429) {
          Notification.error(t('api.DIP_RATE_LIMITED', { defaultValue: t('dip.verify.rateLimited') }));
          setResult(null);
          return;
        }
        setResult({ found: false });
      });
  }, [token, t]);

  const item = result?.item;
  const kindLabel = (k) =>
    k === 'relation' ? t('dip.verify.kindRelation') : k === 'identity' ? t('dip.verify.kindIdentity') : t('dip.verify.kindAgreement');

  return (
    <div className="center-screen">
      <Card className="dip-verify-card">
        <div className="dip-verify-head">
          <CompassIcon size={24} />
          <Title size="middle" color="purple">{t('dip.verify.title')}</Title>
        </div>
        <p className="muted-text">{t('dip.verify.tip')}</p>

        <div className="dip-check-row dip-verify-form">
          <Input
            size="large"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="NLD… / NLE… / NLG…"
            allowClear
            maxLength={40}
            disabled={!!token}
          />
          <Button type="primary" icon={<SearchIcon />} disabled={!!token} onClick={() => runCode(code.trim())}>
            {t('dip.verify.check')}
          </Button>
        </div>
        {!token && <p className="muted-text dip-verify-hint">{t('dip.verify.antiEnum')}</p>}

        {result && (
          <div className="dip-verify-result">
            {!result.found ? (
              <div className="dip-verify-invalid">
                <ShieldIcon size={20} />
                <Tag color="app-red" variant="solid">{t('dip.verify.notFound')}</Tag>
              </div>
            ) : (
              <>
                <p className="dip-verify-kind">
                  <Tag color="app-blue" variant="soft">{kindLabel(item.kind)}</Tag>
                  <b className="dip-verify-no">{item.no}</b>
                </p>
                <StatusTag value={item.status} />
                <div className="dip-verify-fields">
                  {item.kind === 'relation' && (
                    <>
                      <p>{t('dip.apply.entityName')}: {item.entityName}</p>
                      <p>{t('dip.verify.relationType')}: {t(`dip.relationType.${item.relationType}`, { defaultValue: item.relationType })}</p>
                      {item.establishedAt && <p>{t('dip.relation.establishedAt')}: {fmtDate(item.establishedAt)}</p>}
                    </>
                  )}
                  {item.kind === 'identity' && (
                    <>
                      <p>{t('dip.identity.entity')}: {item.entityName}</p>
                      <p>{t('dip.identity.type')}: {t(`dip.identityType.${item.identityType}`, { defaultValue: item.identityType })}</p>
                      <p>{t('dip.identity.term')}: {fmtDate(item.termStart)} ~ {fmtDate(item.termEnd)}</p>
                    </>
                  )}
                  {item.kind === 'agreement' && (
                    <>
                      <p>{item.partyA} × {item.partyB}</p>
                      <p>{t('dip.agreement.validRange', { from: fmtDate(item.effectiveFrom), to: fmtDate(item.effectiveTo) })}</p>
                    </>
                  )}
                  <p className="muted-text">{t('dip.verify.issuedBy')}: {item.issuedBy}</p>
                </div>
                <Tag color={item.valid ? 'app-green' : 'app-orange'} variant={item.valid ? 'solid' : 'soft'}>
                  {item.valid ? t('dip.verify.valid') : t('dip.verify.notValid')}
                </Tag>
              </>
            )}
          </div>
        )}

        <Link to="/login">
          <Button type="text" size="small">{t('imm.verify.toLogin')}</Button>
        </Link>
      </Card>
    </div>
  );
}
