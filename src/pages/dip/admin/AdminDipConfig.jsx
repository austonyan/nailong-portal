// 外交署配置: 建交对象类型 / 建交类型 / 外交身份类型 / 礼遇类型 + 全局设置
// (编号规则、补件天数、限流、声明文本、水印)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Notification, Switch, Table, Tag, Title } from 'animal-island-ui';
import { api } from '../../../api/client.js';
import { DipAdminNav, TextArea, toastDipError } from '../../../components/dip/shared.jsx';

function TypeEditModal({ kind, initial, onClose, onSaved }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [guide, setGuide] = useState(initial?.guide ?? '');
  const [validityDays, setValidityDays] = useState(String(initial?.validity_days ?? 365));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const payload = { name: name.trim(), description, guide };
      if (kind === 'relation') payload.validityDays = Number(validityDays) || 365;
      await api.patch(`/dip/admin/config/types/${kind}/${initial.id}`, payload);
      Notification.success(t('common.save'));
      onSaved();
      onClose();
    } catch (err) {
      toastDipError(t, err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`${t('dip.config.editType')} · ${initial.code}`}
      onClose={onClose}
      typewriter={false}
      width={540}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" loading={busy} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="dip-config-form">
        <p className="dip-info-row"><span className="dip-info-label">{t('common.name')}</span><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></p>
        <p className="dip-info-row"><span className="dip-info-label">{t('common.description')}</span><Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} /></p>
        {kind === 'relation' && (
          <p className="dip-info-row"><span className="dip-info-label">{t('dip.config.validityDays')}</span><Input value={validityDays} onChange={(e) => setValidityDays(e.target.value.replace(/\D/g, ''))} /></p>
        )}
        <p className="dip-config-guide">
          <span className="dip-info-label">{t('dip.config.guide')}</span>
          <TextArea rows={5} value={guide} onChange={(e) => setGuide(e.target.value)} maxLength={1000} placeholder={t('dip.config.guideTip')} />
        </p>
      </div>
    </Modal>
  );
}

const SETTINGS_ROWS = [
  { key: 'relation_no_prefix', label: 'dip.config.prefixRelation' },
  { key: 'identity_no_prefix', label: 'dip.config.prefixIdentity' },
  { key: 'agreement_no_prefix', label: 'dip.config.prefixAgreement' },
  { key: 'supplement_days', label: 'dip.config.supplementDays' },
  { key: 'review_hours_hint', label: 'dip.config.reviewHours' },
  { key: 'verify_limit_per_5min', label: 'dip.config.verifyLimit' },
  { key: 'max_identities_per_user', label: 'dip.config.maxIdentities' },
  { key: 'watermark_text', label: 'dip.config.watermark' },
];

export default function AdminDipConfig() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [editType, setEditType] = useState(null); // { kind, row }
  const [settings, setSettings] = useState({});
  const [disclaimerText, setDisclaimerText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get('/dip/admin/config')
      .then((d) => {
        setData(d);
        const map = {};
        for (const s of d.settings ?? []) map[s.key] = s.value;
        setSettings(map);
        setDisclaimerText(map.disclaimer_text ?? '');
      })
      .catch((err) => toastDipError(t, err));
  }, [t]);

  useEffect(load, [load]);

  const toggleEnabled = async (kind, row, enabled) => {
    try {
      if (kind === 'courtesy') await api.patch(`/dip/admin/config/courtesies/${row.id}`, { enabled });
      else await api.patch(`/dip/admin/config/types/${kind}/${row.id}`, { enabled });
      load();
    } catch (err) {
      toastDipError(t, err);
    }
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      const items = SETTINGS_ROWS.map((r) => ({ key: r.key, value: settings[r.key] ?? '' }));
      items.push({ key: 'disclaimer_text', value: disclaimerText });
      await api.put('/dip/admin/config/settings', { items });
      Notification.success(t('common.save'));
      load();
    } catch (err) {
      toastDipError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const typeTable = (kind, rows) => (
    <Table
      columns={[
        { title: t('common.key'), dataIndex: 'code', width: 160 },
        { title: t('common.name'), dataIndex: 'name', width: 130 },
        { title: t('common.description'), dataIndex: 'description', ellipsis: true },
        ...(kind === 'relation' ? [{ title: t('dip.config.validityDays'), dataIndex: 'validity_days', width: 100 }] : []),
        {
          title: t('common.status'),
          dataIndex: 'enabled',
          width: 100,
          render: (v, r) => (
            <span className="dip-switch-row">
              <Switch checked={!!v} size="small" onChange={(next) => toggleEnabled(kind, r, next)} />
              <Tag size="small" color={v ? 'app-green' : 'default'} variant="soft">{v ? t('dip.config.open') : t('dip.config.closed')}</Tag>
            </span>
          ),
        },
        { title: t('common.actions'), width: 90, render: (_, r) => <Button size="small" onClick={() => setEditType({ kind, row: r })}>{t('common.edit')}</Button> },
      ]}
      dataSource={rows}
      rowKey="id"
      pagination={false}
      size="small"
    />
  );

  if (!data) {
    return (
      <div className="dip-page">
        <DipAdminNav />
        <p className="muted-text">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="dip-page">
      <DipAdminNav />
      <div className="page-header">
        <Title size="middle" color="purple">{t('dip.config.title')}</Title>
      </div>

      <Card>
        <Title size="small">{t('dip.config.objectTypes')}</Title>
        {typeTable('object', data.objectTypes)}
      </Card>
      <Card>
        <Title size="small">{t('dip.config.relationTypes')}</Title>
        {typeTable('relation', data.relationTypes)}
      </Card>
      <Card>
        <Title size="small">{t('dip.config.identityTypes')}</Title>
        {typeTable('identity', data.identityTypes)}
      </Card>
      <Card>
        <Title size="small">{t('dip.config.courtesyTypes')}</Title>
        <Table
          columns={[
            { title: t('common.key'), dataIndex: 'code', width: 160 },
            { title: t('common.name'), dataIndex: 'name', width: 140 },
            { title: t('common.description'), dataIndex: 'description', ellipsis: true },
            {
              title: t('common.status'),
              dataIndex: 'enabled',
              width: 100,
              render: (v, r) => (
                <Switch checked={!!v} size="small" onChange={(next) => toggleEnabled('courtesy', r, next)} />
              ),
            },
          ]}
          dataSource={data.courtesyTypes}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>

      <Card>
        <Title size="small">{t('dip.config.settings')}</Title>
        <div className="dip-settings-grid">
          {SETTINGS_ROWS.map((r) => (
            <label key={r.key} className="dip-setting-row">
              <span>{t(r.label)}</span>
              <Input value={settings[r.key] ?? ''} onChange={(e) => setSettings((s) => ({ ...s, [r.key]: e.target.value }))} maxLength={120} />
            </label>
          ))}
        </div>
        <p className="dip-config-guide">
          <span className="dip-info-label">{t('dip.config.disclaimerText')}</span>
          <TextArea rows={4} value={disclaimerText} onChange={(e) => setDisclaimerText(e.target.value)} maxLength={500} />
        </p>
        <div className="dip-form-actions">
          <Button type="primary" loading={busy} onClick={saveSettings}>{t('common.save')}</Button>
        </div>
      </Card>

      {editType !== null && <TypeEditModal kind={editType.kind} initial={editType.row} onClose={() => setEditType(null)} onSaved={load} />}
    </div>
  );
}
