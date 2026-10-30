// 公告订阅与通知偏好:订阅开关 + 按署逐个开关(关闭后该署消息不再进入信箱)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Switch, Tag, Title } from 'animal-island-ui';
import { BellIcon, BellOffIcon, RssIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastSuccess } from '../../components/toast.js';
import { POSTAL_SOURCES, sourceLabel, toastPostError } from './shared.jsx';

export default function PostalSubscription() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [busyKey, setBusyKey] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await api.get('/postal/subscription');
      setData({
        subscribed: !!result.subscribed,
        preferences: result.preferences || {},
        sources: Array.isArray(result.sources) && result.sources.length ? result.sources : POSTAL_SOURCES,
      });
    } catch (err) {
      toastPostError(t, err);
      setData({ subscribed: false, preferences: {}, sources: POSTAL_SOURCES });
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSubscription = async (next) => {
    setBusyKey('subscription');
    try {
      await api.put('/postal/subscription', { subscribed: next });
      toastSuccess(next ? t('post.subscription.subscribedDone') : t('post.subscription.unsubscribedDone'));
      await load();
    } catch (err) {
      toastPostError(t, err);
    } finally {
      setBusyKey('');
    }
  };

  const toggleSource = async (source, next) => {
    setBusyKey(source);
    try {
      await api.put('/postal/preferences', { source, enabled: next });
      await load();
    } catch (err) {
      toastPostError(t, err);
    } finally {
      setBusyKey('');
    }
  };

  const sources = data?.sources ?? POSTAL_SOURCES;

  return (
    <div className="postal-section">
      <h1 className="page-title">
        <Title size="middle" color="app-teal">
          {t('post.subscription.title')}
        </Title>
      </h1>

      <Card pattern="app-yellow">
        <div className="postal-postcard-head">
          <div>
            <b>{t('post.subscription.noticeTitle')}</b>
            <p className="muted-text">{t('post.subscription.noticeTip')}</p>
          </div>
          <Switch
            checked={!!data?.subscribed}
            loading={busyKey === 'subscription'}
            onChange={toggleSubscription}
          />
        </div>
      </Card>

      <Card>
        <div className="postal-section-head">
          <div>
            <b>{t('post.subscription.prefTitle')}</b>
            <p className="muted-text">{t('post.subscription.prefTip')}</p>
          </div>
          <Tag color="app-blue" variant="soft">
            {t('post.subscription.sourcesCount', { count: sources.length })}
          </Tag>
        </div>
        <div className="postal-notice-list">
          {sources.map((source) => {
            const enabled = data?.preferences?.[source] !== false;
            return (
              <div key={source} className="postal-recipient-item">
                <div>
                  <div className="postal-recipient-name">{sourceLabel(t, source)}</div>
                  <div className="postal-recipient-account">
                    {enabled ? t('post.subscription.sourceOnHint') : t('post.subscription.sourceOffHint')}
                  </div>
                </div>
                <div className="postal-msg-actions">
                  {enabled ? <BellIcon size={18} /> : <BellOffIcon size={18} />}
                  <Switch
                    checked={enabled}
                    loading={busyKey === source}
                    onChange={(next) => toggleSource(source, next)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card type="dashed">
        <div className="postal-msg-actions">
          <RssIcon size={18} />
          <p className="muted-text">{t('post.subscription.privacyTip')}</p>
        </div>
      </Card>
    </div>
  );
}