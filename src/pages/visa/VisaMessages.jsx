// 站内信:提交/补件/审核/签发/到期等通知,已读与归档。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { FolderIcon, InboxIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { fmtDateTime, toastVisaError } from './shared.jsx';

const MESSAGE_COLORS = {
  submitted: 'app-blue',
  supplement_required: 'app-orange',
  approved: 'app-green',
  rejected: 'app-red',
  issued: 'app-teal',
  used: 'app-blue',
  voided: 'app-red',
  expired: 'brown',
  closed: 'default',
  withdrawn: 'brown',
  expiry_reminder: 'app-yellow',
  system: 'default',
};

export default function VisaMessages() {
  const { t } = useTranslation();
  const [archivedView, setArchivedView] = useState(false);
  const [items, setItems] = useState(null);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/visa/messages?archived=${archivedView ? '1' : '0'}`);
      setItems(data.items);
      setUnread(data.unread);
    } catch (err) {
      toastVisaError(t, err);
      setItems([]);
    }
  }, [archivedView, t]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (msg) => {
    if (msg.read) return;
    try {
      await api.post(`/visa/messages/${msg.id}/read`);
      setItems((prev) => prev?.map((m) => (m.id === msg.id ? { ...m, read: true } : m)));
    } catch (err) {
      toastVisaError(t, err);
    }
  };

  const archive = async (msg) => {
    try {
      await api.post(`/visa/messages/${msg.id}/archive`);
      await load();
    } catch (err) {
      toastVisaError(t, err);
    }
  };

  const formatParams = (msg) => {
    const p = { ...msg.params };
    if (p.deadline) p.deadline = fmtDateTime(p.deadline);
    if (p.validUntil) p.validUntil = fmtDateTime(p.validUntil);
    // 驳回通知同时带 reasonCode 和自由文本 reason:模板里插值的是 {{reason}},
    // 先把原因码翻成当前语言,未知码回退到通用文案,不要漏出原始码。
    if (p.reasonCode) {
      p.reason = t(`visa.rejectReason.${p.reasonCode}`, { defaultValue: t('common.unknown') });
    }
    return p;
  };

  return (
    <div className="visa-messages-page">
      <div className="page-header">
        <Title size="middle">{t('visa.msgs.title')}</Title>
        <div className="table-actions">
          <Button type={archivedView ? 'default' : 'primary'} icon={<InboxIcon />} onClick={() => setArchivedView(false)}>
            {t('visa.msgs.inbox')}
            {unread > 0 && <Tag size="small" color="app-red" variant="solid">{unread}</Tag>}
          </Button>
          <Button type={archivedView ? 'primary' : 'default'} icon={<FolderIcon />} onClick={() => setArchivedView(true)}>
            {t('visa.msgs.archived')}
          </Button>
        </div>
      </div>

      {items === null && (
        <Card type="dashed">
          <p className="muted-text">{t('common.loading')}</p>
        </Card>
      )}
      {items !== null && items.length === 0 && (
        <Card type="dashed">
          <p className="muted-text">{t('common.empty')}</p>
        </Card>
      )}

      {items !== null && items.length > 0 && (
        <div className="visa-msg-list">
          {items.map((msg) => (
            <Card
              key={msg.id}
              className={`visa-msg-card ${msg.read ? '' : 'unread'}`}
              hoverable
              onClick={() => markRead(msg)}
            >
              <div className="visa-msg-head">
                <Tag color={MESSAGE_COLORS[msg.type] || 'default'} variant="soft">
                  {t(`visa.msgType.${msg.type}`, { defaultValue: t('common.unknown') })}
                </Tag>
                <strong>{t(`visa.msg.${msg.type}.title`, { ...formatParams(msg), defaultValue: t('visa.msg.system.title') })}</strong>
                <span className="muted-text">{fmtDateTime(msg.createdAt)}</span>
              </div>
              <p className="visa-msg-body">{t(`visa.msg.${msg.type}.body`, { ...formatParams(msg), defaultValue: t('visa.msg.system.body') })}</p>
              {!archivedView && (
                <Button
                  type="text"
                  size="small"
                  icon={<FolderIcon />}
                  onClick={(e) => {
                    e.stopPropagation();
                    archive(msg);
                  }}
                >
                  {t('visa.msgs.archive')}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
