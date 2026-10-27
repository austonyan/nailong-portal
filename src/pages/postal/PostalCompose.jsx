// 写一张虚拟明信片:选模板 → 写祝福语 → 搜索收件人 → 存草稿或立即寄出。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Tag, Title } from 'animal-island-ui';
import { ArrowLeftIcon, SearchIcon, SendIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastError, toastSuccess, toastWarning } from '../../components/toast.js';
import { PostTextarea, toastPostError } from './shared.jsx';

export default function PostalCompose() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState(null);
  const [quota, setQuota] = useState({ usedToday: 0, dailyLimit: 10 });
  const [templateCode, setTemplateCode] = useState('');
  const [blessing, setBlessing] = useState('');
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false); // 是否已执行过一次成功搜索(空结果要给出说明)
  const [searching, setSearching] = useState(false);
  const [recipient, setRecipient] = useState(null);
  const [busy, setBusy] = useState('');

  const loadBase = useCallback(async () => {
    try {
      const [tplData, cardData] = await Promise.all([
        api.get('/postal/card-templates'),
        api.get('/postal/postcards?box=sent&pageSize=1'),
      ]);
      setTemplates(tplData.items);
      setQuota({ usedToday: cardData.usedToday ?? 0, dailyLimit: cardData.dailyLimit ?? 10 });
      if (tplData.items.length) {
        setTemplateCode((prev) => prev || tplData.items[0].code);
      }
    } catch (err) {
      toastPostError(t, err);
      setTemplates([]);
    }
  }, [t]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  const search = async () => {
    const q = keyword.trim();
    if (!q) {
      toastError(t('common.required'));
      return;
    }
    setSearching(true);
    try {
      const data = await api.get(`/postal/recipients?q=${encodeURIComponent(q)}`);
      setResults(data.items);
      setSearched(true);
    } catch (err) {
      toastPostError(t, err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const submit = async (sendNow) => {
    if (!templateCode || !recipient || !blessing.trim()) {
      toastError(t('common.required'));
      return;
    }
    if (sendNow && quota.usedToday >= quota.dailyLimit) {
      toastWarning(t('post.compose.quotaReached'));
      return;
    }
    setBusy(sendNow ? 'send' : 'draft');
    try {
      await api.post('/postal/postcards', {
        templateCode,
        blessing: blessing.trim(),
        recipientId: recipient.id,
        send: sendNow,
      });
      toastSuccess(sendNow ? t('post.compose.sentDone') : t('post.compose.draftDone'));
      navigate('/postal/postcards');
    } catch (err) {
      toastPostError(t, err);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="postal-section">
      <div className="postal-section-head">
        <Button type="text" size="small" icon={<ArrowLeftIcon />} onClick={() => navigate('/postal/postcards')}>
          {t('post.compose.back')}
        </Button>
        <Tag color="app-yellow" variant="soft">
          {t('post.postcards.quota', { used: quota.usedToday, limit: quota.dailyLimit })}
        </Tag>
      </div>

      <Title size="middle" color="app-orange">
        {t('post.compose.title')}
      </Title>

      <Card>
        <b>{t('post.compose.pickTemplate')}</b>
        <div className="postal-card-grid" style={{ marginTop: 10 }}>
          {(templates ?? []).map((tpl) => (
            <div
              key={tpl.id}
              className={`postal-card-tile${templateCode === tpl.code ? ' selected' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setTemplateCode(tpl.code)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setTemplateCode(tpl.code);
              }}
            >
              <Card color={tpl.color}>
                <div className="postal-card-preview">
                  <span className="postal-card-name">{tpl.name}</span>
                  <span className="postal-card-desc">{tpl.description}</span>
                </div>
              </Card>
            </div>
          ))}
        </div>
        {templates !== null && templates.length === 0 && (
          <p className="muted-text">{t('post.compose.noTemplates')}</p>
        )}
      </Card>

      <Card>
        <label className="postal-field postal-field-wide">
          <span>
            {t('post.compose.blessing')} *
          </span>
          <PostTextarea
            rows={5}
            maxLength={200}
            value={blessing}
            placeholder={t('post.compose.blessingPlaceholder')}
            onChange={(e) => setBlessing(e.target.value)}
          />
        </label>
        <p className="muted-text">{t('post.compose.blessingTip', { count: blessing.length })}</p>
      </Card>

      <Card>
        <b>{t('post.compose.pickRecipient')} *</b>
        <div className="postal-filter-bar" style={{ marginTop: 10, marginBottom: 0 }}>
          <Input
            size="middle"
            allowClear
            value={keyword}
            placeholder={t('post.compose.searchPlaceholder')}
            onChange={(e) => setKeyword(e.target.value)}
            onClear={() => {
              setKeyword('');
              setResults([]);
              setSearched(false);
            }}
          />
          <Button icon={<SearchIcon />} loading={searching} onClick={search}>
            {t('common.search')}
          </Button>
        </div>
        {recipient ? (
          <div className="postal-recipient-item" style={{ marginTop: 10 }}>
            <div>
              <div className="postal-recipient-name">{recipient.displayName || recipient.username}</div>
              <div className="postal-recipient-account">@{recipient.username}</div>
            </div>
            <Tag color="app-green" variant="soft">
              {t('post.compose.selected')}
            </Tag>
          </div>
        ) : (
          <div className="postal-recipient-list">
            {results.length === 0 ? (
              <p className="muted-text">
                {searched ? t('post.compose.searchEmpty') : t('post.compose.searchHint')}
              </p>
            ) : (
              results.map((user) => (
                <div key={user.id} className="postal-recipient-item">
                  <div>
                    <div className="postal-recipient-name">{user.displayName || user.username}</div>
                    <div className="postal-recipient-account">@{user.username}</div>
                  </div>
                  <Button size="small" onClick={() => setRecipient(user)}>
                    {t('post.compose.pick')}
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      <div className="postal-hero-actions">
        <Button
          type="primary"
          icon={<SendIcon />}
          loading={busy === 'send'}
          disabled={!!busy || quota.usedToday >= quota.dailyLimit}
          onClick={() => submit(true)}
        >
          {t('post.compose.sendNow')}
        </Button>
        <Button loading={busy === 'draft'} disabled={!!busy} onClick={() => submit(false)}>
          {t('post.compose.saveDraft')}
        </Button>
      </div>
    </div>
  );
}