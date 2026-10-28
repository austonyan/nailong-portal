// 外交审核工作台 — 建交队列 + 外交身份队列(队列隔离:仅 dip:review 可见)。
// 支持:通过 / 驳回(原因+意见) / 补件 / 暂停恢复 / 断交复核 / 冻结解冻注销。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Drawer, Input, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { api, getAccessToken } from '../../../api/client.js';
import {
  DipAdminNav, StatusTag, TextArea, fmtDate, fmtDateTime, toastDipError,
} from '../../../components/dip/shared.jsx';
import { toastSuccess, toastWarning } from '../../../components/toast.js';
import { useDebouncedValue } from '../../../lib/useDebouncedValue.js';

const REJECT_REASONS = ['info_missing', 'info_false', 'duplicate', 'type_mismatch', 'other'];
const RELATION_QUEUE_STATUSES = ['pending_review', 'supplement_required', 'sever_requested', 'established', 'rejected', 'suspended', 'withdrawn', 'draft'];
const IDENTITY_QUEUE_STATUSES = ['pending_review', 'supplement_required', 'active', 'frozen', 'rejected', 'withdrawn', 'expired', 'revoked', 'draft'];

function RiskTags({ risk }) {
  const { t } = useTranslation();
  if (!risk) return null;
  return (
    <>
      {risk.flags.map((f) => (
        <Tag key={f} size="small" color="app-red" variant="soft">{t(`dip.admin.risk_${f}`)}</Tag>
      ))}
      {risk.flags.length === 0 && <Tag size="small" color="app-green" variant="soft">{t('dip.admin.risk_clean')}</Tag>}
    </>
  );
}

function InfoRow({ label, children }) {
  return (
    <p className="dip-info-row">
      <span className="dip-info-label">{label}</span>
      <span>{children}</span>
    </p>
  );
}

function ActionButton({ danger, loading, onClick, children }) {
  return (
    <Button type="default" size="small" danger={danger} loading={loading} disabled={loading || (!!loading)} onClick={onClick}>
      {children}
    </Button>
  );
}

