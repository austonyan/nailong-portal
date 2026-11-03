import { Title } from 'animal-island-ui';
import { SailboatIcon } from 'naive-icons';
import { useTranslation } from 'react-i18next';
import LanguageSelect from './LanguageSelect.jsx';
import { OFFICE_NAV } from '../nav/navConfig.js';

// 页脚年份在模块加载时取一次,避免渲染期调用 impure 的 Date。
const YEAR = new Date().getFullYear();

// 登录门面(国家横幅·窗口轮播):登录、注册、首启三页共用。
// 国家门楣承载国名与门户身份;柜台卡分两栏,左栏身份栏里轮播十二个皇家署,
// 右栏表单;variant=wide 时整卡加宽。
export default function PortalGate({ variant = 'login', title, subtitle, badge, children }) {
  const { t } = useTranslation();

  const offices = OFFICE_NAV.map((office, index) => {
    const no = String(index + 1).padStart(2, '0');
    const name = t(office.labelKey);
    return { key: office.key, no, name, label: `${t('gate.windowLabel')} ${no} ${name}` };
  });

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

      <main className="gate-stage">
        <section className={`gate-card gate-card--split${variant === 'wide' ? ' gate-card--wide' : ''}`}>
          <div className="gc-split-rail">
            {badge ? <div className="gate-card-badge">{badge}</div> : null}
            <h2><Title size="middle" color="brown">{title}</Title></h2>
            {subtitle ? <p className="gate-card-sub">{subtitle}</p> : null}
            <div className="gc-roll gc-roll--fade" role="list" aria-label={t('gate.bandLabel')}>
              <div className="gc-roll-stack">
                {offices.map((o, i) => (
                  <div
                    className="gc-roll-fade"
                    role="listitem"
                    key={o.key}
                    aria-label={o.label}
                    style={{ "--gc-i": i }}
                  >
                    <span className="gc-roll-name" aria-hidden="true">{o.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="gc-split-body">{children}</div>
        </section>
      </main>

      <footer className="gate-foot">
        <span>{t('app.name')} · {YEAR}</span>
      </footer>
    </div>
  );
}