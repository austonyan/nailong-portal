// 礼宾服务:礼遇类型、资格查询(居民/外交/邀请函)、礼遇申请与使用记录。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Title } from 'animal-island-ui';
import { BanIcon, SearchIcon, ShieldIcon, StarIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { StatusTag, TextArea, fmtDate, fmtDateTime, toastProtocolError } from './shared.jsx';
import { toastSuccess } from './shared.jsx';

const BASIS_TYPES = ['resident', 'diplomatic', 'invitation'];

export default function ProtocolCourtesy() {
  const { t } = useTranslation();
  const [types, setTypes] = useState([]);
  const [apps, setApps] = useState(null);
  const [basisType, setBasisType] = useState('invitation');
  const [basisNo, setBasisNo] = useState('');
  const [eligibility, setEligibility] = useState(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [typeCode, setTypeCode] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      const [typeData, appData] = await Promise.all([
        api.get('/protocol/courtesy/types'),
        api.get('/protocol/courtesy/applications'),
      ]);
      setTypes(typeData.items);
      setApps(appData.items);
      setTypeCode((prev) => prev || typeData.items[0]?.code || '');
    } catch (err) {
      toastProtocolError(t, err);
      setApps([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const check = async () => {
    if (!basisNo.trim()) return;
    try {
      const data = await api.post('/protocol/courtesy/eligibility', { basisType, basisNo: basisNo.trim() });
      setEligibility(data);
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      await api.post('/protocol/courtesy/applications', { typeCode, basisType, basisNo: basisNo.trim(), note });
      toastSuccess(t('protocol.courtesy.applySuccess'));
      setApplyOpen(false);
      setNote('');
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await api.post(`/protocol/courtesy/applications/${cancelTarget.id}/cancel`);
      toastSuccess(t('protocol.courtesy.cancelled'));
      setCancelTarget(null);
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('protocol.courtesy.title')}</Title>
        <p className="muted-text">{t('protocol.courtesy.subtitle')}</p>
      </div>

      <div className="protocol-courtesy-layout">
        <Card className="protocol-eligibility-card">
          <h4>{t('protocol.courtesy.eligibility')}</h4>
          <p className="muted-text">{t('protocol.courtesy.eligibilityTip')}</p>
          <div className="protocol-eligibility-form">
            <Select
              value={basisType}
              onChange={setBasisType}
              options={BASIS_TYPES.map((code) => ({ key: code, label: t(`protocol.basisType.${code}`) }))}
            />
            <Input
              value={basisNo}
              allowClear
              onChange={(e) => setBasisNo(e.target.value.toUpperCase())}
              placeholder={t(`protocol.courtesy.basisPlaceholder_${basisType}`)}
              onKeyDown={(e) => e.key === 'Enter' && check()}
            />
            <Button type="primary" icon={<SearchIcon />} onClick={check}>
              {t('protocol.courtesy.query')}
            </Button>
          </div>
          {eligibility && (
            <Card color={eligibility.valid ? 'app-teal' : 'app-red'}>
              <div className="protocol-inline-between">
                <div>
                  <strong>{eligibility.valid ? t('protocol.courtesy.eligible') : t('protocol.courtesy.notEligible')}</strong>
                  <p className="muted-text">
                    {t('protocol.courtesy.eligibilityStatus', { status: eligibility.status })}
                    {eligibility.status === 'reserved' ? ` · ${t('protocol.courtesy.reserved')}` : ''}
                  </p>
                </div>
                {eligibility.valid && (
                  <Button type="default" size="small" icon={<StarIcon />} onClick={() => setApplyOpen(true)}>
                    {t('protocol.courtesy.applyEntry')}
                  </Button>
                )}
              </div>
            </Card>
          )}
        </Card>

        <Card className="protocol-courtesy-rules">
          <h4>{t('protocol.courtesy.rules')}</h4>
          <p>{t('protocol.courtesy.rulesBody')}</p>
          <p className="muted-text">{t('protocol.courtesy.notPromise')}</p>
        </Card>
      </div>

      <section className="protocol-section">
        <Title size="middle" color="app-orange">{t('protocol.courtesy.types')}</Title>
        <div className="protocol-courtesy-grid">
          {types.map((tp) => (
            <Card key={tp.code} className="protocol-courtesy-card">
              <StarIcon size={24} />
              <h3>{tp.name}</h3>
              <p>{tp.description}</p>
              <small className="muted-text">{tp.requirements}</small>
              <Button type="dashed" size="small" onClick={() => { setTypeCode(tp.code); setApplyOpen(true); }}>
                {t('protocol.courtesy.applyEntry')}
              </Button>
            </Card>
          ))}
        </div>
      </section>

      <section className="protocol-section">
        <Title size="middle" color="app-blue">{t('protocol.courtesy.myTitle')}</Title>
        <Card>
          {apps && apps.length === 0 && <p className="muted-text">{t('protocol.courtesy.empty')}</p>}
          <div className="protocol-courtesy-apps">
            {(apps ?? []).map((app) => (
              <Card key={app.id} className="protocol-courtesy-app">
                <div className="protocol-inline-between">
                  <div>
                    <div className="protocol-inline-gap">
                      <strong>{app.appNo}</strong>
                      <StatusTag status={app.status} />
                    </div>
                    <p className="muted-text">
                      {app.typeName} · {t(`protocol.basisType.${app.basisType}`)} {app.basisNo}
                    </p>
                    <p className="muted-text">
                      {t('protocol.courtesy.validUntil')}: {fmtDate(app.validUntil)} · {fmtDateTime(app.submittedAt)}
                    </p>
                    {app.rejectComment && <p className="protocol-reject-text">{app.rejectComment}</p>}
                  </div>
                  {['pending_review', 'approved'].includes(app.status) && (
                    <Button type="text" size="small" danger icon={<BanIcon />} onClick={() => setCancelTarget(app)}>
                      {t('protocol.action.cancel')}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </Card>
      </section>

      <Modal
        open={applyOpen}
        title={t('protocol.courtesy.applyTitle')}
        onClose={() => setApplyOpen(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setApplyOpen(false)}>{t('protocol.action.back')}</Button>
            <Button type="primary" loading={busy} disabled={!basisNo.trim() || !typeCode} onClick={apply}>
              {t('protocol.action.submit')}
            </Button>
          </>
        }
      >
        <div className="protocol-modal-form">
          <label className="protocol-field">
            <span>{t('protocol.field.type')}</span>
            <Select value={typeCode} onChange={setTypeCode} options={types.map((tp) => ({ key: tp.code, label: tp.name }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.basis')}</span>
            <Input value={`${t(`protocol.basisType.${basisType}`)} · ${basisNo}`} disabled />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.note')}</span>
            <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('protocol.courtesy.notePlaceholder')} />
          </label>
        </div>
      </Modal>

      <Modal
        open={cancelTarget !== null}
        title={t('protocol.courtesy.cancelTitle')}
        onClose={() => setCancelTarget(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setCancelTarget(null)}>{t('protocol.action.back')}</Button>
            <Button type="primary" danger loading={busy} onClick={cancel}>
              {t('protocol.action.confirmCancel')}
            </Button>
          </>
        }
      >
        <p>{t('protocol.courtesy.cancelTip')}</p>
      </Modal>
    </div>
  );
}