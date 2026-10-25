// 我的报名与进度:列表、详情、状态轨迹、材料、活动凭证与取消报名。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Drawer, Modal, Table, Tag, Title } from 'animal-island-ui';
import { BanIcon, EyeIcon, FileIcon, SendIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import {
  DescList,
  StatusTag,
  TextArea,
  fmtDateTime,
  openProtocolMaterial,
  toastProtocolError,
} from './shared.jsx';
import { toastSuccess } from './shared.jsx';

export default function ProtocolMyRegistrations() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [items, setItems] = useState(null);
  const [detail, setDetail] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/protocol/registrations');
      setItems(data.items);
    } catch (err) {
      toastProtocolError(t, err);
      setItems([]);
    }
  }, [t]);

  const openDetail = useCallback(
    async (regId) => {
      try {
        const data = await api.get(`/protocol/registrations/${regId}`);
        setDetail(data.registration);
      } catch (err) {
        toastProtocolError(t, err);
      }
    },
    [t]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (id) openDetail(id);
  }, [id, openDetail]);

  const closeDetail = () => {
    setDetail(null);
    if (id) navigate('/protocol/registrations', { replace: true });
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await api.post(`/protocol/registrations/${cancelTarget.id}/cancel`, { reason });
      toastSuccess(t('protocol.my.cancelled'));
      setCancelTarget(null);
      setReason('');
      setDetail(null);
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { title: t('protocol.field.regNo'), dataIndex: 'regNo', width: 190 },
    { title: t('protocol.field.event'), dataIndex: 'eventTitle', width: 220 },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 120,
      render: (v) => <StatusTag status={v} />,
    },
    { title: t('protocol.field.submittedAt'), dataIndex: 'submittedAt', width: 160, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      render: (_, record) => (
        <div className="protocol-row-actions">
          <Button type="text" size="small" icon={<EyeIcon />} onClick={() => openDetail(record.id)}>
            {t('protocol.action.view')}
          </Button>
          {record.status === 'draft' && (
            <Button type="text" size="small" onClick={() => navigate(`/protocol/registrations/${record.id}/edit`)}>
              {t('protocol.action.edit')}
            </Button>
          )}
          {['draft', 'pending_review', 'approved', 'waitlisted'].includes(record.status) && (
            <Button type="text" size="small" danger icon={<BanIcon />} onClick={() => setCancelTarget(record)}>
              {t('protocol.action.cancelReg')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('protocol.my.title')}</Title>
        <p className="muted-text">{t('protocol.my.subtitle')}</p>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={{ pageSize: 10, showTotal: true }}
          emptyText={t('protocol.my.empty')}
        />
      </Card>

      <Drawer
        open={detail !== null}
        title={detail?.regNo}
        width={620}
        onClose={closeDetail}
        footer={
          detail && ['draft', 'pending_review', 'approved', 'waitlisted'].includes(detail.status) ? (
            <Button type="primary" danger icon={<BanIcon />} onClick={() => setCancelTarget(detail)}>
              {t('protocol.action.cancelReg')}
            </Button>
          ) : null
        }
      >
        {detail && (
          <div className="protocol-detail-body">
            <div className="protocol-detail-status">
              <StatusTag status={detail.status} />
              <span className="muted-text">{fmtDateTime(detail.submittedAt || detail.createdAt)}</span>
            </div>

            <h4>{t('protocol.my.eventInfo')}</h4>
            <Card hoverable onClick={() => navigate(`/protocol/events/${detail.event.eventNo}`)}>
              <strong>{detail.event.title}</strong>
              <p className="muted-text">
                {fmtDateTime(detail.event.startsAt)} · {detail.event.venueName}
              </p>
            </Card>

            <h4>{t('protocol.my.formInfo')}</h4>
            <DescList
              rows={[
                [t('protocol.field.nickname'), detail.nickname],
                [t('protocol.field.contact'), detail.contact],
                [t('protocol.field.identityType'), t(`protocol.identity.${detail.identityType}`)],
                [t('protocol.field.identityNo'), detail.identityNo || '-'],
                [t('protocol.field.identityCheck'), t(`protocol.identityCheck.${detail.identityCheck}`, { defaultValue: detail.identityCheck })],
                [t('protocol.field.partySize'), detail.partySize],
                [t('protocol.field.invitationNo'), detail.invitationNo || '-'],
                [t('protocol.field.note'), detail.note || '-'],
              ]}
            />

            {detail.companions.length > 0 && (
              <>
                <h4>{t('protocol.field.companions')}</h4>
                <ul className="protocol-companion-list">
                  {detail.companions.map((c, i) => (
                    <li key={`${c.nickname}-${i}`}>
                      <strong>{c.nickname}</strong>
                      <span className="muted-text">{c.relation || '-'}</span>
                      <span className="muted-text">{c.contact || '-'}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h4>{t('protocol.field.materials')}</h4>
            <ul className="protocol-material-list">
              {detail.materials.map((m) => (
                <li key={m.id}>
                  <FileIcon size={15} />
                  <span className="protocol-material-name">{m.filename}</span>
                  <Button type="text" size="small" icon={<EyeIcon />} onClick={() => openProtocolMaterial(m.id)}>
                    {t('protocol.action.preview')}
                  </Button>
                </li>
              ))}
              {detail.materials.length === 0 && <li className="muted-text">{t('protocol.apply.noMaterials')}</li>}
            </ul>

            {detail.rejectComment && (
              <Card color="app-red">
                <strong>{t('protocol.field.rejectReason')}</strong>
                <p>{detail.rejectComment}</p>
              </Card>
            )}
            {detail.reviewNote && <p className="muted-text">{detail.reviewNote}</p>}

            {detail.pass && (
              <>
                <h4>{t('protocol.my.pass')}</h4>
                <Card color="app-teal">
                  <div className="protocol-inline-between">
                    <div>
                      <strong>{detail.pass.passNo}</strong>
                      <p>{t(`protocol.status.${detail.pass.status}`)}</p>
                    </div>
                    <Button type="default" icon={<SendIcon />} onClick={() => navigate('/protocol/passes')}>
                      {t('protocol.my.viewPass')}
                    </Button>
                  </div>
                </Card>
              </>
            )}

            <h4>{t('protocol.my.timeline')}</h4>
            <ul className="protocol-timeline">
              {(detail.history || []).map((h) => (
                <li key={h.id}>
                  <Tag size="small" variant="soft" color="app-blue">
                    {t(`protocol.history.${h.action}`, { defaultValue: h.action })}
                  </Tag>
                  <span>{h.actorName || 'system'}</span>
                  <span className="muted-text">{fmtDateTime(h.createdAt)}</span>
                </li>
              ))}
              {(!detail.history || detail.history.length === 0) && <li className="muted-text">{t('common.empty')}</li>}
            </ul>
          </div>
        )}
      </Drawer>

      <Modal
        open={cancelTarget !== null}
        title={t('protocol.my.cancelTitle')}
        onClose={() => setCancelTarget(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setCancelTarget(null)}>{t('protocol.action.back')}</Button>
            <Button type="primary" danger loading={busy} onClick={doCancel}>
              {t('protocol.action.confirmCancel')}
            </Button>
          </>
        }
      >
        <p>{t('protocol.my.cancelTip')}</p>
        <TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('protocol.field.reason')} />
      </Modal>
    </div>
  );
}