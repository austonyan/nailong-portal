// 申请前引导:类型说明与协议确认。只收文本,无需准备文件。
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Title, Button, Card, Checkbox, Tag } from 'animal-island-ui';
import { AirplaneIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastVisaError } from './shared.jsx';

export default function VisaApplyGuide() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { typeCode } = useParams();
  const [types, setTypes] = useState(null);
  const [agreed, setAgreed] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/visa/types')
      .then((data) => {
        if (!cancelled) setTypes(data.items);
      })
      .catch((err) => {
        toastVisaError(t, err);
        if (!cancelled) setTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // 没有类型参数时是「选类型」入口(/visa/apply)。必须列出开放中的类型:
  // 以前直接把缺参数当成类型不存在,点「开始申请」永远看到「暂未开放」。
  if (!typeCode) {
    return (
      <div className="visa-guide-page">
        <h1 className="page-title"><Title size="middle" color="brown">{t('visa.applyGuide.pickType')}</Title></h1>
        <p className="muted-text">{t('visa.applyGuide.pickTypeTip')}</p>
        <div className="visa-type-grid">
          {(types ?? []).map((item) => (
            <Card
              key={item.code}
              hoverable
              className="visa-type-card"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/visa/apply/${item.code}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/visa/apply/${item.code}`);
                }
              }}
            >
              <div className="visa-type-top">
                <AirplaneIcon size={30} />
                <Tag color="app-green" variant="soft">{t('visa.typeAvail.open')}</Tag>
              </div>
              <h3 className="visa-type-name">{item.name}</h3>
              <p className="visa-type-desc">{item.description}</p>
              <div className="visa-type-meta">
                <Tag variant="outlined">{t('visa.typeMeta.stay', { days: item.stayDays })}</Tag>
                <Tag variant="outlined">{t('visa.typeMeta.valid', { days: item.validDays })}</Tag>
              </div>
            </Card>
          ))}
          {types === null && (
            <Card type="dashed">
              <p className="muted-text">{t('common.loading')}</p>
            </Card>
          )}
          {types !== null && types.length === 0 && (
            <Card type="dashed">
              <p className="muted-text">{t('common.empty')}</p>
            </Card>
          )}
        </div>
      </div>
    );
  }

  const type = (types ?? []).find((item) => item.code === String(typeCode).toUpperCase()) || null;

  // 类型列表回来后才能判断类型是否存在,先显示加载,避免闪一下「暂未开放」。
  if (types === null) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  if (!type) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('visa.applyGuide.typeUnavailable')}</p>
        <Button onClick={() => navigate('/visa')}>{t('visa.backHome')}</Button>
      </Card>
    );
  }

  const agreementOptions = [
    { label: t('visa.applyGuide.agreePrivacy'), value: 'privacy' },
    { label: t('visa.applyGuide.agreeTerms'), value: 'terms' },
  ];
  const canStart = agreed.length === agreementOptions.length;

  return (
    <div className="visa-guide-page">
      <h1 className="page-title"><Title size="middle" color="brown">{t('visa.applyGuide.title', { name: type.name })}</Title></h1>

      <Card className="visa-guide-type-card">
        <h2>{type.name}</h2>
        <p>{type.description || type.guide}</p>
        <div className="visa-type-meta">
          <Tag variant="outlined">{t('visa.typeMeta.stay', { days: type.stayDays })}</Tag>
          <Tag variant="outlined">{t('visa.typeMeta.valid', { days: type.validDays })}</Tag>
          <Tag variant="outlined">{t(`visa.typeMeta.renewable.${type.renewable ? 'yes' : 'no'}`)}</Tag>
        </div>
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
