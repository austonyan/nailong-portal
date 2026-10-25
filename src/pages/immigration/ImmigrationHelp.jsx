import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, Collapse, Divider, Title } from 'animal-island-ui';
import { ChatIcon, HelpCircleIcon, ShieldIcon } from 'naive-icons';
import { ImNav } from '../../components/immigration/shared.jsx';

const FAQ_KEYS = ['visaInvalid', 'passUsage', 'recordsWhere', 'fee', 'privacy', 'realEffect'];

export default function ImmigrationHelp() {
  const { t } = useTranslation();
  return (
    <div className="im-page">
      <ImNav />
      <div className="page-header">
        <Title size="middle" color="app-green">
          {t('imm.help.title')}
        </Title>
      </div>

      <Card color="app-yellow" className="im-fraud-card">
        <div className="im-help-fraud-head">
          <ShieldIcon size={22} />
          <b>{t('imm.fraud.title')}</b>
        </div>
        <p>{t('imm.fraud.body')}</p>
      </Card>

      <Divider type="hairline" />

      <section>
        <Title size="middle">{t('imm.help.faqTitle')}</Title>
        <div className="im-faq">
          {FAQ_KEYS.map((key) => (
            <Collapse key={key} question={t(`imm.faq.${key}.q`)} answer={t(`imm.faq.${key}.a`)} />
          ))}
        </div>
      </section>

      <section>
        <Title size="middle" color="app-teal">
          {t('imm.help.contactTitle')}
        </Title>
        <div className="im-help-cards">
          <Card hoverable className="im-help-card">
            <ChatIcon size={26} />
            <h3>{t('imm.help.ticketTitle')}</h3>
            <p className="muted-text">{t('imm.help.ticketBody')}</p>
            <Link to="/immigration/messages" className="im-link">
              {t('imm.help.ticketLink')}
            </Link>
          </Card>
          <Card hoverable className="im-help-card">
            <HelpCircleIcon size={26} />
            <h3>{t('imm.help.noticeTitle')}</h3>
            <p className="muted-text">{t('imm.help.noticeBody')}</p>
            <Link to="/immigration" className="im-link">
              {t('imm.help.noticeLink')}
            </Link>
          </Card>
        </div>
      </section>
    </div>
  );
}
