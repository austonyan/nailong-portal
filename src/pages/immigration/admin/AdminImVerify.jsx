import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Table, Tag, Title } from 'animal-island-ui';
import { CheckCircleIcon, SearchIcon, ShieldIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastApiError } from '../../../components/immigration/apiError.js';
import { ImAdminNav, StatusTag } from '../../../components/immigration/shared.jsx';
import { toastSuccess, toastWarning, toastInfo } from '../../../components/toast.js';
import { fmtDateTime } from '../../../lib/date.js';

const RESULT_COLORS = {
  accepted: 'app-green',
  used: 'app-green',
  expired: 'brown',
  voided: 'app-red',
  unknown: 'brown',
  port_closed: 'brown',
  visa_blocked: 'app-red',
};

export default function AdminImVerify() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [verifying, setVerifying] = useState(null); // pass code row about to verify
  const [voiding, setVoiding] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState(null);

  const loadChecks = useCallback(() => {
    api
      .get('/immigration/admin/pass-checks?pageSize=20')
      .then((data) => setChecks(data.items))
      .catch(() => setChecks([]));
  }, []);

  useEffect(loadChecks, [loadChecks]);

  const search = async () => {
    const codeNo = q.trim().toUpperCase();
    if (!codeNo) {
      toastWarning(t('imm.admin.verify.inputFirst'));
      return;
    }
    try {
      const data = await api.get(`/immigration/admin/pass-codes?q=${encodeURIComponent(codeNo)}`);
      setResults(data.items);
      if (data.items.length === 0) toastInfo(t('imm.admin.verify.notFound'));
    } catch (err) {
      toastApiError(err);
    }
  };

  const doVerify = async () => {
    setBusy(true);
    try {
      const data = await api.post('/immigration/admin/pass-codes/verify', { codeNo: verifying.code_no });
      if (data.result === 'accepted') {
        toastSuccess(t('imm.admin.verify.accepted', { no: data.entryRecordNo }));
      } else {
        toastWarning(t(`imm.admin.verify.result.${data.result}`, { defaultValue: data.result }));
      }
      setVerifying(null);
      search();
      loadChecks();
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const doVoid = async () => {
    setBusy(true);
    try {
      await api.post(`/immigration/admin/pass-codes/${voiding.id}/void`, { reason: voidReason });
      toastSuccess(t('common.save'));
      setVoiding(null);
      setVoidReason('');
      search();
      loadChecks();
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const checkColumns = [
    { title: t('imm.pass.codeNo'), dataIndex: 'codeNo', width: 190 },
    { title: t('imm.admin.verify.resultTitle'), dataIndex: 'result', width: 120, render: (v) => <Tag color={RESULT_COLORS[v] ?? 'brown'} variant="soft">{t(`imm.admin.verify.result.${v}`, { defaultValue: v })}</Tag> },
    { title: t('imm.admin.review.opinion'), dataIndex: 'note', render: (v) => v || '-' },
    { title: t('imm.admin.verify.officer'), dataIndex: 'officer', width: 110, render: (v) => v ?? '-' },
    { title: t('common.createdAt'), dataIndex: 'createdAt', width: 160, render: (v) => fmtDateTime(v) },
  ];

  return (
    <div className="im-page">
      <ImAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-teal">
            {t('imm.admin.verify.workbenchTitle')}
          </Title>
        </h1>
      </div>

      <Card>
        <div className="im-verify-toolbar">
          <Input
            size="large"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('imm.admin.verify.queryPlaceholder')}
            aria-label={t('imm.admin.verify.queryPlaceholder')}
            allowClear
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <Button type="primary" icon={<SearchIcon />} onClick={search}>{t('imm.admin.verify.query')}</Button>
        </div>

        {results !== null && results.length > 0 && (
          <div className="im-verify-results">
            {results.map((r) => (
              <Card key={r.id} className="im-verify-card-row">
                <div className="im-verify-card-head">
                  <b>{r.code_no}</b>
                  <StatusTag value={r.effectiveStatus} />
                </div>
                <p>
                  {t('imm.mydecl.no')}: {r.declaration_no} · {t('imm.declare.nickname')}: {r.nickname} · {r.port_name}
                </p>
                <p className="muted-text">
                  {t('imm.pass.validUntil')}: {r.valid_until ? fmtDateTime(r.valid_until) : '-'}
                  {r.void_reason ? ` · ${t('imm.admin.verify.voidReason')}: ${r.void_reason}` : ''}
                </p>
                <div className="table-actions">
                  <Button
                    type="primary"
                    size="small"
                    icon={<CheckCircleIcon />}
                    disabled={r.effectiveStatus !== 'unused'}
                    onClick={() => setVerifying(r)}
                  >
                    {t('imm.admin.verify.accept')}
                  </Button>
                  <Button
                    type="default"
                    danger
                    size="small"
                    icon={<ShieldIcon />}
                    disabled={r.status !== 'unused'}
                    onClick={() => setVoiding(r)}
                  >
                    {t('imm.admin.verify.void')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      <Card className="im-checks-card">
        <b>{t('imm.admin.verify.checkLog')}</b>
        <Table className="table-fit" columns={checkColumns} dataSource={checks ?? []} loading={checks === null} rowKey="id" pagination={{ defaultPageSize: 10, showTotal: true }} />
      </Card>

      <Modal
        maskClosable={false}
        open={verifying !== null}
        title={t('imm.admin.verify.confirmTitle', { no: verifying?.code_no })}
        onClose={() => setVerifying(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setVerifying(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={doVerify}>{t('imm.admin.verify.accept')}</Button>
          </>
        }
      >
        <p>{t('imm.admin.verify.confirmTip', { no: verifying?.declaration_no })}</p>
        <p className="muted-text">{t('imm.admin.verify.confirmTip2')}</p>
      </Modal>

      <Modal
        open={voiding !== null}
        title={t('imm.admin.verify.voidTitle', { no: voiding?.code_no })}
        onClose={() => {
          if (!busy) {
            setVoiding(null);
            setVoidReason('');
          }
        }}
        maskClosable={false}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => { setVoiding(null); setVoidReason(''); }} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" danger loading={busy} disabled={busy || !voidReason.trim()} onClick={doVoid}>{t('imm.admin.verify.void')}</Button>
          </>
        }
      >
        <p className="im-field-label">{t('imm.admin.verify.voidReason')}</p>
        <Input size="large" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} maxLength={120} placeholder={t('imm.admin.verify.voidReasonPlaceholder')} />
      </Modal>
    </div>
  );
}
