// 我的建交申请: 列表 / 状态追踪 / 详情(材料、时间线) / 补件 / 撤销 / 断交申请。
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Drawer, Input, Table, Tag, Title } from 'animal-island-ui';
import { EditIcon, PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { DipNav, StatusTag, TextArea, fmtDate, fmtDateTime, toastDipError } from '../../components/dip/shared.jsx';
import DipMaterials from '../../components/dip/DipMaterials.jsx';
import { useConfirmAction } from '../../components/ConfirmAction.jsx';
import { toastSuccess, toastWarning } from '../../components/toast.js';

function InfoRow({ label, children }) {
  return (
    <p className="dip-info-row">
      <span className="dip-info-label">{label}</span>
      <span>{children}</span>
    </p>
  );
}

function RelationDetail({ id, onClose, onChanged }) {
  const { t } = useTranslation();
  const [rel, setRel] = useState(null);
  const [supplementText, setSupplementText] = useState('');
  const [severText, setSeverText] = useState('');
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirmAction();

  const load = useCallback(() => {
    api
      .get(`/dip/relations/${id}`)
      .then((data) => setRel(data.relation))
      .catch((err) => toastDipError(t, err));
  }, [id, t]);

  useEffect(load, [load]);

  const post = async (path, body, okMsg) => {
    setBusy(true);
    try {
      await api.post(path, body);
      toastSuccess(okMsg);
      onChanged();
      load();
    } catch (err) {
      toastDipError(t, err);
    } finally {
      setBusy(false);
    }
  };

  // 送审 / 撤销 / 申请断交都是不可逆流转:先确认,busy 由确认弹窗托管。
  const decide = (options, path, body, okMsg) => confirm({
    ...options,
    action: () => api.post(path, body),
    success: okMsg,
    onDone: async () => {
      onChanged();
      load();
    },
    onError: (err) => toastDipError(t, err),
  });

  if (!rel) return <p className="muted-text">{t('common.loading')}</p>;
  const r = rel;
  const canUpload = ['draft', 'pending_review', 'supplement_required'].includes(r.status);

  return (
    <div className="dip-detail">
      <div className="dip-detail-head">
        <Tag color="app-blue" variant="soft">{r.no}</Tag>
        <StatusTag value={r.status} />
      </div>
      <Card>
        <InfoRow label={t('dip.apply.objectType')}>{t(`dip.objectType.${r.objectType}`, { defaultValue: t('common.unknown') })}</InfoRow>
        <InfoRow label={t('dip.apply.relationType')}>{t(`dip.relationType.${r.relationType}`, { defaultValue: t('common.unknown') })}</InfoRow>
        <InfoRow label={t('dip.apply.entityName')}>{r.entityName}</InfoRow>
        <InfoRow label={t('dip.apply.repNickname')}>{r.repNickname}</InfoRow>
        <InfoRow label={t('dip.apply.contact')}>{r.contact}</InfoRow>
        <InfoRow label={t('dip.apply.reason')}>{r.reason || '-'}</InfoRow>
        <InfoRow label={t('dip.apply.purpose')}>{t(`dip.purpose.${r.purpose}`)}</InfoRow>
        <InfoRow label={t('dip.apply.courtesies')}>
          {(r.courtesies ?? []).map((c) => t(`dip.courtesy.${c}`, { defaultValue: t('common.unknown') })).join('、') || '-'}
        </InfoRow>
        {r.establishedAt && <InfoRow label={t('dip.relation.establishedAt')}>{fmtDateTime(r.establishedAt)}</InfoRow>}
      </Card>

      {r.status === 'rejected' && (
        <Card color="app-red" className="dip-reject-card">
          <b>{t('dip.relation.rejected')}</b>
          <p>{t(`dip.rejectReason.${r.rejectCode ?? 'other'}`)}</p>
          {r.rejectComment && <p className="muted-text">{r.rejectComment}</p>}
        </Card>
      )}

      {r.status === 'suspended' && (
        <Card color="app-orange">
          <b>{t('dip.relation.suspendedTitle')}</b>
          <p>{r.suspendReason}</p>
        </Card>
      )}

      {r.status === 'supplement_required' && (
        <Card color="app-orange">
          <b>{t('dip.relation.supplementRequired')}</b>
          <p>{r.supplementNote}</p>
          {r.supplementDeadline && <p className="muted-text">{t('dip.relation.supplementDeadline', { date: fmtDate(r.supplementDeadline) })}</p>}
          {r.supplementContent && <p className="muted-text">{t('dip.relation.supplementSubmitted')}: {r.supplementContent}</p>}
          <TextArea
            rows={3}
            value={supplementText}
            onChange={(e) => setSupplementText(e.target.value)}
            placeholder={t('dip.relation.supplementPlaceholder')}
            maxLength={500}
          />
          <Button
            type="primary"
            size="small"
            loading={busy}
            disabled={busy || (!supplementText.trim())}
            onClick={() => post(`/dip/relations/${r.id}/supplement`, { content: supplementText.trim() }, t('dip.relation.supplementSent'))}
          >
            {t('dip.relation.submitSupplement')}
          </Button>
        </Card>
      )}

      <Card>
        <b>{t('dip.material.title')}</b>
        <DipMaterials
          ownerType="relation"
          ownerId={r.id}
          materials={r.materials ?? []}
          canUpload={canUpload}
          onChanged={load}
        />
      </Card>

      <Card>
        <b>{t('dip.relation.timeline')}</b>
        <ul className="dip-timeline">
          {(r.events ?? []).map((e, idx) => (
            <li key={idx}>
              <span className="dip-timeline-action">{t(`dip.event.${e.action}`, { defaultValue: t('common.unknown') })}</span>
              <span className="muted-text">{e.actor ?? t('common.system')} · {fmtDateTime(e.created_at)}</span>
              {e.note && <p className="dip-timeline-note">{e.note}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <div className="dip-detail-actions">
        {r.status === 'draft' && (
          <>
            <Link to={`/dip/apply/${r.id}`}>
              <Button type="primary" icon={<EditIcon />} onClick={onClose}>{t('common.edit')}</Button>
            </Link>
            <Button
              danger
              onClick={() => decide({
                title: t('dip.apply.confirmTitle'),
                tip: t('dip.relation.submitConfirmBody', { no: r.no }),
                confirmText: t('dip.apply.submit'),
              }, `/dip/relations/${r.id}/submit`, {}, t('dip.apply.submitted', { no: r.no }))}
            >
              {t('dip.apply.submit')}
            </Button>
          </>
        )}
        {r.status === 'pending_review' && (
          <Button
            danger
            onClick={() => decide({
              title: t('dip.relation.withdrawConfirmTitle'),
              tip: t('dip.relation.withdrawConfirmBody', { no: r.no }),
              confirmText: t('dip.relation.withdraw'),
            }, `/dip/relations/${r.id}/withdraw`, undefined, t('dip.relation.withdrawn'))}
          >
            {t('dip.relation.withdraw')}
          </Button>
        )}
        {r.status === 'established' && (
          <Button
            danger
            icon={<PlusIcon />}
            onClick={() => {
              if (!severText.trim()) {
                toastWarning(t('dip.relation.severReasonFirst'));
                return;
              }
              decide({
                title: t('dip.relation.severConfirmTitle'),
                tip: t('dip.relation.severConfirmBody', { no: r.no, reason: severText.trim() }),
                confirmText: t('dip.relation.severRequest'),
              }, `/dip/relations/${r.id}/sever`, { reason: severText.trim() }, t('dip.relation.severRequested'));
            }}
          >
            {t('dip.relation.severRequest')}
          </Button>
        )}
        {(r.status === 'rejected' || r.status === 'withdrawn' || r.status === 'severed') && (
          <Link to={`/dip/apply?from=${r.id}`}>
            <Button type="primary" icon={<PlusIcon />} onClick={onClose}>{t('dip.relation.reapply')}</Button>
          </Link>
        )}
      </div>
      {r.status === 'established' && (
        <Input
          size="large"
          value={severText}
          onChange={(e) => setSeverText(e.target.value)}
          placeholder={t('dip.relation.severReasonPlaceholder')}
          maxLength={300}
        />
      )}
      {dialog}
    </div>
  );
}

export default function DipRelations() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [openId, setOpenId] = useState(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const load = useCallback(() => {
    api
      .get('/dip/relations?pageSize=100')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastDipError(t, err);
        setItems([]);
      });
  }, [t]);

  useEffect(load, [load]);

  const askDelete = (record) => confirm({
    title: t('common.confirmDeleteTitle'),
    tip: t('dip.relation.deleteConfirm', { no: record.no }),
    confirmText: t('common.delete'),
    action: () => api.del(`/dip/relations/${record.id}`),
    success: t('common.deleted'),
    onDone: async () => {
      setOpenId(null);
      load();
    },
    onError: (err) => toastDipError(t, err),
  });

  const columns = [
    { title: t('dip.relation.no'), dataIndex: 'no', width: 200 },
    { title: t('dip.apply.entityName'), dataIndex: 'entityName', width: 160 },
    {
      title: t('dip.apply.objectType'),
      dataIndex: 'objectType',
      width: 110,
      render: (v) => t(`dip.objectType.${v}`, { defaultValue: t('common.unknown') }),
    },
    { title: t('common.status'), dataIndex: 'status', width: 110, render: (v) => <StatusTag value={v} /> },
    { title: t('dip.relation.submittedAt'), dataIndex: 'submittedAt', width: 160, render: (v) => fmtDateTime(v) },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 230,
      render: (_, record) => (
        <div className="table-actions">
          <Button type="default" size="small" onClick={() => setOpenId(record.id)}>
            {t('dip.relation.view')}
          </Button>
          {record.status === 'draft' && (
            <>
              <Link to={`/dip/apply/${record.id}`}>
                <Button type="default" size="small" icon={<EditIcon />}>{t('common.edit')}</Button>
              </Link>
              <Button type="default" size="small" danger icon={<TrashIcon />} onClick={() => askDelete(record)}>
                {t('common.delete')}
              </Button>
            </>
          )}
          {(record.status === 'rejected' || record.status === 'withdrawn' || record.status === 'severed') && (
            <Link to={`/dip/apply?from=${record.id}`}>
              <Button type="default" size="small" icon={<PlusIcon />}>{t('dip.relation.reapply')}</Button>
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="dip-page">
      <DipNav />
      <div className="page-header">
        <Title size="middle" color="purple">
          {t('dip.relation.title')}
        </Title>
        <Link to="/dip/apply">
          <Button type="primary" icon={<PlusIcon />}>{t('dip.nav.apply')}</Button>
        </Link>
      </div>
      <Card>
        <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={{ defaultPageSize: 10, showTotal: true }} emptyText={t('common.empty')} />
      </Card>

      <Drawer maskClosable={false} open={openId !== null} title={t('dip.relation.detailTitle')} onClose={() => setOpenId(null)} width={560}>
        {openId !== null && <RelationDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
      </Drawer>

      {confirmDialog}
    </div>
  );
}
