// 帮助中心:报名、邀请函、活动凭证、礼遇与隐私说明,附防诈骗提示。
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Collapse, Title } from 'animal-island-ui';
import { AlertTriangleIcon, HelpCircleIcon, MailIcon, ShieldIcon } from 'naive-icons';

const FAQ_KEYS = ['applyTime', 'invitationVisa', 'passUsage', 'waitlist', 'host', 'courtesy', 'privacy', 'deleteData'];

export default function ProtocolHelp() {
  const { t } = useTranslation();

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('protocol.help.title')}</Title>
        </h1>
        <p className="muted-text">{t('protocol.help.subtitle')}</p>
      </div>

      <Card pattern="app-yellow" className="protocol-scam-banner">
        <div className="protocol-scam-inner">
          <AlertTriangleIcon size={22} />
          <div>
            <strong>{t('protocol.help.scamTitle')}</strong>
            <p>{t('protocol.help.scamBody')}</p>
          </div>
        </div>
      </Card>

      <section className="protocol-section">
        <h2 className="section-title">
          <Title size="middle" color="app-teal">{t('protocol.help.faqTitle')}</Title>
        </h2>
        <div className="protocol-faq">
          {FAQ_KEYS.map((key) => (
            <Collapse key={key} question={t(`protocol.help.faq.${key}.q`)} answer={t(`protocol.help.faq.${key}.a`)} />
          ))}
        </div>
      </section>

      <div className="protocol-guide-grid">
        <Link to="/protocol/events" className="protocol-guide-link">
          <Card className="protocol-guide-card" hoverable>
            <HelpCircleIcon size={22} />
            <h3>{t('protocol.help.browseTitle')}</h3>
            <p>{t('protocol.help.browseBody')}</p>
            <Button type="dashed" size="small">{t('protocol.home.browseEvents')}</Button>
          </Card>
        </Link>
        <Link to="/protocol/messages" className="protocol-guide-link">
          <Card className="protocol-guide-card" hoverable>
            <MailIcon size={22} />
            <h3>{t('protocol.help.supportTitle')}</h3>
            <p>{t('protocol.help.supportBody')}</p>
            <Button type="dashed" size="small">{t('protocol.help.supportEntry')}</Button>
          </Card>
        </Link>
        <Card className="protocol-guide-card">
          <ShieldIcon size={22} />
          <h3>{t('protocol.help.privacyTitle')}</h3>
          <p>{t('protocol.help.privacyBody')}</p>
        </Card>
      </div>

    </div>
  );
}