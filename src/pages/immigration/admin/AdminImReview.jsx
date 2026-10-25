import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Drawer, Input, Modal, Notification, Select, Table, Tag, Title,
} from 'animal-island-ui';
import { CheckCircleIcon, ClockIcon, XCircleIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastApiError } from '../../../components/immigration/apiError.js';
import { ImAdminNav, StatusTag } from '../../../components/immigration/shared.jsx';

const QUEUE_STATUSES = ['pending', 'supplement', 'approved', 'rejected', 'entered', 'exited', 'withdrawn'];
const REJECT_REASONS = ['visa_invalid', 'incomplete', 'duplicate', 'port_closed', 'other'];
const ITEM_KEYS = ['plush', 'snacks', 'stickers', 'pillow', 'balloon', 'photo_card'];

function InfoRow({ label, children }) {
  return (
    <p className="im-info-row">
      <span className="im-info-label">{label}</span>
      <span>{children}</span>
    </p>
  );
}

function ReviewDrawer({ id, onClose, onChanged }) {
  const { t } = useTranslation();
  const [decl, setDecl] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('incomplete');
  const [note, setNote] = useState('');
  const [supplementing, setSupplementing] = useState(false);
  const [supplementNote, setSupplementNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/immigration/admin/declarations/${id}`)
      .then((data) => setDecl(data.declaration))
      .catch(toastApiError);
  }, [id]);

  useEffect(load, [load]);

  const decide = async (path, body, okMsg) => {
    setBusy(true);
    try {
      await api.post(path, body);
      Notification.success(okMsg);
      setRejecting(false);
      setSupplementing(false);
      onChanged();
      onClose();
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!decl) return <p className="muted-text">{t('common.loading')}</p>;
  const d = decl;
  const actionable = ['pending', 'supplement'].includes(d.status);

  return (
    <div className="im-decl-detail">
      <div className="im-decl-detail-head">
        <Tag color="app-blue" variant="soft">{d.no}</Tag>
        <StatusTag value={d.status} />
      </div>

      {(d.risk?.flags ?? []).length > 0 && (
        <Card color="app-red" className="im-risk-card">
          <b>{t('imm.review.riskFlags')}:</b>
          {d.risk.flags.map((f) => (
            <Tag key={f} color="app-red" variant="soft" size="small">{t(`imm.risk.${f}`)}</Tag>
          ))}
          <p className="muted-text">{t('imm.review.rejectedCount', { count: d.risk.rejected })}</p>
        </Card>
      )}

      <Card>
        <InfoRow label={t('imm.declare.port')}>{d.portName} ({d.portCode})</InfoRow>
        <InfoRow label={t('imm.declare.nickname')}>{d.nickname}</InfoRow>
        <InfoRow label={t('imm.declare.contact')}>{d.contact}</InfoRow>
        <InfoRow label={t('imm.declare.purpose')}>{t(`imm.purpose.${d.purpose}`)}{d.purposeNote ? ` · ${d.purposeNote}` : ''}</InfoRow>
        <InfoRow label={t('imm.declare.stayDays')}>{d.stayDays}</InfoRow>
        <InfoRow label={t('imm.declare.companions')}>{d.companions}</InfoRow>
        <InfoRow label={t('imm.declare.address')}>{d.address || '-'}</InfoRow>
        <InfoRow label={t('imm.declare.items')}>
          {(d.items ?? []).map((i) => `${t(`imm.item.${ITEM_KEYS.includes(i.key) ? i.key : 'plush'}`)} x${i.qty}`).join(', ') || '-'}
        </InfoRow>
        <InfoRow label={t('imm.declare.visaNo')}>
          {d.visaNo ?? '-'}{' '}
          {d.visaResult && (
            <Tag size="small" color={d.visaResult === 'valid' ? 'app-green' : 'app-red'} variant="soft">
              {t(`imm.visaResult.${d.visaResult}`, { defaultValue: d.visaResult })}
            </Tag>
          )}
        </InfoRow>
        {d.visaCached?.detail?.type && (
          <InfoRow label={t('imm.review.visaDetail')}>
            {d.visaCached.detail.type} · {t('imm.visaResult.validUntil', { date: d.visaCached.detail.validUntil })}
          </InfoRow>
        )}
        {d.supplementRequest && (
          <InfoRow label={t('imm.mydecl.supplementRequired')}>{d.supplementRequest}</InfoRow>
        )}
        {d.supplementContent && (
          <InfoRow label={t('imm.mydecl.supplementSubmitted')}>{d.supplementContent}</InfoRow>
        )}
      </Card>

      {(d.attachments ?? []).length > 0 && (
        <Card>
          <b>{t('imm.attachments.title')}</b>
          {(d.attachments ?? []).map((att) => (
            <p key={att.id} className="im-attachment-row">
              {att.filename} <span className="muted-text">{att.size}B</span>
            </p>
          ))}
        </Card>
      )}

      <Card>
        <b>{t('imm.mydecl.timeline')}</b>
        <ul className="im-timeline">
          {(d.events ?? []).map((e, idx) => (
            <li key={idx}>
              <span className="im-timeline-action">{t(`imm.event.${e.action}`, { defaultValue: e.action })}</span>
              <span className="muted-text">{e.actor ?? 'system'} · {e.created_at?.slice(0, 16).replace('T', ' ')}</span>
              {e.note && <p className="im-timeline-note">{e.note}</p>}
            </li>
          ))}
        </ul>
      </Card>

      {actionable && (
        <div className="im-detail-actions">
          <Button type="primary" icon={<CheckCircleIcon />} loading={busy} onClick={() => decide(`/immigration/admin/declarations/${d.id}/approve`, {}, t('imm.review.approved'))}>
            {t('imm.review.approve')}
          </Button>
          <Button type="default" danger icon={<XCircleIcon />} onClick={() => setRejecting(true)}>
            {t('imm.review.reject')}
          </Button>
          {d.status === 'pending' && (
            <Button type="default" icon={<ClockIcon />} onClick={() => setSupplementing(true)}>
              {t('imm.review.supplement')}
            </Button>
          )}
        </div>
      )}

      <Modal
        open={rejecting}
        title={t('imm.review.rejectTitle', { no: d.no })}
        onClose={() => setRejecting(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setRejecting(false)}>{t('common.cancel')}</Button>
            <Button type="primary" danger loading={busy} onClick={() => decide(`/immigration/admin/declarations/${d.id}/reject`, { reason, note }, t('imm.review.rejected'))}>
              {t('imm.review.rejectConfirm')}
            </Button>
          </>
        }
      >
        <p className="im-field-label">{t('imm.review.rejectReason')}</p>
        <Select value={reason} onChange={setReason} options={REJECT_REASONS.map((r) => ({ key: r, label: t(`imm.rejectReason.${r}`) }))} />
        <p className="im-field-label">{t('imm.review.opinion')}</p>
        <Input size="large" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t('imm.review.opinionPlaceholder')} />
      </Modal>

      <Modal
        open={supplementing}
        title={t('imm.review.supplementTitle', { no: d.no })}
        onClose={() => setSupplementing(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setSupplementing(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={() => decide(`/immigration/admin/declarations/${d.id}/supplement`, { note: supplementNote }, t('imm.review.supplementSent'))}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="im-field-label">{t('imm.review.supplementNote')}</p>
        <Input size="large" value={supplementNote} onChange={(e) => setSupplementNote(e.target.value)} maxLength={300} placeholder={t('imm.review.supplementPlaceholder')} />
      </Modal>
    </div>
  );
}

export default function AdminImReview() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [counts, setCounts] = useState({});
  const [status, setStatus] = useState('pending');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ pageSize: '50' });
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    api
      .get(`/immigration/admin/declarations?${params}`)
      .then((data) => {
        setItems(data.items);
        setCounts(data.counts ?? {});
      })
      .catch((err) => {
        toastApiError(err);
        setItems([]);
      });
  }, [status, q]);

  useEffect(load, [load]);

  const columns = [
    { title: t('imm.mydecl.no'), dataIndex: 'no', width: 190 },
    { title: t('imm.declare.port'), dataIndex: 'portName', width: 120 },
    { title: t('imm.declare.nickname'), dataIndex: 'nickname', width: 110 },
    { title: t('common.status'), dataIndex: 'status', width: 100, render: (v) => <StatusTag value={v} /> },
    { title: t('imm.declare.visaNo'), dataIndex: 'visaNo', width: 150, render: (v) => v ?? '-' },
    { title: t('imm.mydecl.submittedAt'), dataIndex: 'submittedAt', width: 150, render: (v) => v?.slice(0, 16).replace('T', ' ') || '-' },
    {
      title: t('imm.review.risk'),
      dataIndex: 'risk',
      width: 110,
      render: (_, record) =>
        (record.risk?.flags ?? []).length > 0 ? (
          (record.risk.flags).map((f) => (
            <Tag key={f} color="app-red" variant="soft" size="small">{t(`imm.risk.${f}`)}</Tag>
          ))
        ) : (
          <span className="muted-text">-</span>
        ),
    },
    {
      title: t('common.actions'),
      width: 100,
      render: (_, record) => (
        <Button type="default" size="small" onClick={() => setOpenId(record.id)}>
          {t('imm.review.inspect')}
        </Button>
      ),
    },
  ];

  return (
    <div className="im-page">
      <ImAdminNav />
      <div className="page-header">
        <Title size="middle" color="app-orange">
          {t('imm.review.title')}
        </Title>
      </div>
      <p className="muted-text">{t('imm.review.queueNote')}</p>

      <div className="im-review-toolbar">
        <Select
          value={status}
          onChange={setStatus}
          options={[{ key: '', label: t('imm.review.allStatuses') }, ...QUEUE_STATUSES.map((s) => ({ key: s, label: `${t(`imm.status.${s}`)} (${counts[s] ?? 0})` }))]}
        />
        <Input
          size="large"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('imm.review.searchPlaceholder')}
          allowClear
        />
        <Button type="default" onClick={load}>{t('common.search')}</Button>
      </div>

      <Card>
        <Table columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={{ defaultPageSize: 10, showTotal: true }} />
      </Card>

      <Drawer open={openId !== null} title={t('imm.review.detailTitle')} onClose={() => setOpenId(null)} width={560}>
        {openId !== null && <ReviewDrawer id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
      </Drawer>
    </div>
  );
}
