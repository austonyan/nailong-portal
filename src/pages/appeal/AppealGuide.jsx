// 可申诉事项说明:范围、不可申诉情形、材料清单、时效与复核区别、常见问题。
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Collapse, Tag, Title } from 'animal-island-ui';
import { BanIcon, CheckCircleIcon, ClockIcon, FileIcon } from 'naive-icons';
import { BIZ_TYPES } from './shared.jsx';

export default function AppealGuide() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="appeal-guide-page">
      <Title size="middle" color="app-teal">
        {t('appeal.guide.title')}
      </Title>

      <Card className="appeal-guide-block">
        <h4>
          <CheckCircleIcon size={18} /> {t('appeal.guide.scopeTitle')}
        </h4>
        <p className="muted-text">{t('appeal.guide.scopeIntro')}</p>
        <div className="appeal-biz-grid">
          {BIZ_TYPES.map((b) => (
            <Card key={b} hoverable className="appeal-biz-card" onClick={() => navigate('/appeal/apply')}>
              <Tag color="app-teal" variant="soft">
                {t(`appeal.bizType.${b}`)}
              </Tag>
              <p>{t(`appeal.guide.scope.${b}`)}</p>
            </Card>
          ))}
        </div>
      </Card>

      <Card className="appeal-guide-block">
        <h4>
          <BanIcon size={18} /> {t('appeal.guide.excludedTitle')}
        </h4>
        <ul className="appeal-list">
          {['late', 'duplicate', 'malicious', 'unrelated'].map((k) => (
            <li key={k}>
              <strong>{t(`appeal.guide.excluded.${k}.t`)}</strong> — {t(`appeal.guide.excluded.${k}.d`)}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="appeal-guide-block">
        <h4>
          <FileIcon size={18} /> {t('appeal.guide.materialsTitle')}
        </h4>
        <ul className="appeal-list">
          {['code', 'reason', 'expected', 'contact', 'screenshot', 'proof'].map((k) => (
            <li key={k}>
              <strong>{t(`appeal.guide.materials.${k}.t`)}</strong> — {t(`appeal.guide.materials.${k}.d`)}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="appeal-guide-block">
        <h4>
          <ClockIcon size={18} /> {t('appeal.guide.slaTitle')}
        </h4>
        <p>{t('appeal.guide.slaBody')}</p>
      </Card>

      <Card className="appeal-guide-block">
        <h4>{t('appeal.guide.diffTitle')}</h4>
        <div className="appeal-diff-grid">
          <Card type="dashed">
            <h5>{t('appeal.guide.diffAppeal.t')}</h5>
            <p className="muted-text">{t('appeal.guide.diffAppeal.d')}</p>
          </Card>
          <Card type="dashed">
            <h5>{t('appeal.guide.diffReview.t')}</h5>
            <p className="muted-text">{t('appeal.guide.diffReview.d')}</p>
          </Card>
        </div>
      </Card>

      <section className="appeal-section">
        <Title size="middle" color="app-orange">
          {t('appeal.guide.faq')}
        </Title>
        <div className="appeal-faq">
          {['how', 'change', 'fee', 'who', 'docs'].map((k) => (
            <Collapse key={k} question={t(`appeal.guide.faqItem.${k}.q`)} answer={t(`appeal.guide.faqItem.${k}.a`)} />
          ))}
        </div>
      </section>

      <div className="appeal-guide-actions">
        <Button onClick={() => navigate('/appeal')}>{t('appeal.back')}</Button>
        <Button type="primary" onClick={() => navigate('/appeal/apply')}>
          {t('appeal.home.entryApply')}
        </Button>
      </div>

    </div>
  );
}
