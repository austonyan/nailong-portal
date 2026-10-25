// 居民类型与指南:类型列表、每种类型的权益/义务说明与样例卡、登记所需信息清单、常见问题。
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Collapse, Divider, Tag, Title } from 'animal-island-ui';
import { api } from '../../api/client.js';
import { fmtDate, toastResError } from './shared.jsx';

const INFO_KEYS = ['nickname', 'contact', 'address', 'bio', 'purposes', 'avatar', 'proof'];

const FAQ_KEYS = ['realWorld', 'fee', 'howLong', 'rejected'];

export default function ResidentGuide() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [types, setTypes] = useState(null);

  useEffect(() => {
    api
      .get('/resident/types')
      .then((data) => setTypes(data.items))
      .catch((err) => {
        toastResError(t, err);
        setTypes([]);
      });
  }, [t]);

  // 支持 /resident/guide#CODE 直接定位到某种类型的说明
  useEffect(() => {
    if (!types || !location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [types, location.hash]);

  return (
    <div className="res-guide">
      <div className="page-header">
        <Title size="middle" color="app-green">
          {t('res.guide.title')}
        </Title>
        <p className="muted-text">{t('res.guide.subtitle')}</p>
      </div>

      <section>
        <Title size="middle">{t('res.guide.types')}</Title>
        <div className="res-type-grid">
          {(types ?? []).map((type) => (
            <TypeCard key={type.code} type={type} />
          ))}
          {types === null && (
            <Card type="dashed">
              <p className="muted-text">{t('common.loading')}</p>
            </Card>
          )}
        </div>
      </section>

      {(types ?? []).map((type) => (
        <TypeDetail key={type.code} type={type} />
      ))}

      <Divider type="wave-yellow" />

      <section>
        <Title size="middle">{t('res.guide.checklist')}</Title>
        <Card className="res-checklist">
          <ul>
            {INFO_KEYS.map((key) => (
              <li key={key}>
                <b>{t(`res.checklist.${key}.label`)}</b>
                <span className="muted-text">{t(`res.checklist.${key}.desc`)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section>
        <Title size="middle">{t('res.guide.faq')}</Title>
        <div className="res-faq">
          {FAQ_KEYS.map((key) => (
            <Collapse key={key} question={t(`res.faq.${key}.q`)} answer={t(`res.faq.${key}.a`)} />
          ))}
        </div>
      </section>

      <div className="res-center-btn">
        <Button type="primary" size="large" onClick={() => navigate('/resident/apply')}>
          {t('res.guide.startApply')}
        </Button>
      </div>
    </div>
  );
}

function TypeCard({ type }) {
  const { t } = useTranslation();
  return (
    <Card className="res-type-card">
      <a id={type.code} />
      <div className="res-type-head">
        <b>{type.name}</b>
        <Tag color="app-green" variant="soft" size="small">
          {t('res.type.open')}
        </Tag>
      </div>
      <p className="muted-text">{type.description}</p>
      <p className="muted-text">
        {t('res.type.code', { code: type.code })} · {t('res.type.validYears', { years: type.validYears })}
      </p>
    </Card>
  );
}

// 每种类型的说明页:权益、义务(趣味化)、样例居民卡
function TypeDetail({ type }) {
  const { t } = useTranslation();
  return (
    <Card className="res-type-detail">
      <div className="res-type-detail-head">
        <Title size="middle">{type.name}</Title>
        <Tag color="app-yellow" variant="soft">
          {t('res.type.sampleCard')}
        </Tag>
      </div>
      <p className="muted-text">{type.description}</p>
      {type.guide && (
        <div className="res-type-block">
          <b>{t('res.type.guide')}</b>
          <p>{type.guide}</p>
        </div>
      )}
      <div className="res-type-block">
        <b>{t('res.type.benefits')}</b>
        <p>{type.benefits || t('res.type.benefitsPlaceholder')}</p>
      </div>
      <div className="res-type-block">
        <b>{t('res.type.duties')}</b>
        <p>{type.duties || t('res.type.dutiesPlaceholder')}</p>
      </div>
      <SampleCard type={type} />
    </Card>
  );
}

// 样例居民卡(占位数据,趣味化展示)
function SampleCard({ type }) {
  const { t } = useTranslation();
  return (
    <div className="res-card res-card-sample" data-status="sample">
      <div className="res-card-head">
        <div>
          <div className="res-card-issuer">{t('res.officeName')}</div>
          <div className="res-card-kind">{t('res.card.electronic')}</div>
        </div>
        <Tag color="app-green" variant="solid" size="large">
          {t('res.cardStatus.valid')}
        </Tag>
      </div>
      <div className="res-card-grid">
        <div>
          <span className="res-card-label">{t('res.card.noLabel')}</span>
          <span className="res-card-value res-card-no">NRC-·······</span>
        </div>
        <div>
          <span className="res-card-label">{t('res.card.type')}</span>
          <span className="res-card-value">{type.name}</span>
        </div>
        <div>
          <span className="res-card-label">{t('res.card.holder')}</span>
          <span className="res-card-value">{t('res.card.sampleHolder')}</span>
        </div>
        <div>
          <span className="res-card-label">{t('res.card.issuedAt')}</span>
          <span className="res-card-value">{fmtDate(new Date().toISOString())}</span>
        </div>
        <div>
          <span className="res-card-label">{t('res.card.validUntil')}</span>
          <span className="res-card-value">{t('res.card.sampleUntil')}</span>
        </div>
        <div>
          <span className="res-card-label">{t('res.card.issuer')}</span>
          <span className="res-card-value">{t('res.officeName')}</span>
        </div>
      </div>
    </div>
  );
}
