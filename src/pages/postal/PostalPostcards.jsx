// 虚拟明信片:收件箱、发件记录与收藏夹;支持签收、收藏与软删除。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Modal, Pagination, Tabs, Tag, Title } from 'animal-island-ui';
import { InboxIcon, MailIcon, SendIcon, StarIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastSuccess } from '../../components/toast.js';
import { POSTCARD_STATUS_COLORS, fmtDateTime, toastPostError } from './shared.jsx';

const PAGE_SIZE = 12;

const EMPTY = { items: [], total: 0, counts: { inbox: 0, unopened: 0, sent: 0, favorites: 0 }, dailyLimit: 10, usedToday: 0 };

export default function PostalPostcards() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [box, setBox] = useState('inbox');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ box, page: String(page), pageSize: String(PAGE_SIZE) });
      setData(await api.get(`/postal/postcards?${params.toString()}`));
    } catch (err) {
      toastPostError(t, err);
      setData(EMPTY);
    }
  }, [box, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (card, action, doneMessage) => {
    setBusyId(card.id);
    try {
      if (action === 'favorite') {
        await api.post(`/postal/postcards/${card.id}/favorite`, { favorited: !card.favorited });
      } else {
        await api.post(`/postal/postcards/${card.id}/${action}`);
      }
      if (doneMessage) toastSuccess(doneMessage);
      setDetail(null);
      await load();
    } catch (err) {
      toastPostError(t, err);
    } finally {
      setBusyId('');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.del(`/postal/postcards/${deleteTarget.id}`);
      setDeleteTarget(null);
      setDetail(null);
      toastSuccess(t('common.deleted'));
      await load();
    } catch (err) {
      toastPostError(t, err);
    } finally {
      setDeleteBusy(false);
    }
  };

  const counts = data?.counts ?? EMPTY.counts;
  const items = data?.items ?? [];

  // 页签内容:三个箱共用同一渲染(数据随 box 状态切换),挂在 Tabs 的
  // children 里,避免页签框外浮着一块孤儿内容。
  const postcardPane = (
    <>
      {data === null ? (
        <Card type="dashed">
          <p className="muted-text">{t('common.loading')}</p>
        </Card>
      ) : items.length === 0 ? (
        <Card type="dashed">
          <div className="postal-empty">
            <InboxIcon size={30} />
            <p className="muted-text">{t('post.postcards.empty')}</p>
          </div>
        </Card>
      ) : (
        <div className="postal-postcard-list">
          {items.map((card) => (
            <Card key={card.id} hoverable onClick={() => setDetail(card)}>
              <div className="postal-postcard">
                <div className="postal-postcard-head">
                  <b>{card.templateName}</b>
                  <Tag color={POSTCARD_STATUS_COLORS[card.status] || 'default'} variant="soft" size="small">
                    {t(`post.postcardStatus.${card.status}`)}
                  </Tag>
                </div>
                <p className="postal-postcard-from">
                  {card.direction === 'sent'
                    ? t('post.postcards.toWhom', { name: card.recipientName || card.recipientUsername })
                    : t('post.postcards.fromWhom', { name: card.senderName || card.senderUsername })}
                </p>
                <p className="postal-blessing">{card.blessing}</p>
                <div className="postal-postcard-foot">
                  <span>{card.no}</span>
                  <span>{fmtDateTime(card.sentAt || card.createdAt)}</span>
                </div>
                <div className="postal-msg-actions">
                  {card.direction === 'inbox' && card.status === 'sent' && (
                    <Button
                      size="small"
                      type="primary"
                      loading={busyId === card.id}
                      disabled={!!busyId}
                      onClick={(e) => {
                        e.stopPropagation();
                        act(card, 'receive', t('post.postcards.receivedDone'));
                      }}
                    >
                      {t('post.postcards.receive')}
                    </Button>
                  )}
                  {card.direction === 'inbox' && (
                    <Button
                      size="small"
                      type="text"
                      icon={<StarIcon />}
                      loading={busyId === card.id}
                      disabled={!!busyId}
                      onClick={(e) => {
                        e.stopPropagation();
                        act(card, 'favorite');
                      }}
                    >
                      {card.favorited ? t('post.postcards.unfavorite') : t('post.postcards.favorite')}
                    </Button>
                  )}
                  {card.direction === 'sent' && card.status === 'draft' && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<SendIcon />}
                      loading={busyId === card.id}
                      disabled={!!busyId}
                      onClick={(e) => {
                        e.stopPropagation();
                        act(card, 'send', t('post.postcards.sentDone'));
                      }}
                    >
                      {t('post.postcards.sendNow')}
                    </Button>
                  )}
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<TrashIcon />}
                    disabled={!!busyId}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(card);
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(data?.total ?? 0) > PAGE_SIZE && (
        <Pagination total={data.total} current={page} pageSize={PAGE_SIZE} onChange={setPage} showTotal />
      )}
    </>
  );

  return (
    <div className="postal-section">
      <div className="postal-section-head">
        <Title size="middle" color="app-pink">
          {t('post.postcards.title')}
        </Title>
        <Button type="primary" icon={<MailIcon />} onClick={() => navigate('/postal/postcards/new')}>
          {t('post.postcards.write')}
        </Button>
      </div>

      <div className="postal-quota">
        <Tag color="app-yellow" variant="soft">
          {t('post.postcards.quota', { used: data?.usedToday ?? 0, limit: data?.dailyLimit ?? 10 })}
        </Tag>
        <span>{t('post.postcards.quotaTip')}</span>
      </div>

      <Tabs
        activeKey={box}
        onChange={(key) => {
          setBox(key);
          setPage(1);
        }}
        items={[
          {
            key: 'inbox',
            label: `${t('post.postcards.inbox')} (${counts.inbox})`,
            children: postcardPane,
          },
          {
            key: 'sent',
            label: `${t('post.postcards.sent')} (${counts.sent})`,
            children: postcardPane,
          },
          {
            key: 'favorites',
            label: `${t('post.postcards.favorites')} (${counts.favorites})`,
            children: postcardPane,
          },
        ]}
      />

      <Modal
        maskClosable={false}
        open={!!detail}
        title={detail ? detail.no : ''}
        onClose={() => {
          if (!busyId) setDetail(null);
        }}
        typewriter={false}
        width={520}
        footer={
          <>
            <Button onClick={() => setDetail(null)} disabled={!!busyId}>
              {t('common.close')}
            </Button>
            {detail?.direction === 'inbox' && detail?.status === 'sent' && (
              <Button
                type="primary"
                loading={busyId === detail?.id}
                disabled={!!busyId}
                onClick={() => act(detail, 'receive', t('post.postcards.receivedDone'))}
              >
                {t('post.postcards.receive')}
              </Button>
            )}
          </>
        }
      >
        {detail && (
          <div className="postal-postcard">
            <div className="postal-postcard-head">
              <b>{detail.templateName}</b>
              <Tag color={POSTCARD_STATUS_COLORS[detail.status] || 'default'} variant="soft">
                {t(`post.postcardStatus.${detail.status}`)}
              </Tag>
            </div>
            <div className="postal-kv">
              <span className="muted-text">{t('post.postcards.from')}</span>
              <span>{detail.senderName || detail.senderUsername}</span>
            </div>
            <div className="postal-kv">
              <span className="muted-text">{t('post.postcards.to')}</span>
              <span>{detail.recipientName || detail.recipientUsername}</span>
            </div>
            <p className="postal-blessing">{detail.blessing}</p>
            {detail.takedownReason && (
              <p className="muted-text">{t('post.postcards.takedownReason', { reason: detail.takedownReason })}</p>
            )}
            <div className="postal-kv">
              <span className="muted-text">{t('post.postcards.sentAt')}</span>
              <span>{fmtDateTime(detail.sentAt)}</span>
            </div>
            <div className="postal-kv">
              <span className="muted-text">{t('post.postcards.receivedAt')}</span>
              <span>{fmtDateTime(detail.receivedAt)}</span>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        maskClosable={false}
        open={!!deleteTarget}
        title={t('common.confirmDeleteTitle')}
        onClose={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" danger loading={deleteBusy} disabled={deleteBusy} onClick={confirmDelete}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="muted-text">{t('post.postcards.deleteTip')}</p>
      </Modal>
    </div>
  );
}