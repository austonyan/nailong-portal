// 数据删除/注销申请 — 选择范围 + 影响说明 + 弹窗内二次确认,提交后跟踪进度。
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Checkbox, Modal, Table, Tag, Title } from 'animal-island-ui';
import { ShieldIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { ArchNav, RequestStatusTag, TextArea, fmtDateTime, toastArchError } from './shared.jsx';
import { toastSuccess } from '../../components/toast.js';

const ACTIVE_STATUSES = ['pending', 'reviewing', 'executing'];

export default function ArchRequests() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [types, setTypes] = useState([]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState([]);
  const [impact, setImpact] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .get('/archives/deletion-requests')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastArchError(err);
        setItems([]);
      });
    api
      .get('/archives/overview')
      .then((data) => setTypes((data.recordTypes ?? []).filter((type) => type.included)))
      .catch(() => setTypes([]));
  }, []);

  useEffect(load, [load]);

  const active = (items ?? []).find((item) => ACTIVE_STATUSES.includes(item.status));

  const openForm = () => {
    setStep(1);
    setSelected([]);
    setImpact('');
    setReason('');
    setError('');
    setOpen(true);
  };

  const closeForm = () => {
    if (busy) return;
    setOpen(false);
    setStep(1);
  };

  const goConfirm = () => {
    if (!selected.length) {
      setError(t('arch.request.scopeRequired'));
      return;
    }
    if (impact.trim().length < 5) {
      setError(t('arch.request.impactRequired'));
      return;
    }
    setError('');
    setStep(2);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/archives/deletion-requests', {
        types: selected,
        impact: impact.trim(),
        reason: reason.trim(),
        confirm: true,
      });
      setOpen(false);
      setStep(1);
      toastSuccess(t('arch.request.submitted'));
      load();
    } catch (err) {
      toastArchError(err);
    } finally {
      setBusy(false);
    }
  };

  const scopeLabel = (request) =>
    (request.scopeTypes ?? []).map((type) => type.name).join('、') || request.scope.join(', ');

  const columns = [
    { title: t('arch.request.no'), dataIndex: 'no', width: 190 },
    { title: t('arch.request.scope'), dataIndex: 'scope', width: 200, render: (_, record) => scopeLabel(record) },
    { title: t('common.status'), dataIndex: 'status', width: 110, render: (v) => <RequestStatusTag value={v} /> },
    { title: t('common.createdAt'), dataIndex: 'createdAt', width: 160, render: (v) => fmtDateTime(v) },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 110,
      render: (_, record) => (
        <div className="table-actions">
          <Link to={`/archives/requests/${record.id}`}>
            <Button type="default" size="small">
              {t('arch.request.progress')}
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  const selectedNames = types.filter((type) => selected.includes(type.code)).map((type) => type.name);

  return (
    <div className="arch-page">
      <ArchNav />
      <div className="page-header">
        <Title size="middle" color="brown">
          {t('arch.request.title')}
        </Title>
        <Button type="primary" icon={<TrashIcon />} onClick={openForm} disabled={!!active}>
          {t('arch.request.new')}
        </Button>
      </div>

      {active && (
        <Card color="app-yellow" className="arch-tag-row">
          <ShieldIcon size={18} />
          <span>{t('arch.request.activeTip')}</span>
          <RequestStatusTag value={active.status} />
          <Link to={`/archives/requests/${active.id}`}>
            <Button type="text" size="small">
              {t('arch.home.viewProgress')}
            </Button>
          </Link>
        </Card>
      )}

      <Card>
        <p className="arch-note arch-form-tip">{t('arch.request.processTip')}</p>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={{ defaultPageSize: 10, showTotal: true }}
          emptyText={t('arch.request.empty')}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={open}
        title={step === 1 ? t('arch.request.new') : t('arch.request.confirmTitle')}
        onClose={closeForm}
        typewriter={false}
        width={560}
        footer={
          step === 1 ? (
            <>
              <Button disabled={busy} onClick={closeForm}>
                {t('common.cancel')}
              </Button>
              <Button type="primary" onClick={goConfirm}>
                {t('arch.request.next')}
              </Button>
            </>
          ) : (
            <>
              <Button disabled={busy} onClick={() => setStep(1)}>
                {t('arch.request.back')}
              </Button>
              <Button type="primary" danger loading={busy} disabled={busy} onClick={submit}>
                {t('arch.request.confirmSubmit')}
              </Button>
            </>
          )
        }
      >
        {step === 1 ? (
          <>
            <p className="arch-note">{t('arch.request.scopeTip')}</p>
            <p className="arch-field-label">{t('arch.request.scope')}</p>
            <Checkbox
              options={types.map((type) => ({ label: type.name, value: type.code }))}
              value={selected}
              onChange={(values) => setSelected(values.map(String))}
              direction="vertical"
            />
            <p className="arch-field-label">
              {t('arch.request.impact')} <Tag color="app-red" variant="soft" size="small">{t('common.required')}</Tag>
            </p>
            <TextArea value={impact} onChange={(e) => setImpact(e.target.value)} placeholder={t('arch.request.impactPlaceholder')} maxLength={500} />
            <p className="arch-field-label">{t('arch.request.reason')}</p>
            <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('arch.request.reasonPlaceholder')} maxLength={500} />
            {error && <p className="arch-error">{error}</p>}
          </>
        ) : (
          <div className="arch-summary">
            <p>{t('arch.request.confirmBody')}</p>
            <div className="arch-summary-row">
              <span>{t('arch.request.scope')}</span>
              <span>{selectedNames.join('、')}</span>
            </div>
            <div className="arch-summary-row">
              <span>{t('arch.request.impact')}</span>
              <span>{impact}</span>
            </div>
            {reason.trim() && (
              <div className="arch-summary-row">
                <span>{t('arch.request.reason')}</span>
                <span>{reason}</span>
              </div>
            )}
            <p className="arch-note">{t('arch.request.confirmNote')}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}