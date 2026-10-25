import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Notification, Table, Tag, Title } from 'animal-island-ui';
import { CheckCircleIcon, SearchIcon, ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastApiError } from '../../components/immigration/apiError.js';
import { ImAdminNav, StatusTag } from '../../components/immigration/shared.jsx';

const RESULT_COLORS = {
  accepted: 'app-green',
  used: 'app-blue',
  expired: 'default',
  voided: 'app-red',
  unknown: 'default',
  port_closed: 'app-orange',
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
      Notification.warning(t('imm.verify.inputFirst'));
      return;
    }
    try {
      const data = await api.get(`/immigration/admin/pass-codes?q=${encodeURIComponent(codeNo)}`);
      setResults(data.items);
      if (data.items.length === 0) Notification.info(t('imm.verify.notFound'));
    } catch (err) {
      toastApiError(err);
    }
  };

  const doVerify = async () => {
    setBusy(true);
    try {
      const data = await api.post('/immigration/admin/pass-codes/verify', { codeNo: verifying.code_no });
      if (data.result === 'accepted') {
        Notification.success(t('imm.verify.accepted', { no: data.entryRecordNo }));
      } else {
        Notification.warning(t(`imm.verify.result.${data.result}`, { defaultValue: data.result }));
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
      Notification.success(t('common.save'));
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
    { title: t('imm.verify.result'), dataIndex: 'result', width: 120, render: (v) => <Tag color={RESULT_COLORS[v] ?? 'default'} variant="soft">{t(`imm.verify.result.${v}`, { defaultValue: v })}</Tag> },
    { title: t('imm.review.opinion'), dataIndex: 'note', render: (v) => v || '-' },
    { title: t('imm.verify.officer'), dataIndex: 'officer', width: 110, render: (v) => v ?? '-' },
    { title: t('common.createdAt'), dataIndex: 'createdAt', width: 160, render: (v) => v?.slice(0, 16).replace('T', ' ') },
  ];

  return (
    <div className="im-page">
      <ImAdminNav />
      <div className="page-header">
        <Title size="middle" color="app-teal">
          {t('imm.verify.workbenchTitle')}
        </Title>
      </div>

      <Card>
        <div className="im-verify-toolbar">
          <Input
            size="large"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('imm.verify.queryPlaceholder')}
            allowClear
          />
          <Button type="primary" icon={<SearchIcon />} onClick={search}>{t('imm.verify.query')}</Button>
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
                  {t('imm.pass.validUntil')}: {r.valid_until?.slice(0, 16).replace('T', ' ')}
                  {r.void_reason ? ` · ${t('imm.verify.voidReason')}: ${r.void_reason}` : ''}
                </p>
                <div className="table-actions">
                  <Button
                    type="primary"
                    size="small"
                    icon={<CheckCircleIcon />}
                    disabled={r.effectiveStatus !== 'unused'}
                    onClick={() => setVerifying(r)}
                  >
                    {t('imm.verify.accept')}
                  </Button>
                  <Button
                    type="default"
                    danger
                    size="small"
                    icon={<ShieldIcon />}
                    disabled={r.status !== 'unused'}
                    onClick={() => setVoiding(r)}
                  >
                    {t('imm.verify.void')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      <Card className="im-checks-card">
        <b>{t('imm.verify.checkLog')}</b>
        <Table columns={checkColumns} dataSource={checks ?? []} loading={checks === null} rowKey="id" pagination={{ defaultPageSize: 10, showTotal: true }} />
      </Card>

      <Modal
        open={verifying !== null}
        title={t('imm.verify.confirmTitle', { no: verifying?.code_no })}
        onClose={() => setVerifying(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setVerifying(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={doVerify}>{t('imm.verify.accept')}</Button>
          </>
        }
      >
        <p>{t('imm.verify.confirmTip', { no: verifying?.declaration_no })}</p>
        <p className="muted-text">{t('imm.verify.confirmTip2')}</p>
      </Modal>

      <Modal
        open={voiding !== null}
        title={t('imm.verify.voidTitle', { no: voiding?.code_no })}
        onClose={() => setVoiding(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setVoiding(null)}>{t('common.cancel')}</Button>
            <Button type="primary" danger loading={busy} onClick={doVoid}>{t('imm.verify.void')}</Button>
          </>
        }
      >
        <p className="im-field-label">{t('imm.verify.voidReason')}</p>
        <Input size="large" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} maxLength={120} placeholder={t('imm.verify.voidReasonPlaceholder')} />
      </Modal>
    </div>
  );
}
