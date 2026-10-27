// 从来源署列出当前 SSO 账户自己的记录,选中后回填编号。
// 打开前必须先通过会话级授权弹窗;列表本身已由服务端按 user_id 过滤。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Modal, Skeleton, Tag } from 'animal-island-ui';
import { InboxIcon, RefreshIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastApiError } from '../toast.js';
import LinkageConsentModal from './LinkageConsentModal.jsx';
import { grantLinkageConsent, hasLinkageConsent, linkageStatusLabel } from './shared.js';

export default function LinkagePicker({ open, consumer, source, kind, credentialLabel, onClose, onPick }) {
  const { t } = useTranslation();
  const [consented, setConsented] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  const credential = credentialLabel || t(`linkage.credential.${source}`);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setError('');
      return;
    }
    if (hasLinkageConsent(consumer, source)) {
      setConsented(true);
      setConsentOpen(false);
    } else {
      setConsented(false);
      setConsentOpen(true);
    }
  }, [open, consumer, source]);

  useEffect(() => {
    if (!open || !consented) return undefined;
    let alive = true;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ source, consumer });
    if (kind) query.set('kind', kind);
    api
      .get(`/linkage/records?${query.toString()}`)
      .then((data) => {
        if (alive) setRecords(data.records || []);
      })
      .catch((err) => {
        if (!alive) return;
        setRecords([]);
        setError(t('linkage.picker.failed'));
        toastApiError(t, err);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, consented, source, consumer, kind, reloadTick, t]);

  if (!open) return null;

  if (!consented) {
    return (
      <LinkageConsentModal
        open={consentOpen}
        consumer={consumer}
        source={source}
        credentialLabel={credential}
        onCancel={() => {
          setConsentOpen(false);
          onClose();
        }}
        onConfirm={() => {
          grantLinkageConsent(consumer, source);
          setConsentOpen(false);
          setConsented(true);
        }}
      />
    );
  }

  const selectedKey = selected ? `${selected.kind}:${selected.code}` : '';

  return (
    <Modal
      maskClosable={false}
      open={open}
      width={680}
      title={t('linkage.picker.title', { credential })}
      onClose={onClose}
      typewriter={false}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="primary"
            disabled={!selected || loading}
            onClick={() => {
              if (selected) onPick(selected);
            }}
          >
            {t('linkage.picker.pick')}
          </Button>
        </>
      }
    >
      <div className="linkage-picker-body">
        <p className="muted-text">{t('linkage.picker.subtitle', { source: t(`linkage.office.${source}`) })}</p>

        {loading && <Skeleton variant="paragraph" rows={4} />}

        {!loading && error && (
          <Card color="app-red" className="linkage-picker-error">
            <p>{error}</p>
            <Button size="small" icon={<RefreshIcon />} onClick={() => setReloadTick((n) => n + 1)}>
              {t('linkage.picker.retry')}
            </Button>
          </Card>
        )}

        {!loading && !error && records.length === 0 && (
          <Card type="dashed" className="linkage-picker-empty">
            <InboxIcon size={28} />
            <p>{t('linkage.picker.empty', { source: t(`linkage.office.${source}`) })}</p>
            <p className="muted-text">{t('linkage.picker.manualHint')}</p>
          </Card>
        )}

        {!loading && !error && records.length > 0 && (
          <div className="linkage-record-list">
            {records.map((item) => {
              const key = `${item.kind}:${item.code}`;
              return (
                <Card
                  key={key}
                  hoverable
                  color={selectedKey === key ? 'app-yellow' : 'default'}
                  className="linkage-record"
                  onClick={() => setSelected(item)}
                >
                  <div className="linkage-record-head">
                    <div className="linkage-record-title">
                      <strong>{item.name || item.code}</strong>
                      {item.name && <span className="linkage-record-code">{item.code}</span>}
                    </div>
                    <div className="linkage-record-tags">
                      <Tag size="small" color={item.valid ? 'app-green' : 'app-orange'} variant="soft">
                        {linkageStatusLabel(t, source, item.kind, item.status)}
                      </Tag>
                      <Tag size="small" variant="soft">
                        {t(`linkage.kind.${item.kind}`, { defaultValue: item.kind })}
                      </Tag>
                      {item.appealable && (
                        <Tag size="small" color="app-blue" variant="soft">
                          {t('linkage.picker.appealable')}
                        </Tag>
                      )}
                    </div>
                  </div>
                  <div className="linkage-record-meta">
                    {item.holder && <span>{t('linkage.picker.holder', { name: item.holder })}</span>}
                    {item.issuedAt && <span>{t('linkage.picker.issuedAt', { date: item.issuedAt })}</span>}
                    {item.validUntil && <span>{t('linkage.picker.validUntil', { date: item.validUntil })}</span>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}