// 公开验真页 — 通过二维码里的 token 查询通关码状态。
// 不需要登录;服务端只返回状态字段,绝不返回个人信息。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { RefreshIcon, ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastApiError } from '../../components/immigration/apiError.js';
import { fmtDate } from '../../lib/date.js';

const STATUS_COLOR = {
  unused: 'app-green',
  used: 'app-green',
  expired: 'brown',
  voided: 'app-red',
};

export default function ImmigrationVerify() {
  const { t } = useTranslation();
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [result, setResult] = useState(null);
  const [state, setState] = useState(token ? 'loading' : 'idle');

  const run = useCallback(() => {
    if (!token) return;
    api
      .get(`/immigration/verify?token=${encodeURIComponent(token)}`)
      .then((data) => {
        setResult(data);
        setState('done');
      })
      .catch((err) => {
        // 404 = 令牌查不到(未查到该通关码);其余是请求本身失败,不能当成功渲染。
        if (err?.status === 404) {
          setResult({ status: 'invalid' });
        } else {
          toastApiError(err);
          setResult({ status: 'error' });
        }
        setState('done');
      });
  }, [token]);

  // 首屏的「加载中」来自 state 初值,effect 里不同步 setState。
  useEffect(run, [run]);

  // 重试:先切回加载态(错误分支连同按钮一起卸载,点不了第二下),再重发请求。
  const retry = () => {
    setState('loading');
    run();
  };

  const resultIsPass = state === 'done' && result && result.status !== 'invalid' && result.status !== 'error';

  return (
    <div className="center-screen">
      <Card className="im-verify-card">
        <div className="im-verify-head">
          <ShieldIcon size={24} />
          <h1 className="page-title">
            <Title size="middle">{t('imm.verify.title')}</Title>
          </h1>
        </div>
        {state === 'idle' && <p className="muted-text">{t('imm.verify.noToken')}</p>}
        {state === 'loading' && <p className="muted-text">{t('common.loading')}</p>}
        {state === 'done' && result?.status === 'invalid' && (
          <div className="im-verify-result">
            <Tag color="app-red" variant="soft">{t('imm.verify.invalid')}</Tag>
          </div>
        )}
        {state === 'done' && result?.status === 'error' && (
          <div className="im-verify-result">
            <Tag color="app-red" variant="soft">{t('imm.verify.failed')}</Tag>
            <p className="muted-text">{t('imm.verify.failedTip')}</p>
            {/* 重试期间错误分支整块换成加载文案,按钮随之卸载,点不了第二下 */}
            <Button type="default" icon={<RefreshIcon />} onClick={retry}>
              {t('imm.verify.retry')}
            </Button>
          </div>
        )}
        {resultIsPass && (
          <div className="im-verify-result">
            <p className="im-verify-code">{result.codeNo}</p>
            <Tag color={STATUS_COLOR[result.status] ?? 'brown'} variant="soft">
              {t(`imm.status.${result.status}`, { defaultValue: t('common.unknown') })}
            </Tag>
            <p className="muted-text">
              {result.portName} · {t('imm.pass.validUntil')}: {fmtDate(result.validUntil)}
            </p>
          </div>
        )}
        <Link to="/login">
          <Button type="text" size="small">{t('imm.verify.toLogin')}</Button>
        </Link>
      </Card>
    </div>
  );
}
