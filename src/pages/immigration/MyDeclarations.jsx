import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Drawer, Modal, Notification, Table, Tag, Title } from 'animal-island-ui';
import { CodeIcon, EditIcon, PlusIcon, RefreshIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastApiError } from '../../components/immigration/apiError.js';
import { ImNav, StatusTag } from '../../components/immigration/shared.jsx';
import Attachments from '../../components/immigration/Attachments.jsx';

function InfoRow({ label, children }) {
  return (
    <p className="im-info-row">
      <span className="im-info-label">{label}</span>
      <span>{children}</span>
    </p>
  );
}

// Self-contained drawer body: pulls the full declaration (events, attachments,
// pass code summary) from the detail endpoint.
function DeclarationDetail({ id, onClose, onChanged }) {
  const { t } = useTranslation();
  const [decl, setDecl] = useState(null);
  const [supplementText, setSupplementText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/immigration/declarations/${id}`)
      .then((data) => setDecl(data.declaration))
      .catch(toastApiError);
  }, [id]);

  useEffect(load, [load]);

  const post = async (path, okMsg) => {
    setBusy(true);
    try {
      await api.post(path);
      Notification.success(okMsg);
      onChanged();
      load();
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!decl) return <p className="muted-text">{t('common.loading')}</p>;
  const d = decl;
  const canUpload = ['draft', 'pending', 'supplement'].includes(d.status);

  return (
    <div className="im-decl-detail">
      <div className="im-decl-detail-head">
        <Tag color="app-blue" variant="soft">{d.no}</Tag>
        <StatusTag value={d.status} />
      </div>
      <Card>
        <InfoRow label={t('imm.declare.port')}>{d.portName} ({d.portCode})</InfoRow>
        <InfoRow label={t('imm.declare.nickname')}>{d.nickname}</InfoRow>
        <InfoRow label={t('imm.declare.contact')}>{d.contact}</InfoRow>
        <InfoRow label={t('imm.declare.purpose')}>
          {t(`imm.purpose.${d.purpose}`)}
          {d.purposeNote ? ` · ${d.purposeNote}` : ''}
        </InfoRow>
        <InfoRow label={t('imm.declare.stayDays')}>{d.stayDays}</InfoRow>
        <InfoRow label={t('imm.declare.companions')}>{d.companions}</InfoRow>
        <InfoRow label={t('imm.declare.address')}>{d.address || '-'}</InfoRow>
        <InfoRow label={t('imm.declare.items')}>
          {(d.items ?? []).map((i) => `${t(`imm.item.${i.key}`)} x${i.qty}`).join(', ') || '-'}
        </InfoRow>
        <InfoRow label={t('imm.declare.visaNo')}>
          {d.visaNo ?? '-'}{' '}
          {d.visaResult && (
            <Tag size="small" color={d.visaResult === 'valid' ? 'app-green' : 'app-red'} variant="soft">
              {t(`imm.visaResult.${d.visaResult}`, { defaultValue: d.visaResult })}
            </Tag>
          )}
        </InfoRow>
      </Card>

      {d.status === 'rejected' && (
        <Card color="app-red" className="im-reject-card">
          <b>{t('imm.mydecl.rejected')}</b>
          <p>{t(`imm.rejectReason.${d.rejectReason ?? 'other'}`)}</p>
          {d.rejectNote && <p className="muted-text">{d.rejectNote}</p>}
        </Card>
      )}

      {d.status === 'supplement' && (
        <Card color="app-orange">
          <b>{t('imm.mydecl.supplementRequired')}</b>
          <p>{d.supplementRequest}</p>
          {d.supplementContent && (
            <p className="muted-text">{t('imm.mydecl.supplementSubmitted')}: {d.supplementContent}</p>
          )}
          <textarea
            className="docs-textarea"
            value={supplementText}
            onChange={(e) => setSupplementText(e.target.value)}
            placeholder={t('imm.mydecl.supplementPlaceholder')}
            maxLength={500}
          />
          <Button
            type="primary"
            size="small"
            loading={busy}
            disabled={!supplementText.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await api.post(`/immigration/declarations/${d.id}/supplement`, { content: supplementText.trim() });
                Notification.success(t('imm.mydecl.supplementSent'));
                setSupplementText('');
                onChanged();
                load();
              } catch (err) {
                toastApiError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('imm.mydecl.submitSupplement')}
          </Button>
        </Card>
      )}

      <Card>
        <b>{t('imm.attachments.title')}</b>
        <Attachments declarationId={d.id} attachments={d.attachments ?? []} canUpload={canUpload} onChanged={load} />
      </Card>

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

      <div className="im-detail-actions">
        {d.status === 'draft' && (
          <>
            <Link to={`/immigration/declare/${d.id}`}>
              <Button type="primary" icon={<EditIcon />} onClick={onClose}>{t('common.edit')}</Button>
            </Link>
            <Button danger loading={busy} onClick={() => post(`/immigration/declarations/${d.id}/submit`, t('imm.declare.submitted', { no: d.no }))}>
              {t('imm.declare.submit')}
            </Button>
          </>
        )}
        {d.status === 'pending' && (
          <Button danger loading={busy} onClick={() => post(`/immigration/declarations/${d.id}/withdraw`, t('imm.mydecl.withdrawn'))}>
            {t('imm.mydecl.withdraw')}
          </Button>
        )}
        {d.passCode && (
          <Link to="/immigration/pass-codes">
            <Button type="primary" icon={<CodeIcon />} onClick={onClose}>{t('imm.mydecl.viewPass')}</Button>
          </Link>
        )}
        {(d.status === 'rejected' || d.status === 'withdrawn') && (
          <Link to={`/immigration/declare?from=${d.id}`}>
            <Button type="primary" icon={<RefreshIcon />} onClick={onClose}>{t('imm.mydecl.redeclare')}</Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function MyDeclarations() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(() => {
    api
      .get('/immigration/declarations?pageSize=100')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastApiError(err);
        setItems([]);
      });
  }, []);

  useEffect(load, [load]);

  const removeDraft = async () => {
    try {
      await api.del(`/immigration/declarations/${deleteTarget.id}`);
      Notification.success(t('common.save'));
      setDeleteTarget(null);
      setOpenId(null);
      load();
    } catch (err) {
      toastApiError(err);
    }
  };

  const columns = [
    { title: t('imm.mydecl.no'), dataIndex: 'no', width: 190 },
    { title: t('imm.declare.port'), dataIndex: 'portName', width: 130 },
    { title: t('common.status'), dataIndex: 'status', width: 100, render: (v) => <StatusTag value={v} /> },
    { title: t('imm.mydecl.submittedAt'), dataIndex: 'submittedAt', width: 160, render: (v) => v?.slice(0, 16).replace('T', ' ') || '-' },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 230,
      render: (_, record) => (
        <div className="table-actions">
          <Button type="default" size="small" onClick={() => setOpenId(record.id)}>
            {t('imm.mydecl.view')}
          </Button>
          {record.status === 'draft' && (
            <>
              <Link to={`/immigration/declare/${record.id}`}>
                <Button type="default" size="small" icon={<EditIcon />}>{t('common.edit')}</Button>
              </Link>
              <Button type="default" size="small" danger icon={<TrashIcon />} onClick={() => setDeleteTarget(record)}>
                {t('common.delete')}
              </Button>
            </>
          )}
          {(record.status === 'rejected' || record.status === 'withdrawn') && (
            <Link to={`/immigration/declare?from=${record.id}`}>
              <Button type="default" size="small" icon={<PlusIcon />}>{t('imm.mydecl.redeclare')}</Button>
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="im-page">
      <ImNav />
      <div className="page-header">
        <Title size="middle" color="app-teal">
          {t('imm.mydecl.title')}
        </Title>
        <Link to="/immigration/declare">
          <Button type="primary" icon={<PlusIcon />}>{t('imm.nav.declare')}</Button>
        </Link>
      </div>
      <Card>
        <Table columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={{ defaultPageSize: 10, showTotal: true }} />
      </Card>

      <Drawer open={openId !== null} title={t('imm.mydecl.detailTitle')} onClose={() => setOpenId(null)} width={540}>
        {openId !== null && <DeclarationDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
      </Drawer>

      <Modal
        open={deleteTarget !== null}
        title={t('common.confirmDeleteTitle')}
        onClose={() => setDeleteTarget(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button type="primary" danger onClick={removeDraft}>{t('common.delete')}</Button>
          </>
        }
      >
        {t('imm.mydecl.deleteConfirm', { no: deleteTarget?.no })}
      </Modal>
    </div>
  );
}
