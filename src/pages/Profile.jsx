import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Divider, Form, FormItem, Input, Tag, Title, useForm } from 'animal-island-ui';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { toastSuccess, toastError } from '../components/toast.js';
import { fmtDate } from '../lib/date.js';

export default function Profile() {
  const { t } = useTranslation();
  const { user, reload } = useAuth();
  const [profileForm] = useForm();
  const [passwordForm] = useForm();
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  if (!user) return null;

  const saveProfile = async (values) => {
    if (profileBusy) return;
    setProfileBusy(true);
    try {
      await api.patch('/auth/profile', {
        displayName: values.displayName?.trim(),
        email: values.email?.trim() || '',
      });
      await reload();
      toastSuccess(t('profile.updateSuccess'));
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
    } finally {
      setProfileBusy(false);
    }
  };

  const changePassword = async (values) => {
    if (passwordBusy) return;
    setPasswordBusy(true);
    try {
      await api.post('/auth/change-password', { oldPassword: values.oldPassword, newPassword: values.newPassword });
      passwordForm.resetFields();
      toastSuccess(t('profile.passwordChanged'));
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="profile-page">
      <Title size="middle">{t('profile.title')}</Title>

      <Card className="profile-header">
        <Avatar size={64}>{(user.displayName || user.username || '?').slice(0, 1)}</Avatar>
        <div className="profile-meta">
          <h3>{user.displayName || user.username}</h3>
          <p className="muted-text">@{user.username}</p>
          <div className="profile-tags">
            {user.roles.map((r) => (
              <Tag key={r.key} color="app-teal" variant="soft">
                {r.name}
              </Tag>
            ))}
          </div>
          <p className="muted-text profile-since">
            {t('profile.memberSince')} {fmtDate(user.createdAt)}
          </p>
        </div>
      </Card>

      <Card>
        <Title variant="layer" color="app-yellow" size="small">
          {t('profile.basic')}
        </Title>
        <Form form={profileForm} layout="vertical" onFinish={saveProfile} initialValues={{ displayName: user.displayName, email: user.email ?? '' }}>
          <FormItem name="displayName" label={t('auth.displayName')} rules={[{ required: true, message: t('common.required') }]}>
            <Input size="large" placeholder={t('auth.displayNamePlaceholder')} allowClear />
          </FormItem>
          <FormItem name="email" label={`${t('auth.email')}(${t('common.optional')})`} rules={[{ type: 'email', message: t('auth.emailRule') }]}>
            <Input size="large" type="email" placeholder="you@example.com" allowClear />
          </FormItem>
          <FormItem>
            <Button type="primary" htmlType="submit" loading={profileBusy} disabled={profileBusy}>
              {t('common.save')}
            </Button>
          </FormItem>
        </Form>
      </Card>

      <Divider type="hairline" />

      <Card>
        <Title variant="layer" color="app-blue" size="small">
          {t('profile.changePassword')}
        </Title>
        <Form form={passwordForm} layout="vertical" onFinish={changePassword}>
          <FormItem
            name="oldPassword"
            label={t('profile.oldPassword')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Input size="large" type="password" />
          </FormItem>
          <FormItem
            name="newPassword"
            label={t('profile.newPassword')}
            rules={[
              { required: true, message: t('common.required') },
              { min: 8, message: t('auth.passwordRule') },
            ]}
          >
            <Input size="large" type="password" placeholder={t('auth.passwordPlaceholder')} />
          </FormItem>
          <FormItem
            name="confirmPassword"
            label={t('profile.confirmNewPassword')}
            dependencies={['newPassword']}
            rules={[
              { required: true, message: t('common.required') },
              {
                validator: (_rule, value) =>
                  value === passwordForm.getFieldValue('newPassword')
                    ? undefined
                    : Promise.reject(new Error(t('auth.confirmRule'))),
              },
            ]}
          >
            <Input size="large" type="password" placeholder={t('profile.confirmNewPassword')} />
          </FormItem>
          <FormItem>
            <Button type="primary" htmlType="submit" loading={passwordBusy} disabled={passwordBusy}>
              {t('profile.changePassword')}
            </Button>
          </FormItem>
        </Form>
      </Card>
    </div>
  );
}
