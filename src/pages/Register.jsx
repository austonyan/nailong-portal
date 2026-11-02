import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Form, FormItem, Input, useForm } from 'animal-island-ui';
import PortalGate from '../components/PortalGate.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { toastSuccess, toastApiError } from '../components/toast.js';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;

// 注册门面:与登录同一座办事大厅(variant=wide,综合窗口加高),表单逻辑不变。
export default function Register() {
  const { t } = useTranslation();
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [form] = useForm();
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onFinish = async (values) => {
    setBusy(true);
    try {
      await register({
        username: values.username.trim(),
        password: values.password,
        displayName: values.displayName?.trim(),
        email: values.email?.trim() || undefined,
      });
      toastSuccess(t('auth.registerSuccess'));
      navigate('/', { replace: true });
    } catch (err) {
      toastApiError(t, err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalGate variant="wide" badge={t('gate.counterBadge')}>
      <div className="gate-counter-inner">
        <h2 className="gate-counter-title">{t('auth.registerTitle')}</h2>
        <p className="gate-counter-sub">{t('auth.registerSubtitle')}</p>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <FormItem
            name="username"
            label={t('auth.username')}
            rules={[
              { required: true, message: t('common.required') },
              { pattern: USERNAME_RE, message: t('auth.usernameRule') },
            ]}
          >
            <Input size="large" placeholder={t('auth.usernamePlaceholder')} allowClear autoComplete="username" />
          </FormItem>
          <FormItem
            name="displayName"
            label={t('profile.realName')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Input size="large" placeholder={t('auth.displayNamePlaceholder')} allowClear maxLength={40} />
          </FormItem>
          <FormItem
            name="email"
            label={`${t('auth.email')}(${t('common.optional')})`}
            rules={[{ type: 'email', message: t('api.VALIDATION_ERROR') }]}
          >
            <Input size="large" type="email" placeholder={t('auth.emailPlaceholder')} allowClear />
          </FormItem>
          <FormItem
            name="password"
            label={t('auth.password')}
            rules={[
              { required: true, message: t('common.required') },
              { min: 8, message: t('auth.passwordRule') },
            ]}
          >
            <Input size="large" type="password" placeholder={t('auth.passwordPlaceholder')} autoComplete="new-password" />
          </FormItem>
          <FormItem
            name="confirmPassword"
            label={t('auth.confirmPassword')}
            dependencies={['password']}
            rules={[
              { required: true, message: t('common.required') },
              {
                validator: (_rule, value) =>
                  value === form.getFieldValue('password') ? undefined : Promise.reject(new Error(t('auth.confirmRule'))),
              },
            ]}
          >
            <Input size="large" type="password" placeholder={t('auth.confirmPassword')} />
          </FormItem>
          <FormItem>
            <Button type="primary" htmlType="submit" block size="large" loading={busy} disabled={busy}>
              {t('auth.register')}
            </Button>
          </FormItem>
        </Form>
        <div className="gate-counter-link">
          <Link to="/login">{t('auth.toLogin')}</Link>
        </div>
      </div>
    </PortalGate>
  );
}
