import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Form, FormItem, Input, useForm } from 'animal-island-ui';
import PortalGate from '../components/PortalGate.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { toastSuccess, toastApiError } from '../components/toast.js';

// 登录门面:综合窗口承载登录表单,门面骨架(顶栏/叙事行/窗口房/页脚)在 PortalGate。
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
    <PortalGate title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <FormItem
          name="username"
          label={t('auth.username')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Input size="large" placeholder={t('auth.usernamePlaceholder')} allowClear autoComplete="username" />
        </FormItem>
        <FormItem
          name="password"
          label={t('auth.password')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Input size="large" type="password" placeholder={t('auth.passwordPlaceholder')} autoComplete="current-password" />
        </FormItem>
        <FormItem>
          <Button type="primary" htmlType="submit" block size="large" loading={busy} disabled={busy}>
            {t('auth.login')}
          </Button>
        </FormItem>
      </Form>
      <div className="gate-card-link">
        <Link to="/register">{t('auth.toRegister')}</Link>
      </div>
    </PortalGate>
  );
}
