// 办事指南 — 归档范围、脱敏与访问留痕、导出限额、删除申请流程。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Collapse, Tag, Title } from 'animal-island-ui';
import { api } from '../../api/client.js';
import { ArchNav, toastArchError } from './shared.jsx';

const FAQ_KEYS = ['whatArchived', 'masked', 'exportLimit', 'deleteFlow', 'rejectedAppeal'];

export default function ArchHelp() {
  const { t } = useTranslation();
  const [guides, setGuides] = useState(null);

  useEffect(() => {
    api
      .get('/archives/overview')
      .then((data) => setGuides(data.guides ?? []))
      .catch((err) => {
        toastArchError(err);
        setGuides([]);
      });
  }, []);

  return (
    <div className="arch-page">
      <ArchNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="brown">
            {t('arch.help.title')}
          </Title>
        </h1>
      </div>

      <Card pattern="app-yellow">
        <b>{t('arch.help.introTitle')}</b>
        <p>{t('arch.help.intro')}</p>
        <div className="arch-tag-row">
          <Tag color="brown" variant="soft" size="small">
            {t('arch.help.tagReadonly')}
          </Tag>
          <Tag color="brown" variant="soft" size="small">
            {t('arch.help.tagMasked')}
          </Tag>
          <Tag color="brown" variant="soft" size="small">
            {t('arch.help.tagLogged')}
          </Tag>
        </div>
      </Card>

      <section>
        <h2 className="section-title">
          <Title size="middle" color="brown">
            {t('arch.help.guides')}
          </Title>
        </h2>
        <div className="arch-guide-list">
          {(guides ?? []).map((guide) => (
            <Collapse key={guide.code} question={guide.title} answer={guide.body} />
          ))}
          {guides && guides.length === 0 && (
            <Card type="dashed">
              <p className="arch-empty">{t('arch.home.noGuides')}</p>
            </Card>
          )}
        </div>
      </section>

      <section>
        <h2 className="section-title">
          <Title size="middle" color="brown">
            {t('arch.help.faq')}
          </Title>
        </h2>
        <div className="arch-guide-list">
          {FAQ_KEYS.map((key) => (
            <Collapse key={key} question={t(`arch.help.${key}.q`)} answer={t(`arch.help.${key}.a`)} />
          ))}
        </div>
      </section>
    </div>
  );
}