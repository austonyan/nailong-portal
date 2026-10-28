// 外交身份登记: 关联已建交关系 → 登记信息 + 任命书材料 → 审核 → 外交身份卡。
// 含外交签注通道(联动预留:跳转签注申请署)。
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Drawer, Form, FormItem, Input, Modal, Select, Table, Tag, Title, useForm } from 'animal-island-ui';
import { EditIcon, PrinterIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import {
  DipNav, DipQr, StatusTag, TextArea, fmtDate, fmtDateTime, toastDipError,
} from '../../components/dip/shared.jsx';
import DipMaterials from '../../components/dip/DipMaterials.jsx';
import { useConfirmAction } from '../../components/ConfirmAction.jsx';
import { toastSuccess } from '../../components/toast.js';

function InfoRow({ label, children }) {
  return (
    <p className="dip-info-row">
      <span className="dip-info-label">{label}</span>
      <span>{children}</span>
    </p>
  );
}

// 外交身份卡: 编号 / 类型 / 所属实体 / 任期 / 二维码验真。
function IdentityCardModal({ id, open, onClose }) {
  const { t } = useTranslation();
  const [card, setCard] = useState(null);

  useEffect(() => {
    if (!open || !id) return;
    setCard(null);
    api
      .get(`/dip/identities/${id}/card`)
      .then((data) => setCard(data.card))
      .catch((err) => toastDipError(t, err));
  }, [open, id, t]);

  return (
    <Modal
      maskClosable={false}
      open={open}
      title={t('dip.identity.cardTitle')}
      onClose={onClose}
      footer={<Button type="primary" icon={<PrinterIcon />} onClick={() => window.print()}>{t('dip.identity.print')}</Button>}
      width={520}
      typewriter={false}
    >
      {!card ? (
        <p className="muted-text">{t('common.loading')}</p>
      ) : (
        <div className="dip-print-area">
          <div className={`dip-id-card${card.status === 'active' ? '' : ' dip-id-card-muted'}`}>
            <div className="dip-id-card-head">
              <span className="dip-id-card-office">{t('dip.officeName')}</span>
              <span className="dip-id-card-type">{card.identityTypeName}</span>
            </div>
            <div className="dip-id-card-body">
              <div className="dip-id-card-main">
                <p className="dip-id-card-entity">{card.entityName}</p>
                <p className="dip-id-card-holder">{card.holder}{card.title ? ` · ${card.title}` : ''}</p>
                <p className="dip-id-card-no">{card.no}</p>
                <p className="dip-id-card-term">
                  {t('dip.identity.termRange', { start: fmtDate(card.termStart), end: fmtDate(card.termEnd) })}
                </p>
                <div className="dip-id-card-status"><StatusTag value={card.status} /></div>
              </div>
              <div className="dip-id-card-side">
                {card.verifyPath && <DipQr value={`${window.location.origin}${card.verifyPath}`} size={140} />}
                <span className="dip-id-card-scan">{t('dip.identity.scanVerify')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function IdentityDetail({ id, onClose, onChanged }) {
  const { t } = useTranslation();
  const [idt, setIdt] = useState(null);
  const [supplementText, setSupplementText] = useState('');
  const [busy, setBusy] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const { confirm, dialog } = useConfirmAction();

  const load = useCallback(() => {
    api
      .get(`/dip/identities/${id}`)
      .then((data) => setIdt(data.identity))
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

  // 送审 / 撤销不可逆:先确认,busy 由确认弹窗托管
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

  if (!idt) return <p className="muted-text">{t('common.loading')}</p>;
  const d = idt;
  const canUpload = ['draft', 'pending_review', 'supplement_required'].includes(d.status);

  return (
    <div className="dip-detail">
      <div className="dip-detail-head">
        <Tag color="app-blue" variant="soft">{d.no}</Tag>
        <StatusTag value={d.status} />
      </div>
      <Card>
        <InfoRow label={t('dip.identity.type')}>{t(`dip.identityType.${d.identityType}`, { defaultValue: d.identityType })}</InfoRow>
        <InfoRow label={t('dip.identity.relationNo')}>{d.relationNo || '-'}</InfoRow>
        <InfoRow label={t('dip.identity.entity')}>{d.entityName}</InfoRow>
        <InfoRow label={t('dip.identity.holder')}>{d.nickname}</InfoRow>
        <InfoRow label={t('dip.identity.title')}>{d.title || '-'}</InfoRow>
        <InfoRow label={t('dip.identity.term')}>{fmtDate(d.termStart)} ~ {fmtDate(d.termEnd)}</InfoRow>
        {(d.status === 'frozen' || d.status === 'revoked' || d.status === 'expired') && d.inactiveReason && (
          <InfoRow label={t('dip.identity.inactiveReason')}>
            {t(`dip.inactiveReason.${d.inactiveReason}`, { defaultValue: d.inactiveReason })}
          </InfoRow>
        )}
      </Card>

      {d.status === 'rejected' && (
        <Card color="app-red" className="dip-reject-card">
          <b>{t('dip.identity.rejected')}</b>
          <p>{t(`dip.rejectReason.${d.rejectCode ?? 'other'}`)}</p>
          {d.rejectComment && <p className="muted-text">{d.rejectComment}</p>}
        </Card>
      )}

      {d.status === 'supplement_required' && (
        <Card color="app-orange">
          <b>{t('dip.relation.supplementRequired')}</b>
          <p>{d.supplementNote}</p>
          {d.supplementDeadline && <p className="muted-text">{t('dip.relation.supplementDeadline', { date: d.supplementDeadline.slice(0, 10) })}</p>}
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
            onClick={() => post(`/dip/identities/${d.id}/supplement`, { content: supplementText.trim() }, t('dip.relation.supplementSent'))}
          >
            {t('dip.relation.submitSupplement')}
          </Button>
        </Card>
      )}

      <Card>
        <b>{t('dip.material.title')}</b>
        <DipMaterials ownerType="identity" ownerId={d.id} materials={d.materials ?? []} canUpload={canUpload} onChanged={load} />
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
        {d.status === 'draft' && (
          <>
            <Link to={`/dip/identity/${d.id}`}>
              <Button type="primary" icon={<EditIcon />} onClick={onClose}>{t('common.edit')}</Button>
            </Link>
            <Button
              danger
              onClick={() => decide({
                title: t('dip.apply.confirmTitle'),
                tip: t('dip.identity.submitConfirmBody', { no: d.no }),
                confirmText: t('dip.apply.submit'),
              }, `/dip/identities/${d.id}/submit`, {}, t('dip.identity.submitted', { no: d.no }))}
            >
              {t('dip.apply.submit')}
            </Button>
          </>
        )}
        {d.status === 'pending_review' && (
          <Button
            danger
            onClick={() => decide({
              title: t('dip.identity.withdrawConfirmTitle'),
              tip: t('dip.identity.withdrawConfirmBody', { no: d.no }),
              confirmText: t('dip.relation.withdraw'),
            }, `/dip/identities/${d.id}/withdraw`, undefined, t('dip.relation.withdrawn'))}
          >
            {t('dip.relation.withdraw')}
          </Button>
        )}
        {d.status === 'active' && (
          <Button type="primary" onClick={() => setCardOpen(true)}>{t('dip.identity.viewCard')}</Button>
        )}
      </div>

      <IdentityCardModal id={d.id} open={cardOpen} onClose={() => setCardOpen(false)} />
      {dialog}
    </div>
  );
}

function IdentityForm({ catalog, relations, editing, onSaved }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form] = useForm();
  const [decl, setDecl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [materials, setMaterials] = useState([]);

  const established = relations.filter((r) => r.status === 'established');

  useEffect(() => {
    if (!editing) return;
    api
      .get(`/dip/identities/${editing}`)
      .then((data) => {
        const d = data.identity;
        setDecl(d);
        setMaterials(d.materials ?? []);
        form.setFieldsValue({
          identityType: d.identityType,
          relationId: d.relationId ? String(d.relationId) : undefined,
          nickname: d.nickname,
          contact: d.contact,
          title: d.title,
          termStart: d.termStart,
          termEnd: d.termEnd,
        });
      })
      .catch((err) => toastDipError(t, err));
  }, [editing, form, t]);

  const persistDraft = async () => {
    const values = await form.validateFields();
    const payload = {
      identityType: values.identityType,
      relationId: values.relationId ? Number(values.relationId) : null,
      nickname: values.nickname?.trim(),
      contact: values.contact?.trim(),
      title: values.title?.trim() ?? '',
      termStart: values.termStart,
      termEnd: values.termEnd,
    };
    if (decl?.id) {
      const data = await api.patch(`/dip/identities/${decl.id}`, payload);
      setDecl(data.identity);
      return data.identity;
    }
    const data = await api.post('/dip/identities', payload);
    setDecl(data.identity);
    return data.identity;
  };

  const doSubmit = async () => {
    setBusy(true);
    try {
      const current = await persistDraft();
      const data = await api.post(`/dip/identities/${current.id}/submit`, {});
      toastSuccess(t('dip.identity.submitted', { no: data.identity.no }));
      setConfirming(false);
      onSaved();
    } catch (err) {
      toastDipError(t, err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Title size="small" color="purple">{t('dip.identity.applyTitle')}</Title>
      {established.length === 0 && !editing && (
        <Card color="app-yellow" className="dip-hint-card">
          <p>
            {t('dip.identity.needRelation')}{' '}
            <Link to="/dip/apply">{t('dip.identity.goApply')}</Link>
          </p>
        </Card>
      )}
      <Form form={form} layout="vertical" onFinish={() => setConfirming(true)}>
        <div className="dip-form-row">
          <FormItem name="identityType" label={t('dip.identity.type')} rules={[{ required: true, message: t('dip.apply.required') }]}>
            <Select
              options={catalog.identityTypes.map((o) => ({ key: o.code, label: `${o.name}(${t('dip.apply.open')})` }))}
              placeholder={t('dip.identity.typePlaceholder')}
            />
          </FormItem>
          <FormItem name="relationId" label={t('dip.identity.relation')} rules={[{ required: true, message: t('dip.apply.required') }]}>
            <Select
              options={established.map((r) => ({ key: String(r.id), label: `${r.entityName} (${r.no})` }))}
              placeholder={t('dip.identity.relationPlaceholder')}
            />
          </FormItem>
        </div>
        <div className="dip-form-row">
          <FormItem name="nickname" label={t('dip.identity.holder')} rules={[{ required: true, message: t('dip.apply.required') }]}>
            <Input size="large" placeholder={t('dip.identity.holderPlaceholder')} allowClear maxLength={40} />
          </FormItem>
          <FormItem name="contact" label={t('dip.identity.contact')} rules={[{ required: true, message: t('dip.apply.required') }]}>
            <Input size="large" placeholder={t('dip.identity.contactPlaceholder')} allowClear maxLength={60} />
          </FormItem>
        </div>
        <div className="dip-form-row">
          <FormItem name="title" label={`${t('dip.identity.title')}(${t('common.optional')})`}>
            <Input size="large" placeholder={t('dip.identity.titlePlaceholder')} maxLength={60} />
          </FormItem>
          <div className="dip-form-row">
            <FormItem name="termStart" label={t('dip.identity.termStart')} rules={[{ required: true, message: t('dip.apply.required') }]}>
              <Input size="large" type="date" />
            </FormItem>
            <FormItem name="termEnd" label={t('dip.identity.termEnd')} rules={[{ required: true, message: t('dip.apply.required') }]}>
              <Input size="large" type="date" />
            </FormItem>
          </div>
        </div>
        <FormItem>
          <div className="dip-form-actions">
            <Button
              type="default"
              size="large"
              loading={busy}
              onClick={async () => {
                try {
                  const saved = await persistDraft();
                  toastSuccess(t('dip.apply.draftSaved'));
                  onSaved();
                  if (saved && !editing) navigate(`/dip/identity/${saved.id}`, { replace: true });
                } catch (err) {
                  if (err?.code) toastDipError(t, err);
                }
              }} disabled={busy}
            >
              {t('dip.apply.saveDraft')}
            </Button>
            <Button type="primary" size="large" htmlType="submit" disabled={established.length === 0 && !editing}>
              {t('dip.apply.submit')}
            </Button>
          </div>
        </FormItem>
      </Form>

      {decl?.id && (
        <div className="dip-apply-materials">
          <b>{t('dip.material.title')}</b>
          <p className="muted-text">{t('dip.identity.materialTip')}</p>
          <DipMaterials
            ownerType="identity"
            ownerId={decl.id}
            materials={materials}
            canUpload
            onChanged={(mat) => {
              setMaterials((list) => (mat.removed ? list.filter((m) => m.id !== mat.id) : [...list, mat]));
            }}
          />
        </div>
      )}

      <Modal
        maskClosable={false}
        open={confirming}
        title={t('dip.apply.confirmTitle')}
        onClose={() => {
          if (busy) return;
          setConfirming(false);
        }}
        footer={
          <>
            <Button onClick={() => setConfirming(false)} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={busy} onClick={doSubmit}>{t('dip.apply.submit')}</Button>
          </>
        }
        width={520}
        typewriter={false}
      >
        <p>{t('dip.identity.confirmTip')}</p>
      </Modal>
    </Card>
  );
}

export default function DipIdentity() {
  const { t } = useTranslation();
  const { id: editing } = useParams();
  const [catalog, setCatalog] = useState({ identityTypes: [] });
  const [relations, setRelations] = useState([]);
  const [items, setItems] = useState(null);
  const [openId, setOpenId] = useState(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const load = useCallback(() => {
    api
      .get('/dip/types')
      .then((data) => setCatalog({ identityTypes: data.identityTypes ?? [] }))
      .catch((err) => toastDipError(t, err));
    api
      .get('/dip/relations?pageSize=100')
      .then((data) => setRelations(data.items))
      .catch((err) => toastDipError(t, err));
    api
      .get('/dip/identities?pageSize=100')
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
    action: () => api.del(`/dip/identities/${record.id}`),
    success: t('common.deleted'),
    onDone: async () => {
      setOpenId(null);
      load();
    },
    onError: (err) => toastDipError(t, err),
  });

  const activeIdentity = (items ?? []).find((i) => i.status === 'active');

  const columns = [
    { title: t('dip.identity.no'), dataIndex: 'no', width: 200 },
    { title: t('dip.identity.entity'), dataIndex: 'entityName', width: 150 },
    {
      title: t('dip.identity.type'),
      dataIndex: 'identityType',
      width: 110,
      render: (v) => t(`dip.identityType.${v}`, { defaultValue: v }),
    },
    { title: t('common.status'), dataIndex: 'status', width: 100, render: (v) => <StatusTag value={v} /> },
    {
      title: t('dip.identity.term'),
      dataIndex: 'termEnd',
      width: 150,
      render: (_, r) => `${fmtDate(r.termStart)} ~ ${fmtDate(r.termEnd)}`,
    },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 220,
      render: (_, record) => (
        <div className="table-actions">
          <Button type="default" size="small" onClick={() => setOpenId(record.id)}>{t('dip.relation.view')}</Button>
          {record.status === 'draft' && (
            <>
              <Link to={`/dip/identity/${record.id}`}>
                <Button type="default" size="small" icon={<EditIcon />}>{t('common.edit')}</Button>
              </Link>
              <Button type="default" size="small" danger icon={<TrashIcon />} onClick={() => askDelete(record)}>
                {t('common.delete')}
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="dip-page">
      <DipNav />
      <div className="page-header">
        <Title size="middle" color="purple">{t('dip.identity.pageTitle')}</Title>
      </div>

      <Card color="purple" className="dip-visa-channel" id="visa">
        <b>{t('dip.identity.visaChannelTitle')}</b>
        <p className="muted-text">{t('dip.identity.visaChannelTip')}</p>
        {activeIdentity ? (
          <div className="dip-visa-channel-actions">
            <Link to="/visa">
              <Button type="primary">{t('dip.identity.goVisa')}</Button>
            </Link>
            <Tag color="app-teal" variant="soft">{t('dip.identity.carryNo', { no: activeIdentity.no })}</Tag>
          </div>
        ) : (
          <Tag color="app-orange" variant="soft">{t('dip.identity.visaNeedActive')}</Tag>
        )}
      </Card>

      <IdentityForm key={editing ?? 'new'} catalog={catalog} relations={relations} editing={editing} onSaved={load} />

      <Card>
        <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={{ defaultPageSize: 10, showTotal: true }} />
      </Card>

      <Drawer maskClosable={false} open={openId !== null} title={t('dip.identity.detailTitle')} onClose={() => setOpenId(null)} width={560}>
        {openId !== null && <IdentityDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
      </Drawer>

      {confirmDialog}
    </div>
  );
}
