// 跨署自动审批设置面板:关闭 / 立即审批 / 延时审批。
// 各署后台把它放在自己的设置区,权限由服务端按署校验。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Select, Title } from 'animal-island-ui';
import { api } from '../api/client.js';
import { toastSuccess, toastApiError } from './toast.js';
import { fmtDateTime } from '../lib/date.js';

const MODES = ['off', 'immediate', 'delayed'];

export default function AutoApproveSettings({ service }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(null);
  const [mode, setMode] = useState('off');
  const [delay, setDelay] = useState('60');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/auto-approve/${service}`);
      const next = data.settings;
      setSettings(next);
      setMode(next.mode);
      setDelay(String(next.delayMinutes > 0 ? next.delayMinutes : 60));
    } catch (err) {
      toastApiError(t, err);
    }
  }, [service, t]);

  useEffect(() => {
    load();
  }, [load]);

  const delayNumber = Number(delay);
  const delayValid = Number.isInteger(delayNumber) && delayNumber >= 1 && delayNumber <= 10080;
  const canSave = mode !== 'delayed' || delayValid;

  const save = async () => {
    setBusy(true);
    try {
      const data = await api.patch(`/auto-approve/${service}`, {
        mode,
        delayMinutes: delayValid ? delayNumber : 0,
      });
      const next = data.settings;
      setSettings(next);
      setMode(next.mode);
      if (next.delayMinutes > 0) setDelay(String(next.delayMinutes));
      toastSuccess(t('common.saved'));
    } catch (err) {
      toastApiError(t, err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auto-approve-panel">
      <Title size="small">{t('autoApprove.title')}</Title>
      <p className="muted-text">
        {t('autoApprove.scope', {
          flows: t(`autoApprove.flows.${service}`, { defaultValue: t('common.unknown') }),
        })}
      </p>
      <div className="auto-approve-row">
        <span className="auto-approve-label">{t('autoApprove.mode')}</span>
        <Select
          value={mode}
          onChange={setMode}
          options={MODES.map((item) => ({ key: item, label: t(`autoApprove.mode_${item}`) }))}
        />
      </div>
      {mode === 'delayed' && (
        <div className="auto-approve-row">
          <span className="auto-approve-label">{t('autoApprove.delayMinutes')}</span>
          <Input
            className="auto-approve-delay"
            type="number"
            value={delay}
            onChange={(e) => setDelay(e.target.value.replace(/[^\d]/g, ''))}
          />
          <span className="muted-text">{t('autoApprove.delayHint')}</span>
        </div>
      )}
      <p className="muted-text">{t(`autoApprove.hint_${mode}`)}</p>
      {settings?.updatedAt && (
        <p className="muted-text">
          {t('autoApprove.updated', { time: fmtDateTime(settings.updatedAt) })}
          {settings.updatedBy ? ` · ${settings.updatedBy}` : ''}
        </p>
      )}
      <div>
        <Button type="primary" loading={busy} disabled={busy || (!canSave)} onClick={save}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}