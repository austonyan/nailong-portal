// 署内设置:编号规则、审核/补件参数。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Title } from 'animal-island-ui';
import { api } from '../../../api/client.js';
import AutoApproveSettings from '../../../components/AutoApproveSettings.jsx';
import { ResAdminNav } from '../ResidentShell.jsx';
import { toastResError } from '../shared.jsx';
import { toastSuccess } from '../../../components/toast.js';

// 可编辑配置(编号规则 + 流程参数)。
const CONFIG_FIELDS = [
  { key: 'res.app_no_prefix', label: 'res.admin.settings.appPrefix' },
  { key: 'res.card_no_prefix', label: 'res.admin.settings.cardPrefix' },
  { key: 'res.change_no_prefix', label: 'res.admin.settings.changePrefix' },
  { key: 'res.supplement_days', label: 'res.admin.settings.supplementDays' },
  { key: 'res.review_hours_hint', label: 'res.admin.settings.reviewHours' },
  { key: 'res.max_active_applications', label: 'res.admin.settings.maxActive' },
  { key: 'res.one_identity_per_account', label: 'res.admin.settings.oneIdentity' },
];

export default function AdminResSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/resident/admin/config');
      const map = {};
      for (const row of data.items) map[row.key] = row.value;
      setConfig(map);
    } catch (err) {
      toastResError(t, err);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const body = {};
      for (const field of CONFIG_FIELDS) body[field.key] = config[field.key] ?? '';
      await api.put('/resident/admin/config', body);
      toastSuccess(t('common.save'));
      load();
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const setField = (key, value) => setConfig((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="res-admin-page">
      <ResAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('res.admin.settings.title')}</Title>
        </h1>
      </div>

      <Card className="res-info-card">
        <AutoApproveSettings service="resident" />
      </Card>

      <Card className="res-info-card">
        <h2>{t('res.admin.settings.numberingTitle')}</h2>
        <p className="muted-text">{t('res.admin.settings.numberingTip')}</p>
        <div className="res-config-grid">
          {CONFIG_FIELDS.map((field) => (
            <label key={field.key}>
              <span>{t(field.label)}</span>
              <Input size="large" value={config[field.key] ?? ''} onChange={(e) => setField(field.key, e.target.value)} />
            </label>
          ))}
        </div>
      </Card>

      <div className="res-guide-actions">
        <Button type="primary" loading={busy} onClick={save} disabled={busy}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
