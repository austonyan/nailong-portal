// 申请前引导:类型说明、材料清单、资格自检(趣味化)、协议确认。
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Checkbox, Radio, Tag, Title } from 'animal-island-ui';
import { CheckCircleIcon, FileIcon, HelpCircleIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastVisaError } from './shared.jsx';

const QUIZ = ['identity', 'verification', 'usage'];

export default function VisaApplyGuide() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { typeCode } = useParams();
  const [type, setType] = useState(null);
  const [quiz, setQuiz] = useState({});
  const [agreed, setAgreed] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/visa/types')
      .then((data) => {
        if (!cancelled) setType(data.items.find((item) => item.code === typeCode) || null);
      })
      .catch((err) => {
        toastVisaError(t, err);
        if (!cancelled) setType(null);
      });
    return () => {
      cancelled = true;
    };
  }, [typeCode, t]);

  if (!type) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('visa.applyGuide.typeUnavailable')}</p>
        <Button onClick={() => navigate('/visa/apply')}>{t('visa.backHome')}</Button>
      </Card>
    );
  }

  const quizDone = QUIZ.every((q) => quiz[q] !== undefined);
  const agreementOptions = [
    { label: t('visa.applyGuide.agreePrivacy'), value: 'privacy' },
    { label: t('visa.applyGuide.agreeTerms'), value: 'terms' },
  ];
  const canStart = quizDone && agreed.length === agreementOptions.length;

  return (
    <div className="visa-guide-page">
      <h1 className="page-title">
        <Title size="middle" color="app-teal">
          {t('visa.applyGuide.title', { name: type.name })}
        </Title>
      </h1>

      <Card className="visa-guide-type-card">
        <h2>{type.name}</h2>
        <p>{type.description || type.guide}</p>
        <div className="visa-type-meta">
          <Tag variant="outlined">{t('visa.typeMeta.stay', { days: type.stayDays })}</Tag>
          <Tag variant="outlined">{t('visa.typeMeta.valid', { days: type.validDays })}</Tag>
          <Tag variant="outlined">{t(`visa.typeMeta.renewable.${type.renewable ? 'yes' : 'no'}`)}</Tag>
        </div>
      </Card>

      <Card className="visa-guide-materials">
        <h2 className="block-heading">
          <FileIcon size={18} /> {t('visa.applyGuide.materialsTitle')}
        </h2>
        <ul className="visa-material-list">
          <li>{t('visa.applyGuide.materialAvatar')}</li>
          <li>{t('visa.applyGuide.materialItinerary')}</li>
          <li>{t('visa.applyGuide.materialInvitation')}</li>
          <li>{t('visa.applyGuide.materialFormat')}</li>
        </ul>
      </Card>

      <Card className="visa-guide-quiz">
        <h2 className="block-heading">
          <HelpCircleIcon size={18} /> {t('visa.applyGuide.quizTitle')}
        </h2>
        <p className="muted-text">{t('visa.applyGuide.quizHint')}</p>
        {QUIZ.map((key) => (
          <div key={key} className="visa-quiz-item">
            <p>{t(`visa.quiz.${key}.q`)}</p>
            <Radio
              value={quiz[key]}
              onChange={(v) => setQuiz((prev) => ({ ...prev, [key]: v }))}
              options={[
                { label: t(`visa.quiz.${key}.yes`), value: 'yes' },
                { label: t(`visa.quiz.${key}.no`), value: 'no' },
              ]}
            />
          </div>
        ))}
        {quizDone && (
          <div className="visa-quiz-result">
            <CheckCircleIcon size={18} />
            <span>{t('visa.applyGuide.quizDone')}</span>
          </div>
        )}
      </Card>

      <Card className="visa-guide-agreement">
        <h2 className="block-heading">{t('visa.applyGuide.agreementTitle')}</h2>
        <Checkbox
          options={agreementOptions}
          value={agreed}
          onChange={setAgreed}
          direction="vertical"
        />
      </Card>

      <div className="visa-guide-actions">
        <Button onClick={() => navigate('/visa')}>{t('visa.back')}</Button>
        <Button type="primary" size="large" disabled={!canStart} onClick={() => navigate(`/visa/apply/${type.code}/form`)}>
          {t('visa.applyGuide.start')}
        </Button>
      </div>
    </div>
  );
}
