// 统一联动字段:优先"从来源署获取我的证件",手动填写作为次要入口。
// 可直接作为 animal-island-ui FormItem 的子节点(接收注入的 value/onChange)。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Tag } from 'animal-island-ui';
import { LinkIcon, SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastApiError } from '../toast.js';
import LinkagePicker from './LinkagePicker.jsx';
import { linkageStatusLabel } from './shared.js';

export default function LinkageField({
  value = '',
  onChange,
  consumer,
  source,
  kind,
  credentialLabel,
  placeholder,
  required = false,
  disabled = false,
  size,
  status,
  id,
  manualSuffix,
  verifyOn = true,
  onPicked,
  onCleared,
  className = '',
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [picked, setPicked] = useState(null);
  const [verifyState, setVerifyState] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  // 来源署切换(文书类型 / 礼遇依据 / 申诉业务类型)时清空上一份选择。
  useEffect(() => {
    setPicked(null);
    setManual(false);
    setVerifyState(null);
  }, [source, consumer, kind]);

  // 外部改写/清空字段值时,已选卡片不再代表当前值。
  useEffect(() => {
    if (picked && String(value || '') !== picked.code) setPicked(null);
  }, [value, picked]);

  if (!source) return null;

  const credential = credentialLabel || t(`linkage.credential.${source}`);
  const showManual = manual || !!value;
  const hasValue = !!String(value || '').trim();

  const verify = async () => {
    const code = String(value || '').trim();
    if (!code) return;
    setVerifyBusy(true);
    try {
      const query = new URLSearchParams({ source, code });
      if (consumer) query.set('consumer', consumer);
      const check = await api.get(`/linkage/verify?${query.toString()}`);
      setVerifyState(check);
    } catch (err) {
      setVerifyState(null);
      toastApiError(t, err);
    } finally {
      setVerifyBusy(false);
    }
  };

  const clear = () => {
    setPicked(null);
    setManual(false);
    setVerifyState(null);
    onChange?.('');
    onCleared?.();
  };

  return (
    <div className={`linkage-field ${className}`.trim()}>
      {picked ? (
        <Card type="dashed" className="linkage-selected">
          <div className="linkage-selected-head">
            <div className="linkage-selected-title">
              <strong>{picked.name || picked.code}</strong>
              {picked.name && <span className="linkage-selected-code">{picked.code}</span>}
            </div>
            <div className="linkage-selected-tags">
              <Tag size="small" color={picked.valid ? 'app-green' : 'app-orange'} variant="soft">
                {linkageStatusLabel(t, source, picked.kind, picked.status)}
              </Tag>
              <Tag size="small" color="app-teal" variant="soft">
                {t('linkage.picker.owned')}
              </Tag>
            </div>
          </div>
          <div className="linkage-selected-meta">
            {picked.holder && <span>{t('linkage.picker.holder', { name: picked.holder })}</span>}
            {picked.issuedAt && <span>{t('linkage.picker.issuedAt', { date: picked.issuedAt })}</span>}
            {picked.validUntil && <span>{t('linkage.picker.validUntil', { date: picked.validUntil })}</span>}
          </div>
          <div className="linkage-selected-actions">
            <Button size="small" disabled={disabled} onClick={() => setPickerOpen(true)}>
              {t('linkage.picker.change')}
            </Button>
            <Button size="small" type="text" disabled={disabled} onClick={clear}>
              {t('linkage.picker.clear')}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="linkage-field-actions">
            <Button
              type="primary"
              size="small"
              icon={<LinkIcon />}
              disabled={disabled}
              onClick={() => setPickerOpen(true)}
            >
              {t('linkage.picker.fetch', { credential })}
            </Button>
            {!showManual && (
              <Button type="link" size="small" disabled={disabled} onClick={() => setManual(true)}>
                {t('linkage.picker.manual')}
              </Button>
            )}
          </div>
          {showManual && (
            <div className="linkage-manual">
              <Input
                id={id}
                size={size}
                status={status}
                disabled={disabled}
                allowClear
                value={value}
                placeholder={placeholder}
                onChange={(e) => {
                  setVerifyState(null);
                  onChange?.(e.target.value);
                }}
                suffix={
                  manualSuffix ??
                  (verifyOn ? (
                    <Button
                      type="text"
                      size="small"
                      icon={<SearchIcon />}
                      loading={verifyBusy}
                      disabled={disabled || !hasValue}
                      onClick={verify}
                    >
                      {t('linkage.verify.action')}
                    </Button>
                  ) : null)
                }
              />
              {required && !hasValue && <span className="muted-text linkage-required-hint">{t('common.required')}</span>}
              {verifyState && (
                <div className="linkage-verify-result">
                  {verifyState.owned ? (
                    <Tag size="small" color="app-green" variant="soft">
                      {t('linkage.verify.owned', {
                        status: linkageStatusLabel(t, source, verifyState.kind, verifyState.status),
                      })}
                    </Tag>
                  ) : verifyState.found && !verifyState.personal ? (
                    <Tag size="small" color="app-red" variant="soft">
                      {t('linkage.verify.notPersonal')}
                    </Tag>
                  ) : verifyState.found ? (
                    <Tag size="small" color="app-red" variant="soft">
                      {t('linkage.verify.notOwned')}
                    </Tag>
                  ) : (
                    <Tag size="small" color="app-orange" variant="soft">
                      {t('linkage.verify.notFound')}
                    </Tag>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <LinkagePicker
        open={pickerOpen}
        consumer={consumer}
        source={source}
        kind={kind}
        credentialLabel={credential}
        onClose={() => setPickerOpen(false)}
        onPick={(item) => {
          setPicked(item);
          setManual(false);
          setVerifyState(null);
          onChange?.(item.code, item);
          onPicked?.(item);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}