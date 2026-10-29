import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Form, FormItem, Input, Progress, Tag, Title, useForm } from 'animal-island-ui';
import { CheckCircleIcon, KeyIcon, LockIcon, ShieldIcon, SailboatIcon } from 'naive-icons';
import AuthLayout from '../components/AuthLayout.jsx';
import LanguageSelect from '../components/LanguageSelect.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSetup } from '../setup/SetupContext.jsx';
import { toastSuccess, toastError, toastApiError } from '../components/toast.js';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const TOTAL_STEPS = 3;

const POINTS = [
  { icon: ShieldIcon, titleKey: 'setup.pointReadyTitle', bodyKey: 'setup.pointReadyBody' },
  { icon: KeyIcon, titleKey: 'setup.pointAdminTitle', bodyKey: 'setup.pointAdminBody' },
  { icon: LockIcon, titleKey: 'setup.pointCloseTitle', bodyKey: 'setup.pointCloseBody' },
];

export default function Setup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setupAdmin } = useAuth();
  const { refresh } = useSetup();
  const [form] = useForm();
  const [step, setStep] = useState('welcome');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step === 'account' && draft) form.setFieldsValue(draft);
  }, [step, draft, form]);

  const stepIndex = step === 'welcome' ? 1 : step === 'account' ? 2 : 3;
  const percent = Math.round((stepIndex / TOTAL_STEPS) * 100);

  const finishAccount = (values) => {
    setDraft({
      username: values.username.trim(),
      displayName: values.displayName.trim(),
      email: values.email.trim(),
      password: values.password,
    });
    setStep('review');
  };

  const complete = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      await setupAdmin(draft);
      // Keep the local latch "required" until the operator leaves the wizard so
      // the success screen can still be shown; the server has already closed
      // the entry point at this moment.
      setStep('done');
      toastSuccess(t('setup.successTitle'));
    } catch (err) {
      // Another tab finished the wizard first: refresh the latch and leave the
      // now-closed entry point.
      if (err?.code === 'SETUP_COMPLETE') {
        await refresh();
        toastError(t('api.SETUP_COMPLETE'));
        navigate('/login', { replace: true });
        return;
      }
      toastApiError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const enterPortal = async () => {
    await refresh();
    navigate('/', { replace: true });
  };

  const titles = {
    welcome: t('setup.welcomeTitle'),
    account: t('setup.adminTitle'),
    review: t('setup.reviewTitle'),
    done: t('setup.successTitle'),
  };
  const subtitles = {
    welcome: t('setup.welcomeSubtitle'),
    account: t('setup.adminSubtitle'),
    review: t('setup.reviewSubtitle'),
    done: t('setup.successSubtitle'),
  };

  return (
    <AuthLayout width={580}>
      <div className="setup-language">
        <LanguageSelect />
      </div>
      <Card>
        <div className="setup-head">
          <span className="setup-mark">
            <SailboatIcon size={30} />
          </span>
          <Tag color="app-yellow" variant="soft">
            {t('setup.badge')}
          </Tag>
        </div>
        <Title size="middle">{titles[step]}</Title>
        <p className="muted-text auth-subtitle">{subtitles[step]}</p>

        {step !== 'done' && (
          <div className="setup-progress">
            <Progress
              percent={percent}
              size="small"
              infoFormat={() => t('setup.stepOf', { current: stepIndex, total: TOTAL_STEPS })}
            />
          </div>
        )}

        {step === 'welcome' && (
          <>
            <div className="setup-points">
              {POINTS.map(({ icon: Icon, titleKey, bodyKey }) => (
                <div className="setup-point" key={titleKey}>
                  <span className="setup-point-icon">
                    <Icon size={20} />
                  </span>
                  <div>
                    <strong>{t(titleKey)}</strong>
                    <p className="muted-text">{t(bodyKey)}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button type="primary" size="large" block onClick={() => setStep('account')}>
              {t('setup.start')}
            </Button>
          </>
        )}

        {step === 'account' && (
          <Form form={form} layout="vertical" requiredMark initialValues={draft ?? undefined} onFinish={finishAccount}>
            <FormItem
              name="username"
              label={t('auth.username')}
              required
              rules={[
                { required: true, message: t('setup.usernameRule') },
                { pattern: USERNAME_RE, message: t('setup.usernameRule') },
              ]}
            >
              <Input size="large" placeholder={t('auth.usernamePlaceholder')} allowClear />
            </FormItem>
            <FormItem
              name="displayName"
              label={t('auth.displayName')}
              required
              rules={[
                { required: true, message: t('setup.displayNameRule') },
                { max: 40, message: t('setup.displayNameRule') },
              ]}
            >
              <Input size="large" placeholder={t('setup.displayNameHint')} allowClear />
            </FormItem>
            <FormItem
              name="email"
              label={t('auth.email')}
              required
              rules={[
                { required: true, message: t('setup.emailRule') },
                { type: 'email', message: t('setup.emailRule') },
              ]}
            >
              <Input size="large" type="email" placeholder={t('setup.emailPlaceholder')} allowClear />
            </FormItem>
            <FormItem
              name="password"
              label={t('auth.password')}
              required
              rules={[
                { required: true, message: t('setup.passwordRule') },
                { min: 8, message: t('setup.passwordRule') },
                {
                  validator: (_rule, value) => {
                    if (!value) return Promise.resolve();
                    if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
                      return Promise.reject(new Error(t('setup.passwordRule')));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <Input size="large" type="password" placeholder={t('setup.passwordHint')} />
            </FormItem>
            <FormItem
              name="confirmPassword"
              label={t('auth.confirmPassword')}
              required
              dependencies={['password']}
              rules={[
                { required: true, message: t('setup.confirmRule') },
                {
                  validator: (_rule, value) =>
                    value === form.getFieldValue('password')
                      ? Promise.resolve()
                      : Promise.reject(new Error(t('setup.confirmRule'))),
                },
              ]}
            >
              <Input size="large" type="password" placeholder={t('setup.confirmHint')} />
            </FormItem>
            <FormItem>
              <Button type="primary" htmlType="submit" block size="large">
                {t('setup.next')}
              </Button>
            </FormItem>
          </Form>
        )}

        {step === 'review' && draft && (
          <>
            <dl className="setup-summary">
              <div className="setup-summary-row">
                <dt>{t('auth.username')}</dt>
                <dd>{draft.username}</dd>
              </div>
              <div className="setup-summary-row">
                <dt>{t('auth.displayName')}</dt>
                <dd>{draft.displayName}</dd>
              </div>
              <div className="setup-summary-row">
                <dt>{t('auth.email')}</dt>
                <dd>{draft.email}</dd>
              </div>
              <div className="setup-summary-row">
                <dt>{t('auth.password')}</dt>
                <dd>{t('setup.passwordSet')}</dd>
              </div>
              <div className="setup-summary-row">
                <dt>{t('setup.roleLabel')}</dt>
                <dd>
                  <Tag color="app-teal" variant="soft">
                    {t('setup.roleAdmin')}
                  </Tag>
                </dd>
              </div>
            </dl>
            <div className="setup-note">
              <LockIcon size={18} />
              <span>{t('setup.closeWarning')}</span>
            </div>
            <div className="setup-actions">
              <Button size="large" disabled={busy} onClick={() => setStep('account')}>
                {t('setup.back')}
              </Button>
              <Button type="primary" size="large" loading={busy} onClick={complete} disabled={busy}>
                {busy ? t('setup.submitting') : t('setup.confirmSubmit')}
              </Button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="setup-success">
            <CheckCircleIcon size={46} className="setup-success-icon" />
            <p>{t('setup.successBody')}</p>
            <p className="muted-text">{t('setup.successAccount', { username: draft?.username ?? '' })}</p>
            <Button type="primary" size="large" block onClick={enterPortal}>
              {t('setup.enterPortal')}
            </Button>
          </div>
        )}
      </Card>
    </AuthLayout>
  );
}