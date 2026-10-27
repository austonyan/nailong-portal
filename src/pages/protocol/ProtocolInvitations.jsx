// 我的邀请函:查看、接受/拒绝、下载(打印)与验真;说明可作为签注材料。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Modal, Tag, Title } from 'animal-island-ui';
import { CalendarIcon, CheckCircleIcon, DownloadIcon, MailIcon, SearchIcon, XCircleIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { StatusTag, downloadProtocolFile, fmtDate, fmtDateTime, toastProtocolError } from './shared.jsx';
import { toastSuccess } from './shared.jsx';

export default function ProtocolInvitations() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/protocol/invitations');
      setItems(data.items);
    } catch (err) {
      toastProtocolError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      await api.post(`/protocol/invitations/${action.invitation.id}/${action.kind}`);
      toastSuccess(action.kind === 'accept' ? t('protocol.invitations.accepted') : t('protocol.invitations.declined'));
      setAction(null);
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const download = async (inv) => {
    try {
      await downloadProtocolFile(`/protocol/invitations/${inv.id}/file`, `${inv.inviteNo}.html`);
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('protocol.invitations.title')}</Title>
        <p className="muted-text">{t('protocol.invitations.subtitle')}</p>
      </div>

      <Card color="app-blue" className="protocol-info-card">
        <MailIcon size={20} />
        <p>{t('protocol.invitations.usage')}</p>
      </Card>

      <div className="protocol-invitation-grid">
        {(items ?? []).map((inv) => (
          <Card key={inv.id} className={`protocol-invitation-card ${inv.status}`}>
            <div className="protocol-invitation-head">
              <Tag color="app-teal" variant="solid">{inv.typeName}</Tag>
              <StatusTag status={inv.status} />
            </div>
            <h3>{inv.eventTitle}</h3>
            <p className="protocol-invitation-no">{inv.inviteNo}</p>
            <div className="protocol-event-meta">
              <span><CalendarIcon size={14} /> {fmtDateTime(inv.eventStartsAt)}</span>
              <span><MailIcon size={14} /> {t('protocol.invitations.inviter')}: {inv.inviterName || '-'}</span>
            </div>
            <div className="protocol-invitation-meta">
              <Tag variant="outlined" size="small">{t('protocol.invitations.validUntil', { date: fmtDate(inv.validUntil) })}</Tag>
              <Tag variant="outlined" size="small" color={inv.response === 'accepted' ? 'app-green' : inv.response === 'declined' ? 'app-red' : 'default'}>
                {t(`protocol.invitations.response_${inv.response}`)}
              </Tag>
            </div>
            {inv.note && <p className="muted-text">{inv.note}</p>}
            <div className="protocol-invitation-actions">
              {inv.status === 'valid' && inv.response === 'pending' && (
                <>
                  <Button type="primary" size="small" icon={<CheckCircleIcon />} onClick={() => setAction({ kind: 'accept', invitation: inv })}>
                    {t('protocol.action.accept')}
                  </Button>
                  <Button type="default" size="small" danger icon={<XCircleIcon />} onClick={() => setAction({ kind: 'decline', invitation: inv })}>
                    {t('protocol.action.decline')}
                  </Button>
                </>
              )}
              <Button type="text" size="small" icon={<DownloadIcon />} onClick={() => download(inv)}>
                {t('protocol.action.download')}
              </Button>
              <Button
                type="text"
                size="small"
                icon={<SearchIcon />}
                onClick={() => navigate(`/protocol/verify?no=${encodeURIComponent(inv.inviteNo)}`)}
              >
                {t('protocol.action.verify')}
              </Button>
            </div>
            {inv.status === 'used' && <p className="protocol-status-note">{t('protocol.invitations.usedTip')}</p>}
          </Card>
        ))}
        {items && items.length === 0 && (
          <Card type="dashed" className="protocol-empty-card">
            <MailIcon size={28} />
            <p className="muted-text">{t('protocol.invitations.empty')}</p>
            <Button type="dashed" onClick={() => navigate('/protocol/events')}>
              {t('protocol.home.browseEvents')}
            </Button>
          </Card>
        )}
      </div>

      <Modal
        maskClosable={false}
        open={action !== null}
        title={action?.kind === 'accept' ? t('protocol.invitations.acceptTitle') : t('protocol.invitations.declineTitle')}
        onClose={() => setAction(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setAction(null)}>{t('protocol.action.back')}</Button>
            <Button type="primary" danger={action?.kind === 'decline'} loading={busy} onClick={runAction} disabled={busy}>
              {t('protocol.action.confirm')}
            </Button>
          </>
        }
      >
        <p>{action?.kind === 'accept' ? t('protocol.invitations.acceptTip') : t('protocol.invitations.declineTip')}</p>
        {action && <p className="muted-text">{action.invitation.eventTitle} · {action.invitation.inviteNo}</p>}
      </Modal>
    </div>
  );
}