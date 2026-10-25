import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Form, FormItem, Input, Notification, Title, useForm } from 'animal-island-ui';
import AuthLayout from '../components/AuthLayout.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;

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
        displayName: values.displayName?.trim() || undefined,
        email: values.email?.trim() || undefined,
      });
      Notification.success(t('auth.registerSuccess'));
      navigate('/', { replace: true });
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout width={440}>
      <Card>
        <Title size="middle" color="app-teal">
          {t('auth.registerTitle')}
        </Title>
        <p className="muted-text auth-subtitle">{t('auth.registerSubtitle')}</p>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <FormItem
            name="username"
            label={t('auth.username')}
            rules={[
              { required: true, message: t('auth.usernamePlaceholder') },
              { pattern: USERNAME_RE, message: t('auth.usernamePlaceholder') },
            ]}
          >
            <Input size="large" placeholder={t('auth.usernamePlaceholder')} allowClear />
          </FormItem>
          <FormItem name="displayName" label={`${t('auth.displayName')}(${t('common.optional')})`}>
            <Input size="large" placeholder={t('auth.displayNamePlaceholder')} allowClear />
          </FormItem>
          <FormItem name="email" label={`${t('auth.email')}(${t('common.optional')})`} rules={[{ type: 'email', message: t('api.VALIDATION_ERROR') }]}>
            <Input size="large" type="email" placeholder="you@example.com" allowClear />
          </FormItem>
          <FormItem
            name="password"
            label={t('auth.password')}
            rules={[
              { required: true, message: t('auth.passwordPlaceholder') },
              { min: 8, message: t('auth.passwordPlaceholder') },
            ]}
          >
            <Input size="large" type="password" placeholder={t('auth.passwordPlaceholder')} />
          </FormItem>
          <FormItem
            name="confirmPassword"
            label={t('auth.confirmPassword')}
            dependencies={['password']}
            rules={[
              { required: true, message: t('auth.confirmPassword') },
              {
                validator: (_rule, value) =>
                  value === form.getFieldValue('password') ? undefined : Promise.reject(new Error(t('auth.confirmPassword'))),
              },
            ]}
          >
            <Input size="large" type="password" placeholder={t('auth.confirmPassword')} />
          </FormItem>
          <FormItem>
            <Button type="primary" htmlType="submit" block size="large" loading={busy}>
              {t('auth.register')}
            </Button>
          </FormItem>
        </Form>
        <div className="auth-links">
          <Link to="/login">{t('auth.toLogin')}</Link>
        </div>
      </Card>
    </AuthLayout>
  );
}
