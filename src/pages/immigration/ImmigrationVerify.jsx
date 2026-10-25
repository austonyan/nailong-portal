// 公开验真页 — 通过二维码里的 token 查询通关码状态。
// 不需要登录;服务端只返回状态字段,绝不返回个人信息。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Card, Notification, Tag } from 'animal-island-ui';
import { ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';

const STATUS_COLOR = {
  unused: 'app-green',
  used: 'app-blue',
  expired: 'default',
  voided: 'app-red',
};

export default function ImmigrationVerify() {
  const { t } = useTranslation();
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!token) return;
    api
      .get(`/immigration/verify?token=${encodeURIComponent(token)}`)
      .then(setResult)
      .catch((err) => {
        if (err?.status === 404) setResult({ status: 'invalid' });
        else {
          Notification.error(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
          setResult({ status: 'error' });
        }
      });
  }, [token, t]);

  return (
    <div className="center-screen">
      <Card className="im-verify-card">
        <div className="im-verify-head">
          <ShieldIcon size={24} />
          <h2>{t('imm.verify.title')}</h2>
        </div>
        {!token && <p className="muted-text">{t('imm.verify.noToken')}</p>}
        {result && (
          <div className="im-verify-result">
            {result.status === 'invalid' ? (
              <Tag color="app-red" variant="solid">{t('imm.verify.invalid')}</Tag>
            ) : (
              <>
                <p className="im-verify-code">{result.codeNo}</p>
                <Tag color={STATUS_COLOR[result.status] ?? 'default'} variant="soft">
                  {t(`imm.status.${result.status}`, { defaultValue: result.status })}
                </Tag>
                <p className="muted-text">
                  {result.portName} · {t('imm.pass.validUntil')}: {result.validUntil?.slice(0, 10)}
                </p>
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