function MaterialLinks({ materials }) {
  const { t } = useTranslation();
  if (!materials?.length) return <p className="muted-text">{t('dip.material.empty')}</p>;
  const download = async (e, m) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/dip/materials/${m.id}/download`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (!res.ok) throw new Error(res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = m.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toastDipError(t, { code: 'FORBIDDEN' });
    }
  };
  return (
    <ul className="dip-material-links">
      {materials.map((m) => (
        <li key={m.id}>
          <a href={`/api/dip/materials/${m.id}/download`} onClick={(e) => download(e, m)}>
            {m.filename}
          </a>
          <span className="muted-text"> · {t(`dip.materialKind.${m.kind}`, { defaultValue: m.kind })}</span>
        </li>
      ))}
    </ul>
  );
}

function RelationDrawer({ id, onChanged }) {
  const { t } = useTranslation();
  const [rel, setRel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('info_missing');
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    api
      .get(`/dip/admin/relations/${id}`)
      .then((data) => setRel(data.relation))
      .catch((err) => toastDipError(t, err));
  }, [id, t]);

  useEffect(load, [load]);

  const decide = async (path, body, okMsg) => {
    setBusy(true);
    try {
      await api.post(path, body);
      setRejectOpen(false);
      toastSuccess(okMsg);
      onChanged();
      load();
    } catch (err) {
      toastDipError(t, err);
    } finally {
      setBusy(false);
    }
  };

  if (!rel) return <p className="muted-text">{t('common.loading')}</p>;
  const r = rel;

  return (
    <div className="dip-detail">
      <div className="dip-detail-head">
        <Tag color="app-blue" variant="soft">{r.no}</Tag>
        <StatusTag value={r.status} />
        <RiskTags risk={r.risk} />
      </div>
      <Card>
        <InfoRow label={t('dip.apply.objectType')}>{t(`dip.objectType.${r.objectType}`, { defaultValue: r.objectType })}</InfoRow>
        <InfoRow label={t('dip.apply.relationType')}>{t(`dip.relationType.${r.relationType}`, { defaultValue: r.relationType })}</InfoRow>
        <InfoRow label={t('dip.apply.entityName')}>{r.entityName}</InfoRow>
        <InfoRow label={t('dip.apply.repNickname')}>{r.repNickname}</InfoRow>
        <InfoRow label={t('dip.apply.contact')}>{r.contact}</InfoRow>
        <InfoRow label={t('dip.apply.reason')}>{r.reason || '-'}</InfoRow>
        <InfoRow label={t('dip.apply.purpose')}>{t(`dip.purpose.${r.purpose}`)}</InfoRow>
        <InfoRow label={t('dip.apply.courtesies')}>
          {(r.courtesies ?? []).map((c) => t(`dip.courtesy.${c}`, { defaultValue: c })).join('、') || '-'}
        </InfoRow>
        {r.supplementNote && <InfoRow label={t('dip.relation.supplementRequired')}>{r.supplementNote}</InfoRow>}
        {r.severReason && <InfoRow label={t('dip.relation.severRequest')}>{r.severReason}</InfoRow>}
      </Card>

      <Card>
        <b>{t('dip.material.title')}</b>
        <MaterialLinks materials={r.materials} />
      </Card>

      <Card>
        <b>{t('dip.relation.timeline')}</b>
        <ul className="dip-timeline">
          {(r.events ?? []).map((e, idx) => (
            <li key={idx}>
              <span className="dip-timeline-action">{t(`dip.event.${e.action}`, { defaultValue: e.action })}</span>
              <span className="muted-text">{e.actor ?? 'system'} · {fmtDateTime(e.created_at)}</span>
              {e.note && <p className="dip-timeline-note">{e.note}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <div className="dip-detail-actions">
        {['pending_review', 'supplement_required'].includes(r.status) && (
          <>
            <Button type="primary" size="small" loading={busy} onClick={() => decide(`/dip/admin/relations/${r.id}/approve`, { note }, t('dip.admin.established'))} disabled={busy}>
              {t('dip.admin.establish')}
            </Button>
            <ActionButton loading={busy} onClick={() => setRejectOpen(true)}>{t('dip.admin.reject')}</ActionButton>
            {r.status === 'pending_review' && (
              <ActionButton
                loading={busy}
                onClick={() => {
                  if (!note.trim()) {
                    toastWarning(t('dip.admin.noteFirst'));
                    return;
                  }
                  decide(`/dip/admin/relations/${r.id}/supplement`, { note: note.trim() }, t('dip.admin.supplementSent'));
                }}
              >
                {t('dip.admin.requireSupplement')}
              </ActionButton>
            )}
          </>
        )}
        {r.status === 'established' && (
          <ActionButton
            danger
            loading={busy}
            onClick={() => {
              if (!note.trim()) {
                toastWarning(t('dip.admin.reasonFirst'));
                return;
              }
              decide(`/dip/admin/relations/${r.id}/suspend`, { reason: note.trim() }, t('dip.admin.suspended'));
            }}
          >
            {t('dip.admin.suspend')}
          </ActionButton>
        )}
        {r.status === 'suspended' && (
          <Button type="primary" size="small" loading={busy} onClick={() => decide(`/dip/admin/relations/${r.id}/resume`, { note }, t('dip.admin.resumed'))} disabled={busy}>
            {t('dip.admin.resume')}
          </Button>
        )}
        {['sever_requested', 'established'].includes(r.status) && (
          <>
            <Button type="primary" size="small" loading={busy} onClick={() => decide(`/dip/admin/relations/${r.id}/sever`, { approve: true }, t('dip.admin.severed'))} disabled={busy}>
              {t('dip.admin.confirmSever')}
            </Button>
            {r.status === 'sever_requested' && (
              <ActionButton loading={busy} onClick={() => decide(`/dip/admin/relations/${r.id}/sever`, { approve: false, note }, t('dip.admin.severDismissed'))}>
                {t('dip.admin.dismissSever')}
              </ActionButton>
            )}
          </>
        )}
      </div>
      <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('dip.admin.notePlaceholder')} maxLength={300} />

      <Modal
        open={rejectOpen}
        title={t('dip.admin.rejectTitle')}
        onClose={() => {
          if (!busy) setRejectOpen(false);
        }}
        maskClosable={false}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setRejectOpen(false)} disabled={busy}>{t('common.cancel')}</Button>
            <Button
              type="primary"
              danger
              loading={busy}
              disabled={busy}
              onClick={() => decide(`/dip/admin/relations/${r.id}/reject`, { reason, comment }, t('dip.admin.rejected'))}
            >
              {t('dip.admin.reject')}
            </Button>
          </>
        }
      >
        <div className="dip-form-row">
          <Select value={reason} onChange={setReason} options={REJECT_REASONS.map((x) => ({ key: x, label: t(`dip.rejectReason.${x}`) }))} />
        </div>
        <TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('dip.admin.commentPlaceholder')} maxLength={300} />
      </Modal>
    </div>
  );
}

function IdentityDrawer({ id, onChanged }) {
  const { t } = useTranslation();
  const [idt, setIdt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('info_missing');
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    api
      .get(`/dip/admin/identities/${id}`)
      .then((data) => setIdt(data.identity))
      .catch((err) => toastDipError(t, err));
  }, [id, t]);

  useEffect(load, [load]);

  const decide = async (path, body, okMsg) => {
    setBusy(true);
    try {
      await api.post(path, body);
      setRejectOpen(false);
      toastSuccess(okMsg);
      onChanged();
      load();
    } catch (err) {
      toastDipError(t, err);
    } finally {
      setBusy(false);
    }
  };

  if (!idt) return <p className="muted-text">{t('common.loading')}</p>;
  const d = idt;

  return (
    <div className="dip-detail">
      <div className="dip-detail-head">
        <Tag color="app-blue" variant="soft">{d.no}</Tag>
        <StatusTag value={d.status} />
        <RiskTags risk={d.risk} />
      </div>
      <Card>
        <InfoRow label={t('dip.identity.type')}>{t(`dip.identityType.${d.identityType}`, { defaultValue: d.identityType })}</InfoRow>
        <InfoRow label={t('dip.identity.relationNo')}>
          {d.relationNo || '-'} {d.relationId && <Tag size="small" color="app-teal" variant="soft">#{d.relationId}</Tag>}
        </InfoRow>
        <InfoRow label={t('dip.identity.entity')}>{d.entityName}</InfoRow>
        <InfoRow label={t('dip.identity.holder')}>{d.nickname}</InfoRow>
        <InfoRow label={t('dip.identity.contact')}>{d.contact}</InfoRow>
        <InfoRow label={t('dip.identity.title')}>{d.title || '-'}</InfoRow>
        <InfoRow label={t('dip.identity.term')}>{fmtDate(d.termStart)} ~ {fmtDate(d.termEnd)}</InfoRow>
        {d.inactiveReason && <InfoRow label={t('dip.identity.inactiveReason')}>{d.inactiveReason}</InfoRow>}
      </Card>

      <Card>
        <b>{t('dip.material.title')}</b>
        <MaterialLinks materials={d.materials} />
      </Card>

      <Card>
        <b>{t('dip.relation.timeline')}</b>
        <ul className="dip-timeline">
          {(d.events ?? []).map((e, idx) => (
            <li key={idx}>
              <span className="dip-timeline-action">{t(`dip.event.${e.action}`, { defaultValue: e.action })}</span>
              <span className="muted-text">{e.actor ?? 'system'} · {fmtDateTime(e.created_at)}</span>
              {e.note && <p className="dip-timeline-note">{e.note}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <div className="dip-detail-actions">
        {['pending_review', 'supplement_required'].includes(d.status) && (
          <>
            <Button type="primary" size="small" loading={busy} onClick={() => decide(`/dip/admin/identities/${d.id}/approve`, { note }, t('dip.admin.identityApproved'))} disabled={busy}>
              {t('dip.admin.approveIdentity')}
            </Button>
            <ActionButton loading={busy} onClick={() => setRejectOpen(true)}>{t('dip.admin.reject')}</ActionButton>
            {d.status === 'pending_review' && (
              <ActionButton
                loading={busy}
                onClick={() => {
                  if (!note.trim()) {
                    toastWarning(t('dip.admin.noteFirst'));
                    return;
                  }
                  decide(`/dip/admin/identities/${d.id}/supplement`, { note: note.trim() }, t('dip.admin.supplementSent'));
                }}
              >
                {t('dip.admin.requireSupplement')}
              </ActionButton>
            )}
          </>
        )}
        {d.status === 'active' && (
          <ActionButton
            danger
            loading={busy}
            onClick={() => {
              if (!note.trim()) {
                toastWarning(t('dip.admin.reasonFirst'));
                return;
              }
              decide(`/dip/admin/identities/${d.id}/freeze`, { reason: note.trim() }, t('dip.admin.frozen'));
            }}
          >
            {t('dip.admin.freeze')}
          </ActionButton>
        )}
        {d.status === 'frozen' && (
          <>
            <Button type="primary" size="small" loading={busy} onClick={() => decide(`/dip/admin/identities/${d.id}/unfreeze`, { note }, t('dip.admin.unfrozen'))} disabled={busy}>
              {t('dip.admin.unfreeze')}
            </Button>
            <ActionButton
              danger
              loading={busy}
              onClick={() => {
                if (!note.trim()) {
                  toastWarning(t('dip.admin.reasonFirst'));
                  return;
                }
                decide(`/dip/admin/identities/${d.id}/revoke`, { reason: note.trim() }, t('dip.admin.revoked'));
              }}
            >
              {t('dip.admin.revoke')}
            </ActionButton>
          </>
        )}
      </div>
      <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('dip.admin.notePlaceholder')} maxLength={300} />

      <Modal
        open={rejectOpen}
        title={t('dip.admin.rejectTitle')}
        onClose={() => {
          if (!busy) setRejectOpen(false);
        }}
        maskClosable={false}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setRejectOpen(false)} disabled={busy}>{t('common.cancel')}</Button>
            <Button
              type="primary"
              danger
              loading={busy}
              disabled={busy}
              onClick={() => decide(`/dip/admin/identities/${d.id}/reject`, { reason, comment }, t('dip.admin.rejected'))}
            >
              {t('dip.admin.reject')}
            </Button>
          </>
        }
      >
        <div className="dip-form-row">
          <Select value={reason} onChange={setReason} options={REJECT_REASONS.map((x) => ({ key: x, label: t(`dip.rejectReason.${x}`) }))} />
        </div>
        <TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('dip.admin.commentPlaceholder')} maxLength={300} />
      </Modal>
    </div>
  );
}

export default function AdminDipReview() {
  const { t } = useTranslation();
  const [kind, setKind] = useState('relation'); // relation | identity
  const [status, setStatus] = useState('pending_review');
  const [q, setQ] = useState('');
  // 检索词 300ms 防抖:逐键输入不再每字打一次接口。
  const dq = useDebouncedValue(q, 300);
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    const path = kind === 'relation' ? '/dip/admin/relations' : '/dip/admin/identities';
    const params = new URLSearchParams({ pageSize: '20' });
    if (status) params.set('status', status);
    if (dq.trim()) params.set('q', dq.trim());
    api
      .get(`${path}?${params.toString()}`)
      .then(setData)
      .catch((err) => {
        toastDipError(t, err);
        setData({ items: [], counts: {}, total: 0 });
      });
  }, [kind, status, dq, t]);

  useEffect(load, [load]);

  const statusOptions = (kind === 'relation' ? RELATION_QUEUE_STATUSES : IDENTITY_QUEUE_STATUSES).map((s) => ({
    key: s,
    label: `${t(`dip.status.${s}`)} (${data?.counts?.[s] ?? 0})`,
  }));

  const columns =
    kind === 'relation'
      ? [
          { title: t('dip.relation.no'), dataIndex: 'no', width: 190 },
          { title: t('dip.apply.entityName'), dataIndex: 'entityName', width: 150 },
          { title: t('common.status'), dataIndex: 'status', width: 110, render: (v) => <StatusTag value={v} /> },
          { title: t('dip.admin.submitted'), dataIndex: 'submittedAt', width: 150, render: (v) => fmtDateTime(v) },
          { title: t('dip.admin.risk'), dataIndex: 'risk', width: 130, render: (_, r) => <RiskTags risk={r.risk} /> },
          { title: t('common.actions'), width: 90, render: (_, r) => <Button size="small" onClick={() => setOpenId(r.id)}>{t('dip.admin.review')}</Button> },
        ]
      : [
          { title: t('dip.identity.no'), dataIndex: 'no', width: 190 },
          { title: t('dip.identity.entity'), dataIndex: 'entityName', width: 130 },
          { title: t('dip.identity.holder'), dataIndex: 'nickname', width: 110 },
          { title: t('common.status'), dataIndex: 'status', width: 110, render: (v) => <StatusTag value={v} /> },
          { title: t('dip.admin.risk'), dataIndex: 'risk', width: 130, render: (_, r) => <RiskTags risk={r.risk} /> },
          { title: t('common.actions'), width: 90, render: (_, r) => <Button size="small" onClick={() => setOpenId(r.id)}>{t('dip.admin.review')}</Button> },
        ];

  return (
    <div className="dip-page">
      <DipAdminNav />
      <div className="page-header">
        <Title size="middle" color="purple">{t('dip.admin.reviewTitle')}</Title>
        <div className="dip-msg-filter">
          <Button type={kind === 'relation' ? 'primary' : 'default'} size="small" onClick={() => { setKind('relation'); setStatus('pending_review'); }}>
            {t('dip.admin.tabRelations')}
          </Button>
          <Button type={kind === 'identity' ? 'primary' : 'default'} size="small" onClick={() => { setKind('identity'); setStatus('pending_review'); }}>
            {t('dip.admin.tabIdentities')}
          </Button>
        </div>
      </div>

      <Card>
        <div className="dip-admin-filter">
          <Select value={status} onChange={setStatus} options={[{ key: '', label: t('dip.admin.allStatuses') }, ...statusOptions]} />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('dip.admin.searchPlaceholder')}
            allowClear
            maxLength={40}
          />
          <Button onClick={load}>{t('common.search')}</Button>
        </div>
        <Table className="table-fit"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={data === null}
          rowKey="id"
          pagination={{ defaultPageSize: 20, showTotal: true, total: data?.total }}
        />
      </Card>

      <Drawer
        maskClosable={false}
        open={openId !== null}
        title={kind === 'relation' ? t('dip.relation.detailTitle') : t('dip.identity.detailTitle')}
        onClose={() => setOpenId(null)}
        width={580}
      >
        {openId !== null &&
          (kind === 'relation' ? (
            <RelationDrawer id={openId} onChanged={load} />
          ) : (
            <IdentityDrawer id={openId} onChanged={load} />
          ))}
      </Drawer>
    </div>
  );
}
