import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Switch, Table, Tag, Title } from 'animal-island-ui';
import { BanIcon, PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import AutoApproveSettings from '../../../components/AutoApproveSettings.jsx';
import { toastSuccess, toastError } from '../../../components/toast.js';
import { fmtDate } from '../../../lib/date.js';

export default function DocsSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState({});
  const [blacklist, setBlacklist] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ userId: '', reason: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, b] = await Promise.all([api.get('/docs/admin/config'), api.get('/docs/admin/blacklist')]);
      const map = {};
      for (const item of c.items) map[item.key] = item.value;
      setConfig(map);
      setBlacklist(b.items);
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const setKey = (key, value) => setConfig((c) => ({ ...c, [key]: value }));

  const save = async () => {
    setBusy(true);
    try {
      const body = {};
      for (const [k, v] of Object.entries(config)) body[k] = v;
      body['docs.seal_enabled'] = config['docs.seal_enabled'] === '1' || config['docs.seal_enabled'] === true;
      await api.patch('/docs/admin/config', body);
      toastSuccess(t('common.save'));
      load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
    } finally {
      setBusy(false);
    }
  };

  const addToBlacklist = async () => {
    if (!addForm.userId.trim() || !Number(addForm.userId)) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      await api.post('/docs/admin/blacklist', { userId: Number(addForm.userId), reason: addForm.reason });
      toastSuccess(t('common.save'));
      setAddOpen(false);
      setAddForm({ userId: '', reason: '' });
      load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
    } finally {
      setBusy(false);
    }
  };

  const removeFromBlacklist = async (row) => {
    try {
      await api.del(`/docs/admin/blacklist/${row.userId}`);
      toastSuccess(t('common.deleted'));
      load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
    }
  };

  const numField = (key, label, hint) => (
    <label className="docs-field">
      <span className="docs-field-label">{label}</span>
      <Input type="number" value={config[key] ?? ''} onChange={(e) => setKey(key, e.target.value)} />
      {hint && <span className="muted-text docs-field-hint">{hint}</span>}
    </label>
  );

  const textField = (key, label, hint, max = 60) => (
    <label className="docs-field">
      <span className="docs-field-label">{label}</span>
      <Input value={config[key] ?? ''} onChange={(e) => setKey(key, e.target.value)} maxLength={max} />
      {hint && <span className="muted-text docs-field-hint">{hint}</span>}
    </label>
  );

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('docs.admin.settings.title')}</Title>
        <Button type="primary" loading={busy} onClick={save} disabled={busy}>
          {t('common.save')}
        </Button>
      </div>

      <Card className="docs-block">
        <AutoApproveSettings service="docs" />
      </Card>

      <Card className="docs-block">
        <h3 className="docs-block-title">{t('docs.admin.settings.numbering')}</h3>
        <div className="docs-editor-grid">
          {textField('docs.app_no_prefix', t('docs.admin.settings.appPrefix'), t('docs.admin.settings.prefixTip'), 8)}
          {textField('docs.cert_no_prefix', t('docs.admin.settings.certPrefix'), t('docs.admin.settings.prefixTip'), 8)}
          {numField('docs.supplement_days', t('docs.admin.settings.supplementDays'))}
          {numField('docs.review_hours_hint', t('docs.admin.settings.reviewHours'))}
          {numField('docs.apply_daily_limit', t('docs.admin.settings.applyDailyLimit'))}
          {numField('docs.upload_max_mb', t('docs.admin.settings.uploadMaxMb'))}
        </div>
      </Card>

      <Card className="docs-block">
        <h3 className="docs-block-title">{t('docs.admin.settings.verifySection')}</h3>
        <div className="docs-editor-grid">
          {numField('docs.verify_limit_per_5min', t('docs.admin.settings.verifyLimit'), t('docs.admin.settings.verifyLimitTip'))}
          <label className="docs-field">
            <span className="docs-field-label">{t('docs.admin.settings.seal')}</span>
            <Switch checked={config['docs.seal_enabled'] === '1' || config['docs.seal_enabled'] === true} onChange={(v) => setKey('docs.seal_enabled', v ? '1' : '0')} />
          </label>
          {textField('docs.issuer_name', t('docs.admin.settings.issuer'), '', 60)}
          {textField('docs.issuer_name_tw', `${t('docs.admin.settings.issuer')} · ${t('common.traditional')}`, t('common.twOptional'), 60)}
        </div>
      </Card>

      <Card className="docs-block">
        <div className="page-header">
          <h3 className="docs-block-title">{t('docs.admin.settings.riskTitle')}</h3>
          <Button icon={<PlusIcon />} onClick={() => { setAddForm({ userId: '', reason: '' }); setAddOpen(true); }}>
            {t('docs.admin.settings.blacklistAdd')}
          </Button>
        </div>
        <p className="muted-text">{t('docs.admin.settings.riskTip')}</p>
        <Table className="table-fit"
          columns={[
            { title: t('docs.admin.settings.blacklistUser'), dataIndex: 'username', width: 140 },
            { title: t('docs.admin.settings.blacklistReason'), dataIndex: 'reason' },
            { title: t('docs.admin.settings.blacklistBy'), dataIndex: 'createdBy', width: 130 },
            { title: t('common.createdAt'), dataIndex: 'createdAt', width: 110, render: (v) => fmtDate(v) },
            {
              title: t('common.actions'),
              width: 90,
              render: (_, row) => (
                <Button size="small" danger icon={<TrashIcon />} onClick={() => removeFromBlacklist(row)}>
                  {t('docs.admin.settings.blacklistRemove')}
                </Button>
              ),
            },
          ]}
          dataSource={blacklist}
          rowKey="id"
          emptyText={t('docs.admin.settings.blacklistEmpty')}
          pagination={false}
        />
      </Card>

      <Modal
        open={addOpen}
        title={t('docs.admin.settings.blacklistAdd')}
        typewriter={false}
        onClose={() => {
          if (!busy) setAddOpen(false);
        }}
        maskClosable={false}
        footer={
          <>
            <Button onClick={() => setAddOpen(false)} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" danger loading={busy} disabled={busy || !addForm.userId.trim() || !Number(addForm.userId)} icon={<BanIcon />} onClick={addToBlacklist}>
              {t('docs.admin.settings.blacklistAdd')}
            </Button>
          </>
        }
      >
        <div className="docs-field-col">
          <label className="docs-field">
            <span className="docs-field-label">{t('docs.admin.settings.blacklistUserId')}</span>
            <Input type="number" value={addForm.userId} onChange={(e) => setAddForm((f) => ({ ...f, userId: e.target.value }))} />
          </label>
          <label className="docs-field docs-field-wide">
            <span className="docs-field-label">{t('docs.admin.settings.blacklistReason')}</span>
            <Input value={addForm.reason} onChange={(e) => setAddForm((f) => ({ ...f, reason: e.target.value }))} maxLength={200} />
          </label>
          <p className="muted-text">
            <Tag size="small" color="app-orange" variant="soft">
              {t('docs.admin.settings.blacklistEffectTag')}
            </Tag>
            {t('docs.admin.settings.blacklistEffect')}
          </p>
        </div>
      </Modal>
    </div>
  );
}
