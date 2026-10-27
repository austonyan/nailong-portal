// 外交署配置: 建交对象类型 / 建交类型 / 外交身份类型 / 礼遇类型 + 全局设置
// (编号规则、补件天数、限流)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Switch, Table, Tag, Title } from 'animal-island-ui';
import { api } from '../../../api/client.js';
import AutoApproveSettings from '../../../components/AutoApproveSettings.jsx';
import { DipAdminNav, TextArea, toastDipError } from '../../../components/dip/shared.jsx';
import { toastSuccess, toastError } from '../../../components/toast.js';

function TypeEditModal({ kind, initial, onClose, onSaved }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.nameCn ?? initial?.name ?? '');
  const [nameTw, setNameTw] = useState(initial?.nameTw ?? '');
  const [description, setDescription] = useState(initial?.descriptionCn ?? initial?.description ?? '');
  const [descriptionTw, setDescriptionTw] = useState(initial?.descriptionTw ?? '');
  const [guide, setGuide] = useState(initial?.guideCn ?? initial?.guide ?? '');
  const [guideTw, setGuideTw] = useState(initial?.guideTw ?? '');
  const [validityDays, setValidityDays] = useState(String(initial?.validity_days ?? 365));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        nameTw: nameTw.trim(),
        description,
        descriptionTw,
        guide,
        guideTw,
      };
      if (kind === 'relation') payload.validityDays = Number(validityDays) || 365;
      await api.patch(`/dip/admin/config/types/${kind}/${initial.id}`, payload);
      toastSuccess(t('common.save'));
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
      maskClosable={false}
      open
      title={`${t('dip.config.editType')} · ${initial.code}`}
      onClose={onClose}
      typewriter={false}
      width={540}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button type="primary" loading={busy} disabled={busy || !name.trim()} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="dip-config-form">
        <p className="dip-info-row"><span className="dip-info-label">{t('common.name')}</span><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></p>
        <p className="dip-info-row"><span className="dip-info-label">{t('common.name')} · {t('common.traditional')}</span><Input value={nameTw} placeholder={t('common.twOptional')} onChange={(e) => setNameTw(e.target.value)} maxLength={40} /></p>
        <p className="dip-info-row"><span className="dip-info-label">{t('common.description')}</span><Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} /></p>
        <p className="dip-info-row"><span className="dip-info-label">{t('common.description')} · {t('common.traditional')}</span><Input value={descriptionTw} placeholder={t('common.twOptional')} onChange={(e) => setDescriptionTw(e.target.value)} maxLength={200} /></p>
        {kind === 'relation' && (
          <p className="dip-info-row"><span className="dip-info-label">{t('dip.config.validityDays')}</span><Input value={validityDays} onChange={(e) => setValidityDays(e.target.value.replace(/\D/g, ''))} /></p>
        )}
        <p className="dip-config-guide">
          <span className="dip-info-label">{t('dip.config.guide')}</span>
          <TextArea rows={5} value={guide} onChange={(e) => setGuide(e.target.value)} maxLength={1000} placeholder={t('dip.config.guideTip')} />
        </p>
        <p className="dip-config-guide">
          <span className="dip-info-label">{t('dip.config.guide')} · {t('common.traditional')}</span>
          <TextArea rows={5} value={guideTw} onChange={(e) => setGuideTw(e.target.value)} maxLength={1000} placeholder={t('common.twOptional')} />
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
];

export default function AdminDipConfig() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [editType, setEditType] = useState(null); // { kind, row }
  const [settings, setSettings] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get('/dip/admin/config')
      .then((d) => {
        setData(d);
        const map = {};
        for (const s of d.settings ?? []) map[s.key] = s.value;
        setSettings(map);
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
      await api.put('/dip/admin/config/settings', { items });
      toastSuccess(t('common.save'));
      load();
    } catch (err) {
      toastDipError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const typeTable = (kind, rows) => (
    <Table className="table-fit"
      columns={[
        { title: t('common.key'), dataIndex: 'code', width: 160 },
        { title: t('common.name'), dataIndex: 'name', width: 130 },
        { title: t('common.description'), dataIndex: 'description', style: { maxWidth: 320 } },
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
        <AutoApproveSettings service="dip" />
      </Card>

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
        <Table className="table-fit"
          columns={[
            { title: t('common.key'), dataIndex: 'code', width: 160 },
            { title: t('common.name'), dataIndex: 'name', width: 140 },
            { title: t('common.description'), dataIndex: 'description', style: { maxWidth: 320 } },
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
        <div className="dip-form-actions">
          <Button type="primary" loading={busy} onClick={saveSettings} disabled={busy}>{t('common.save')}</Button>
        </div>
      </Card>

      {editType !== null && <TypeEditModal kind={editType.kind} initial={editType.row} onClose={() => setEditType(null)} onSaved={load} />}
    </div>
  );
}
