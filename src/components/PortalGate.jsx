import { Background, Title, Typewriter } from 'animal-island-ui';
import { SailboatIcon } from 'naive-icons';
import { useTranslation } from 'react-i18next';
import LanguageSelect from './LanguageSelect.jsx';
import { OFFICE_NAV } from '../nav/navConfig.js';
import { OFFICE_ICONS } from './office/OfficeChrome.jsx';

// 登录门面(办事大厅·十二窗口):登录、注册、首启三页共用的国门骨架。
// 顶细条承载国家身份与语言;叙事行是全页唯一的 h1;窗口房网格里占大格的
// 「综合窗口」承载表单(variant 决定它的跨度),其余窗口是十二个皇家署的
// 真实铭牌——数据直接取自 navConfig,登录后与门户服务卡一一对应。
// variant: 'login'(综合窗口 2×2,第 12 署占宽格) | 'wide'(综合窗口 3×3,
// 注册/首启的高表单用,底部补一块国训宽牌凑齐 12 铭牌)。
export default function PortalGate({ variant = 'login', badge, children }) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <div className="gate">
      <header className="gate-topbar">
        <span className="gate-emblem">
          <SailboatIcon size={22} />
        </span>
        <span className="gate-country">{t('gate.country')}</span>
        <div className="gate-topbar-lang">
          <LanguageSelect />
        </div>
      </header>

      <Background type="sprinkles" className="gate-hero">
        <h1 className="page-title gate-title">
          {t('gate.welcome')}
          <Title size="large" color="brown">{t('app.name')}</Title>
        </h1>
        {/* 门面的一处动效时刻:与门户首页的 tagline 打字机呼应,仅此一处 */}
        <Typewriter speed={40}>
          <p className="gate-tagline">{t('portal.tagline')}</p>
        </Typewriter>
      </Background>

      <main className="gate-main">
        <div className={`gate-hall gate-hall--${variant}`}>
          <section className="gate-counter" style={{ gridArea: 'gate' }}>
            {badge ? <span className="gate-counter-badge">{badge}</span> : null}
            {children}
          </section>
          {OFFICE_NAV.map((office, index) => {
            const Icon = OFFICE_ICONS[office.icon];
            return (
              <div
                className="gate-window"
                key={office.key}
                style={{ gridArea: `w${index + 1}` }}
              >
                <span className="gate-window-no">
                  {t('gate.windowLabel')}
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="gate-window-name">
                  <span className="gate-window-icon">
                    {Icon ? <Icon size={15} /> : null}
                  </span>
                  <span className="gate-window-name-text">{t(office.labelKey)}</span>
                </span>
              </div>
            );
          })}
          {variant === 'wide' && (
            <div className="gate-motto" style={{ gridArea: 'motto' }}>
              {t('gate.motto')}
            </div>
          )}
        </div>
      </main>

      <footer className="gate-foot">
        <span>{t('gate.motto')}</span>
        <span>{t('app.name')} · {year}</span>
      </footer>
    </div>
  );
}
