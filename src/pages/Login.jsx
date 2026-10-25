import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Form, FormItem, Input, Notification, Title, useForm } from 'animal-island-ui';
import AuthLayout from '../components/AuthLayout.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const { t } = useTranslation();
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = useForm();
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onFinish = async (values) => {
    setBusy(true);
    try {
      const loggedIn = await login(values.username.trim(), values.password);
      Notification.success(t('auth.welcomeBack', { name: loggedIn.displayName || loggedIn.username }));
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <Card>
        <Title size="middle">{t('auth.loginTitle')}</Title>
        <p className="muted-text auth-subtitle">{t('auth.loginSubtitle')}</p>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <FormItem
            name="username"
            label={t('auth.username')}
            rules={[{ required: true, message: t('auth.usernamePlaceholder') }]}
          >
            <Input size="large" placeholder={t('auth.usernamePlaceholder')} allowClear />
          </FormItem>
          <FormItem
            name="password"
            label={t('auth.password')}
            rules={[{ required: true, message: t('auth.passwordPlaceholder') }]}
          >
            <Input size="large" type="password" placeholder={t('auth.passwordPlaceholder')} />
          </FormItem>
          <FormItem>
            <Button type="primary" htmlType="submit" block size="large" loading={busy}>
              {t('auth.login')}
            </Button>
          </FormItem>
        </Form>
        <div className="auth-links">
          <Link to="/register">{t('auth.toRegister')}</Link>
        </div>
      </Card>
    </AuthLayout>
  );
}
