// 打卡规则配置:每用户每日打卡上限 + 全站每日打卡上限(0 = 不限)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Title } from 'animal-island-ui';
import { ClipboardIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastError, toastSuccess } from '../../../components/toast.js';
import { toastTourError } from '../shared.jsx';
import { TourAdminNav } from '../TourismShell.jsx';

export default function AdminTourRules() {
  const { t } = useTranslation();
  const [dailyLimit, setDailyLimit] = useState('');
  const [siteDailyLimit, setSiteDailyLimit] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/tourism/admin/config');
      setDailyLimit(String(data.config?.dailyLimit ?? 10));
      setSiteDailyLimit(String(data.config?.siteDailyLimit ?? 0));
    } catch (err) {
      toastTourError(t, err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const digitsOnly = (value) => value.replace(/\D/g, '');

  const save = async () => {
    const daily = Number(dailyLimit);
    const site = Number(siteDailyLimit);
    if (!dailyLimit || !Number.isInteger(daily) || daily < 1 || daily > 100) {
      toastError(t('tour.admin.rules.invalidDaily'));
      return;
    }
    if (siteDailyLimit === '' || !Number.isInteger(site) || site < 0 || site > 100000) {
      toastError(t('tour.admin.rules.invalidSite'));
      return;
    }
    setBusy(true);
    try {
      await api.patch('/tourism/admin/config', { dailyLimit: daily, siteDailyLimit: site });
      toastSuccess(t('common.saved'));
      await load();
    } catch (err) {
      toastTourError(t, err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <TourAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-yellow">
            {t('tour.admin.rules.title')}
          </Title>
        </h1>
      </div>

      <Card className="tour-config-card">
        <p className="muted-text">{t('tour.admin.rules.tip')}</p>
        {loading ? (
          <p className="muted-text">{t('common.loading')}</p>
        ) : (
          <div className="tour-form">
            <label>
              {t('tour.admin.rules.dailyLimit')}
              <Input
                size="large"
                value={dailyLimit}
                placeholder="10"
                onChange={(e) => setDailyLimit(digitsOnly(e.target.value))}
              />
            </label>
            <label>
              {t('tour.admin.rules.siteDailyLimit')}
              <Input
                size="large"
                value={siteDailyLimit}
                placeholder="500"
                onChange={(e) => setSiteDailyLimit(digitsOnly(e.target.value))}
              />
            </label>
            <p className="muted-text tour-config-tip">{t('tour.admin.rules.siteTip')}</p>
            <div className="tour-form-actions">
              <Button
                type="primary"
                icon={<ClipboardIcon />}
                loading={busy}
                disabled={busy}
                onClick={save}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
