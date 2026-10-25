// 帮助中心:报名、邀请函、活动凭证、礼遇与隐私说明,附防诈骗提示。
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Collapse, Title } from 'animal-island-ui';
import { AlertTriangleIcon, HelpCircleIcon, MailIcon, ShieldIcon } from 'naive-icons';

const FAQ_KEYS = ['applyTime', 'invitationVisa', 'passUsage', 'waitlist', 'host', 'courtesy', 'privacy', 'deleteData'];

export default function ProtocolHelp() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('protocol.help.title')}</Title>
        <p className="muted-text">{t('protocol.help.subtitle')}</p>
      </div>

      <Card color="app-yellow" className="protocol-scam-banner">
        <div className="protocol-scam-inner">
          <AlertTriangleIcon size={22} />
          <div>
            <strong>{t('protocol.help.scamTitle')}</strong>
            <p>{t('protocol.help.scamBody')}</p>
          </div>
        </div>
      </Card>

      <section className="protocol-section">
        <Title size="middle" color="app-teal">{t('protocol.help.faqTitle')}</Title>
        <div className="protocol-faq">
          {FAQ_KEYS.map((key) => (
            <Collapse key={key} question={t(`protocol.help.faq.${key}.q`)} answer={t(`protocol.help.faq.${key}.a`)} />
          ))}
        </div>
      </section>

      <div className="protocol-guide-grid">
        <Card className="protocol-guide-card" hoverable onClick={() => navigate('/protocol/events')}>
          <HelpCircleIcon size={22} />
          <h4>{t('protocol.help.browseTitle')}</h4>
          <p>{t('protocol.help.browseBody')}</p>
          <Button type="dashed" size="small">{t('protocol.home.browseEvents')}</Button>
        </Card>
        <Card className="protocol-guide-card" hoverable onClick={() => navigate('/protocol/messages')}>
          <MailIcon size={22} />
          <h4>{t('protocol.help.supportTitle')}</h4>
          <p>{t('protocol.help.supportBody')}</p>
          <Button type="dashed" size="small">{t('protocol.help.supportEntry')}</Button>
        </Card>
        <Card className="protocol-guide-card">
          <ShieldIcon size={22} />
          <h4>{t('protocol.help.privacyTitle')}</h4>
          <p>{t('protocol.help.privacyBody')}</p>
        </Card>
      </div>

      <Card type="dashed" className="protocol-disclaimer-card">
        <strong>{t('protocol.entertainmentNotice')}</strong>
        <p>{t('protocol.disclaimerLong')}</p>
      </Card>
    </div>
  );
}