// 我的申诉列表:状态筛选、草稿编辑/删除入口、状态追踪与处理结果摘要。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Modal, Pagination, Select, Tag, Title } from 'animal-island-ui';
import { EditIcon, EyeIcon, PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { APPEAL_STATUS_COLORS, DECISION_TYPE_COLORS, fmtDateTime, toastAppealError } from './shared.jsx';
import { toastSuccess } from '../../components/toast.js';

const STATUS_FILTERS = ['', 'draft', 'pending_accept', 'accepted', 'processing', 'supplement_required', 'resolved', 'rejected', 'withdrawn', 'closed'];

export default function AppealMyAppeals() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [delTarget, setDelTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const pageSize = 10;

  const load = useCallback(async () => {
    try {
      const data = await api.get(status ? `/appeal/appeals?status=${status}` : '/appeal/appeals');
      setItems(data.items);
    } catch (err) {
      toastAppealError(t, err);
      setItems([]);
    }
  }, [status, t]);

  useEffect(() => {
    load();
  }, [load]);

  const doDelete = async () => {
    if (!delTarget) return;
    setBusy(true);
    try {
      await api.del(`/appeal/appeals/${delTarget.id}`);
      toastSuccess(t('common.deleted'));
      setDelTarget(null);
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const total = items?.length ?? 0;
  const pageItems = (items ?? []).slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="appeal-list-page">
      <div className="page-header">
        <Title size="middle">{t('appeal.my.title')}</Title>
        <div className="table-actions appeal-filter-bar">
          <Select
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={STATUS_FILTERS.map((s) => ({ key: s, label: s === '' ? t('appeal.my.allStatus') : t(`appeal.status.${s}`) }))}
          />
          <Button type="primary" icon={<PlusIcon />} onClick={() => navigate('/appeal/apply')}>
            {t('appeal.home.entryApply')}
          </Button>
        </div>
      </div>

      {items === null && (
        <Card type="dashed">
          <p className="muted-text">{t('common.loading')}</p>
        </Card>
      )}

      {items !== null && pageItems.length === 0 && (
        <Card type="dashed">
          <p className="muted-text">{t('common.empty')}</p>
        </Card>
      )}

      {pageItems.map((a) => (
        <Card key={a.id} hoverable className="appeal-item-card" onClick={() => navigate(`/appeal/appeals/${a.id}`)}>
          <div className="appeal-item-head">
            <strong>{a.code}</strong>
            <Tag color={APPEAL_STATUS_COLORS[a.status] || 'default'} variant="soft">
              {t(`appeal.status.${a.status}`)}
            </Tag>
            {a.decisionType && (
              <Tag color={DECISION_TYPE_COLORS[a.decisionType] || 'default'} variant="outlined">
                {t(`appeal.decisionType.${a.decisionType}`)}
              </Tag>
            )}
          </div>
          <p className="muted-text">
            {t(`appeal.bizType.${a.bizType}`)} · {a.bizCode} · {t('appeal.my.submittedAt', { time: fmtDateTime(a.submittedAt || a.createdAt) })}
          </p>
          <p className="appeal-item-reason">{a.reason}</p>
          <div className="appeal-item-actions" onClick={(e) => e.stopPropagation()}>
            <Button type="text" size="small" icon={<EyeIcon />} onClick={() => navigate(`/appeal/appeals/${a.id}`)}>
              {t('appeal.my.view')}
            </Button>
            {a.status === 'draft' && (
              <>
                <Button type="text" size="small" icon={<EditIcon />} onClick={() => navigate(`/appeal/apply/${a.id}`)}>
                  {t('common.edit')}
                </Button>
                <Button type="text" size="small" danger icon={<TrashIcon />} onClick={() => setDelTarget(a)}>
                  {t('common.delete')}
                </Button>
              </>
            )}
          </div>
        </Card>
      ))}

      {total > pageSize && (
        <div className="appeal-pagination">
          <Pagination total={total} current={page} pageSize={pageSize} onChange={setPage} showTotal />
        </div>
      )}

      <Modal
        open={!!delTarget}
        title={t('appeal.my.deleteTitle')}
        onClose={() => setDelTarget(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setDelTarget(null)}>{t('common.cancel')}</Button>
            <Button type="primary" danger loading={busy} onClick={doDelete} disabled={busy}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p>
          {t('appeal.my.deleteTip', { no: delTarget?.code })}
        </p>
      </Modal>
    </div>
  );
}
