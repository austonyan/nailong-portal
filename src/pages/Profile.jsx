import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Title, Avatar, Button, Card, Divider, Form, FormItem, Input, Tag, useForm } from 'animal-island-ui';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { toastSuccess, toastApiError } from '../components/toast.js';
import { fmtDate } from '../lib/date.js';

export default function Profile() {
  const { t } = useTranslation();
  const { user, reload } = useAuth();
  const [profileForm] = useForm();
  const [passwordForm] = useForm();
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  if (!user) return null;

  // 真实姓名是门户身份档案的主键,只在注册/管理员建号时确定,这里只读。
  // 邮箱与地址供各署申请表单自动填充,并用于居民证持卡人信息预填。
  const saveProfile = async (values) => {
    if (profileBusy) return;
    setProfileBusy(true);
    try {
      await api.patch('/auth/profile', {
        email: values.email?.trim() || '',
        address: values.address?.trim() || '',
      });
      await reload();
      toastSuccess(t('profile.updateSuccess'));
    } catch (err) {
      toastApiError(t, err);
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
      toastApiError(t, err);
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="profile-page">
      <h1 className="page-title"><Title size="middle" color="brown">{t('profile.title')}</Title></h1>

      <Card className="profile-header">
        <Avatar size={64}>{(user.displayName || user.username || '?').slice(0, 1)}</Avatar>
        <div className="profile-meta">
          <h2>{user.displayName || user.username}</h2>
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
        <h2 className="block-heading">{t('profile.basic')}</h2>
        <Form
          form={profileForm}
          layout="vertical"
          onFinish={saveProfile}
          initialValues={{
            realName: user.displayName || user.username,
            email: user.email ?? '',
            address: user.address ?? '',
          }}
        >
          <FormItem name="realName" label={t('profile.realName')} help={t('profile.realNameLocked')}>
            <Input size="large" disabled />
          </FormItem>
          <FormItem
            name="email"
            label={t('profile.email')}
            help={t('profile.emailHint')}
            rules={[
              { required: true, message: t('common.required') },
              { type: 'email', message: t('auth.emailRule') },
            ]}
          >
            <Input size="large" type="email" placeholder={t('auth.emailPlaceholder')} allowClear />
          </FormItem>
          <FormItem
            name="address"
            label={t('profile.address')}
            help={t('profile.addressHint')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Input size="large" maxLength={200} placeholder={t('profile.addressPlaceholder')} allowClear />
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
        <h2 className="block-heading">{t('profile.changePassword')}</h2>
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
