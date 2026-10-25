// 投诉建议:类型选择(投诉/建议)、分类、匿名开关、内容、状态追踪、
// 处理结果查看与满意度评价。材料在详情页待受理阶段补传。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Checkbox,
  Drawer,
  Input,
  Modal,
  Notification,
  Rate,
  Radio,
  Select,
  Tag,
  Title,
  Upload,
} from 'animal-island-ui';
import { PlusIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { openAppealMaterial, uploadAppealMaterial } from '../../api/appeal.js';
import { TextArea, COMPLAINT_CATEGORIES, COMPLAINT_KINDS, COMPLAINT_STATUS_COLORS, fmtDateTime, toastAppealError } from './shared.jsx';

export default function AppealComplaints() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [kind, setKind] = useState('complaint');
  const [category, setCategory] = useState('attitude');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [anonymous, setAnonymous] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [evalOpen, setEvalOpen] = useState(false);
  const [evalRating, setEvalRating] = useState(0);
  const [evalComment, setEvalComment] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get('/appeal/complaints');
      setItems(data.items);
    } catch (err) {
      toastAppealError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setCategory(COMPLAINT_CATEGORIES[kind][0]);
  }, [kind]);

  const doCreate = async () => {
    setBusy(true);
    try {
      const data = await api.post('/appeal/complaints', {
        kind,
        category,
        anonymous: anonymous.length > 0,
        content,
        contact: anonymous.length > 0 ? '' : contact,
      });
      Notification.success(t('appeal.complaint.submitDone', { no: data.complaint.code }));
      setCreateOpen(false);
      setContent('');
      setContact('');
      setAnonymous([]);
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (c) => {
    try {
      const data = await api.get(`/appeal/complaints/${c.id}`);
      setDetail(data.complaint);
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const openEvaluate = () => {
    setEvalRating(detail?.rating || 0);
    setEvalComment(detail?.ratingComment || '');
    setEvalOpen(true);
  };

  const doEvaluate = async () => {
    setBusy(true);
    try {
      await api.post(`/appeal/complaints/${detail.id}/evaluate`, { rating: evalRating, comment: evalComment });
      Notification.success(t('appeal.detail.evalDone'));
      setEvalOpen(false);
      const data = await api.get(`/appeal/complaints/${detail.id}`);
      setDetail(data.complaint);
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const uploadToDetail = ({ file, onProgress, onSuccess, onError }) => {
    uploadAppealMaterial({ ownerType: 'complaint', ownerId: detail.id, kind: 'proof', file, onProgress })
      .then((m) => {
        onSuccess(m);
        openDetail(detail);
      })
      .catch((err) => {
        Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
        onError(err);
      });
  };

  const isAnonymous = anonymous.length > 0;

  return (
    <div className="appeal-list-page">
      <div className="page-header">
        <Title size="middle">{t('appeal.complaint.title')}</Title>
        <div className="table-actions appeal-filter-bar">
          <Button type="primary" icon={<PlusIcon />} onClick={() => setCreateOpen(true)}>
            {t('appeal.complaint.create')}
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

      {(items ?? []).map((c) => (
        <Card key={c.id} hoverable className="appeal-item-card" onClick={() => openDetail(c)}>
          <div className="appeal-item-head">
            <strong>{c.code}</strong>
            <Tag variant="soft" color={c.kind === 'complaint' ? 'app-red' : 'app-teal'}>
              {t(`appeal.complaintKind.${c.kind}`)}
            </Tag>
            <Tag color={COMPLAINT_STATUS_COLORS[c.status] || 'default'} variant="soft">
              {t(`appeal.complaintStatus.${c.status}`)}
            </Tag>
            {c.anonymous && <Tag variant="outlined">{t('appeal.complaint.anonymousTag')}</Tag>}
          </div>
          <p className="muted-text">
            {t(`appeal.complaintCategory.${c.category}`)} · {t('appeal.my.submittedAt', { time: fmtDateTime(c.submittedAt || c.createdAt) })}
          </p>
          <p className="appeal-item-reason">{c.content}</p>
          {c.reply && (
            <p className="appeal-item-reply">
              {t('appeal.complaint.replyLabel')}: {c.reply}
            </p>
          )}
        </Card>
      ))}

      <Modal
        open={createOpen}
        title={t('appeal.complaint.createTitle')}
        onClose={() => setCreateOpen(false)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button
              type="primary"
              loading={busy}
              disabled={content.trim().length < 10 || (!isAnonymous && !contact.trim())}
              onClick={doCreate}
            >
              {t('appeal.complaint.submit')}
            </Button>
          </>
        }
      >
        <div className="appeal-complaint-form">
          <p>{t('appeal.complaint.kindLabel')}</p>
          <Radio value={kind} onChange={setKind} options={COMPLAINT_KINDS.map((k) => ({ label: t(`appeal.complaintKind.${k}`), value: k }))} />
          <p>{t('appeal.complaint.categoryLabel')}</p>
          <Select
            value={category}
            onChange={setCategory}
            options={COMPLAINT_CATEGORIES[kind].map((c) => ({ key: c, label: t(`appeal.complaintCategory.${c}`) }))}
          />
          <p>{t('appeal.complaint.contentLabel')}</p>
          <TextArea rows={5} maxLength={2000} value={content} onChange={(e) => setContent(e.target.value)} placeholder={t('appeal.complaint.contentPlaceholder')} />
          <Checkbox
            options={[{ label: t('appeal.complaint.anonymousOption'), value: 'anon' }]}
            value={anonymous}
            onChange={setAnonymous}
          />
          {isAnonymous ? (
            <p className="muted-text appeal-anon-tip">{t('appeal.complaint.anonymousTip')}</p>
          ) : (
            <>
              <p>{t('appeal.complaint.contactLabel')}</p>
              <Input
                size="large"
                allowClear
                maxLength={100}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={t('appeal.complaint.contactPlaceholder')}
              />
            </>
          )}
        </div>
      </Modal>

      <Drawer open={!!detail} title={detail?.code} onClose={() => setDetail(null)} width={520}>
        {detail && (
          <div className="appeal-detail-body">
            <dl className="appeal-field-list">
              <div>
                <dt>{t('common.status')}</dt>
                <dd>
                  <Tag color={COMPLAINT_STATUS_COLORS[detail.status] || 'default'} variant="soft">
                    {t(`appeal.complaintStatus.${detail.status}`)}
                  </Tag>
                  <Tag variant="soft" color={detail.kind === 'complaint' ? 'app-red' : 'app-teal'}>
                    {t(`appeal.complaintKind.${detail.kind}`)}
                  </Tag>
                  <Tag variant="outlined">{t(`appeal.complaintCategory.${detail.category}`)}</Tag>
                </dd>
              </div>
              <div>
                <dt>{t('appeal.complaint.contentLabel')}</dt>
                <dd>{detail.content}</dd>
              </div>
              <div>
                <dt>{t('appeal.my.submittedAtLabel')}</dt>
                <dd>{fmtDateTime(detail.submittedAt)}</dd>
              </div>
              {detail.reply && (
                <div>
                  <dt>{t('appeal.complaint.replyLabel')}</dt>
                  <dd>
                    {detail.reply}
                    <p className="muted-text">
                      {detail.repliedName} · {fmtDateTime(detail.repliedAt)}
                    </p>
                  </dd>
                </div>
              )}
            </dl>
            {detail.status === 'pending_accept' && (
              <div className="appeal-materials-section">
                <Upload accept="image/*,application/pdf" showUploadList={false} customRequest={uploadToDetail}>
                  {t('appeal.detail.uploadSupplement')}
                </Upload>
              </div>
            )}
            <ul className="appeal-material-list">
              {(detail.materials ?? []).map((m) => (
                <li key={m.id}>
                  <Tag variant="soft" color="app-blue" size="small">
                    {t(`appeal.materialKind.${m.kind}`)}
                  </Tag>
                  <span>{m.filename}</span>
                  <Button type="text" size="small" onClick={() => openAppealMaterial(m.id)}>
                    {t('appeal.my.preview')}
                  </Button>
                </li>
              ))}
            </ul>
            {['replied', 'closed'].includes(detail.status) && !detail.rating && (
              <Button onClick={openEvaluate}>{t('appeal.detail.evaluate')}</Button>
            )}
            {detail.rating ? (
              <p className="muted-text">
                <Rate value={detail.rating} readonly size="small" /> {detail.ratingComment}
              </p>
            ) : null}
          </div>
        )}
      </Drawer>

      <Modal
        open={evalOpen}
        title={t('appeal.detail.evaluateTitle')}
        onClose={() => setEvalOpen(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setEvalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!evalRating} onClick={doEvaluate}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="appeal-eval-body">
          <Rate value={evalRating} onChange={setEvalRating} />
          <TextArea rows={3} maxLength={300} value={evalComment} onChange={(e) => setEvalComment(e.target.value)} placeholder={t('appeal.detail.evalPlaceholder')} />
        </div>
      </Modal>
    </div>
  );
}
