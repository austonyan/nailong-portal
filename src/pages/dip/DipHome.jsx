// 外交事务署首页: 署内公告 / 服务目录 / 办事指南 / 快速入口 / 娱乐声明与防诈骗。
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import {
  BadgeCheckIcon,
  BookIcon,
  CompassIcon,
  FileIcon,
  FlagIcon,
  MailIcon,
  MapIcon,
  SearchIcon,
  ShieldIcon,
  UsersIcon,
} from 'naive-icons';
import { api } from '../../api/client.js';
import { DipNav, DipLevelTag, fmtDateTime, toastDipError } from '../../components/dip/shared.jsx';

const SERVICE_CARDS = [
  { to: '/dip/apply', icon: FlagIcon, key: 'establish' },
  { to: '/dip/identity', icon: BadgeCheckIcon, key: 'identity' },
  { to: '/dip/identity#visa', icon: CompassIcon, key: 'visaChannel' },
  { to: '/dip/agreements', icon: FileIcon, key: 'agreements' },
  { to: '/dip/agreements#cert', icon: BookIcon, key: 'docsCert' },
  { to: '/dip/offices', icon: MapIcon, key: 'offices' },
  { to: '/dip-verify', icon: SearchIcon, key: 'verify' },
];

const GUIDE_CARDS = ['conditions', 'materials', 'duration', 'courtesy'];

const QUICK_LINKS = [
  { to: '/dip/apply', key: 'apply' },
  { to: '/dip/identity', key: 'myIdentity' },
  { to: '/dip/relations', key: 'myRelations' },
  { to: '/dip-verify', key: 'verify' },
  { to: '/dip/agreements#faq', key: 'faq' },
];

export default function DipHome() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    api
      .get('/dip/overview')
      .then(setData)
      .catch((err) => toastDipError(t, err));
  }, [t]);

  return (
    <>
      <DipNav />
      <div className="dip-hero">
        <Title size="large" color="purple">
          {t('dip.home.hero')}
        </Title>
        <p className="muted-text">{t('dip.home.heroSub')}</p>
        <div className="dip-hero-actions">
          <Link to="/dip/apply">
            <Button type="primary" icon={<FlagIcon />}>
              {t('dip.nav.apply')}
            </Button>
          </Link>
          <Link to="/dip-verify">
            <Button icon={<SearchIcon />}>{t('dip.nav.verifyEntry')}</Button>
          </Link>
        </div>
      </div>

      <Card color="app-yellow" className="dip-scam-card">
        <div className="dip-scam-inner">
          <ShieldIcon size={22} />
          <div>
            <b>{t('dip.home.declarationTitle')}</b>
            <p>{data?.disclaimer?.text ?? t('dip.disclaimer.default')}</p>
          </div>
        </div>
      </Card>

      <div className="dip-section">
        <Title size="middle">{t('dip.home.notices')}</Title>
        <div className="dip-notice-list">
          {(data?.notices ?? []).map((n) => (
            <Card key={n.id} className="dip-notice-card">
              <div className="dip-notice-head">
                <DipLevelTag level={n.level} />
                <b>{n.title}</b>
                <span className="dip-notice-time muted-text">{fmtDateTime(n.publishedAt)}</span>
              </div>
              <p className="dip-notice-body">{n.body}</p>
            </Card>
          ))}
          {(data?.notices ?? []).length === 0 && <p className="muted-text">{t('common.empty')}</p>}
        </div>
      </div>

      <div className="dip-section">
        <Title size="middle">{t('dip.home.services')}</Title>
        <div className="dip-service-grid">
          {SERVICE_CARDS.map(({ to, icon: Icon, key }) => (
            <Link key={key} to={to} className="dip-service-card">
              <Icon size={26} />
              <span>{t(`dip.home.service.${key}`)}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="dip-section">
        <Title size="middle">{t('dip.home.guide')}</Title>
        <div className="dip-guide-grid">
          {GUIDE_CARDS.map((key) => (
            <Card key={key} className="dip-guide-card">
              <h4>{t(`dip.home.guideTitle.${key}`)}</h4>
              <p>{t(`dip.home.guideBody.${key}`, { hours: data?.reviewHoursHint ?? 72 })}</p>
            </Card>
          ))}
        </div>
      </div>

      <div className="dip-section">
        <Title size="middle">{t('dip.home.quickTitle')}</Title>
        <div className="dip-quick-row">
          {QUICK_LINKS.map(({ to, key }) => (
            <Link key={key} to={to}>
              <Button type="default" icon={<MailIcon />}>{t(`dip.home.quick.${key}`)}</Button>
            </Link>
          ))}
        </div>
        {data && (
          <p className="muted-text dip-home-stats">
            <UsersIcon size={14} /> {t('dip.home.myStats', {
              relations: data.my?.relationsActive ?? 0,
              identities: data.my?.identitiesActive ?? 0,
              unread: data.my?.unreadMessages ?? 0,
            })}
            <Tag size="small" color="app-teal" variant="soft">{t('dip.home.agreementsActive', { count: data.agreementsActive })}</Tag>
          </p>
        )}
      </div>
    </>
  );
}
