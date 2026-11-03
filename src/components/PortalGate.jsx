import { Title } from 'animal-island-ui';
import { SailboatIcon } from 'naive-icons';
import { useTranslation } from 'react-i18next';
import LanguageSelect from './LanguageSelect.jsx';
import { OFFICE_NAV } from '../nav/navConfig.js';

// 页脚年份在模块加载时取一次,避免渲染期调用 impure 的 Date。
const YEAR = new Date().getFullYear();

// 登录门面(国家横幅·窗口带):登录、注册、首启三页共用。
// 国家门楣承载国名与门户身份,其下是十二个皇家署的窗口带,居中柜台卡放表单。
// variant=wide 时柜台加宽(注册/首启的表单更长)。
export default function PortalGate({ variant = 'login', title, subtitle, badge, children }) {
  const { t } = useTranslation();

  return (
    <div className="gate">
      <header className="gate-mast">
        <span className="gate-emblem">
          <SailboatIcon size={30} />
        </span>
        <div className="gate-mast-country">
          <h1>{t('gate.nation')}</h1>
          <p>{t('gate.mastSub')}</p>
        </div>
        <span className="gate-mast-rule" aria-hidden="true" />
        <div className="gate-mast-portal">
          <strong>{t('app.name')}</strong>
          <span>{t('portal.tagline')}</span>
        </div>
        <div className="gate-mast-side">
          <span className="gate-motto-pill">{t('gate.motto')}</span>
          <LanguageSelect />
        </div>
      </header>

      <div className="gate-band" role="list" aria-label={t('gate.bandLabel')}>
        {OFFICE_NAV.map((office, index) => {
          const no = String(index + 1).padStart(2, '0');
          const name = t(office.labelKey);
          return (
            <div
              className="gate-band-chip"
              role="listitem"
              key={office.key}
              aria-label={`${t('gate.windowLabel')} ${no} ${name}`}
            >
              <span className="gate-band-no" aria-hidden="true">{no}</span>
              <span className="gate-band-name" aria-hidden="true">{name}</span>
              <i className="gate-band-bar" aria-hidden="true" />
            </div>
          );
        })}
      </div>

      <main className="gate-stage">
        <section className={`gate-card${variant === 'wide' ? ' gate-card--wide' : ''}`}>
          {badge ? <div className="gate-card-badge">{badge}</div> : null}
          <h2><Title size="middle" color="brown">{title}</Title></h2>
          {subtitle ? <p className="gate-card-sub">{subtitle}</p> : null}
          {children}
        </section>
      </main>

      <footer className="gate-foot">
        <span>{t('gate.motto')}</span>
        <span>{t('app.name')} · {YEAR}</span>
      </footer>
    </div>
  );
}