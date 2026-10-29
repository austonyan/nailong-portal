import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Form, FormItem, Input, Title, useForm } from 'animal-island-ui';
import AuthLayout from '../components/AuthLayout.jsx';
import LanguageSelect from '../components/LanguageSelect.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { toastSuccess, toastApiError } from '../components/toast.js';

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
      toastSuccess(t('auth.welcomeBack', { name: loggedIn.displayName || loggedIn.username }));
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      toastApiError(t, err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      {/* 未登录也能切换语言(zh-TW 用户登录前就要能读懂界面)。 */}
      <div className="setup-language">
        <LanguageSelect />
      </div>
      <Card>
        <Title size="middle">{t('auth.loginTitle')}</Title>
        <p className="muted-text auth-subtitle">{t('auth.loginSubtitle')}</p>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <FormItem
            name="username"
            label={t('auth.username')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Input size="large" placeholder={t('auth.usernamePlaceholder')} allowClear />
          </FormItem>
          <FormItem
            name="password"
            label={t('auth.password')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Input size="large" type="password" placeholder={t('auth.passwordPlaceholder')} />
          </FormItem>
          <FormItem>
            <Button type="primary" htmlType="submit" block size="large" loading={busy} disabled={busy}>
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
