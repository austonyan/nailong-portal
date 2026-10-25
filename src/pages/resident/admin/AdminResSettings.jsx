// 署内设置:编号规则、审核/补件参数、居民卡模板(水印/声明)与娱乐声明版本。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Notification, Tag, Title } from 'animal-island-ui';
import { api } from '../../../api/client.js';
import { ResAdminNav } from '../ResidentShell.jsx';
import { TextArea, toastResError } from '../shared.jsx';

// 可编辑配置(编号规则 + 流程参数);卡模板与声明单独成块。
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
      body['res.card_watermark'] = config['res.card_watermark'] ?? '';
      body['res.card_statement'] = config['res.card_statement'] ?? '';
      body['res.disclaimer_text'] = config['res.disclaimer_text'] ?? '';
      body['res.disclaimer_version'] = config['res.disclaimer_version'] ?? '1';
      await api.put('/resident/admin/config', body);
      Notification.success(t('common.save'));
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
        <Title size="middle">{t('res.admin.settings.title')}</Title>
      </div>

      <Card className="res-info-card">
        <h4>{t('res.admin.settings.numberingTitle')}</h4>
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

      <Card className="res-info-card">
        <h4>{t('res.admin.settings.templateTitle')}</h4>
        <div className="res-type-form">
          <label>
            <span>{t('res.admin.settings.watermark')}</span>
            <Input size="large" value={config['res.card_watermark'] ?? ''} onChange={(e) => setField('res.card_watermark', e.target.value)} />
          </label>
          <label>
            <span>{t('res.admin.settings.statement')}</span>
            <TextArea rows={3} maxLength={300} value={config['res.card_statement'] ?? ''} onChange={(e) => setField('res.card_statement', e.target.value)} />
          </label>
        </div>
      </Card>

      <Card className="res-info-card">
        <h4>{t('res.admin.settings.disclaimerTitle')}</h4>
        <p className="muted-text">{t('res.admin.settings.disclaimerTip')}</p>
        <div className="res-type-form">
          <div className="res-disclaimer-version">
            <span>{t('res.admin.settings.disclaimerVersion')}</span>
            <Tag color="app-yellow" variant="soft">
              v{config['res.disclaimer_version'] || '1'}
            </Tag>
            <Input size="large" value={config['res.disclaimer_version'] ?? ''} onChange={(e) => setField('res.disclaimer_version', e.target.value)} />
          </div>
          <label>
            <span>{t('res.admin.settings.disclaimerText')}</span>
            <TextArea rows={4} maxLength={500} value={config['res.disclaimer_text'] ?? ''} onChange={(e) => setField('res.disclaimer_text', e.target.value)} />
          </label>
        </div>
      </Card>

      <div className="res-guide-actions">
        <Button type="primary" loading={busy} onClick={save}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
