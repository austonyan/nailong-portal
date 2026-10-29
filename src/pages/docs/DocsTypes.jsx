import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Collapse, Divider, Modal, Tag, Title } from 'animal-island-ui';
import { ClipboardIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastError } from '../../components/toast.js';

export default function DocsTypes() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [types, setTypes] = useState(null);
  const [focus, setFocus] = useState(null); // focused type object for the modal

  useEffect(() => {
    let cancelled = false;
    api
      .get('/docs/types')
      .then((d) => {
        if (!cancelled) setTypes(d.items);
      })
      .catch((err) => {
        toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
        if (!cancelled) setTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // /docs/types?focus=CODE deep link from the home catalog
  // 依赖用 focus 字符串本身:searchParams 对象每次渲染都是新引用,会让这个 effect
  // 反复执行(并反复 setSearchParams)。
  const focusParam = searchParams.get('focus');
  useEffect(() => {
    if (focusParam && types?.length) {
      const hit = types.find((tp) => tp.code === focusParam);
      if (hit) setFocus(hit);
      setSearchParams({}, { replace: true });
    }
  }, [focusParam, types, setSearchParams]);

  if (types === null) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('docs.types.title')}</Title>
      </div>
      <div className="portal-grid">
        {types.map((tp) => (
          <Card key={tp.code} hoverable className="docs-type-card docs-type-card-lg" onClick={() => setFocus(tp)}>
            <div className="docs-type-head">
              <h3 className="docs-type-name">{tp.name}</h3>
              <Tag size="small" variant="outlined">
                {tp.code}
              </Tag>
            </div>
            <p className="docs-type-desc">{tp.description}</p>
            <div className="docs-type-meta">
              <Tag size="small" color="app-teal" variant="soft">
                {t('docs.types.validityDays', { days: tp.validityDays })}
              </Tag>
              {tp.bizNoLabel && (
                <Tag size="small" color="app-blue" variant="soft">
                  {t('docs.types.bizLabel', { label: tp.bizNoLabel })}
                </Tag>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Divider type="hairline" />

      <Card className="docs-guide-card">
        <Title size="small" color="purple">
          {t('docs.types.faqTitle')}
        </Title>
        <Collapse question={t('docs.types.faq1q')} answer={t('docs.types.faq1a')} />
        <Collapse question={t('docs.types.faq2q')} answer={t('docs.types.faq2a')} />
        <Collapse question={t('docs.types.faq3q')} answer={t('docs.types.faq3a')} />
      </Card>

      <Modal
        maskClosable={false}
        open={!!focus}
        title={focus ? `${focus.name} · ${focus.code}` : ''}
        width={640}
        typewriter={false}
        onClose={() => setFocus(null)}
        footer={
          focus && (
            <>
              <Button onClick={() => setFocus(null)}>{t('common.cancel')}</Button>
              <Button
                type="primary"
                icon={<ClipboardIcon />}
                onClick={() => {
                  setFocus(null);
                  window.location.assign(`/docs/apply?type=${focus.code}`);
                }}
              >
                {t('docs.apply.start')}
              </Button>
            </>
          )
        }
      >
        {focus && (
          <div className="docs-type-detail">
            <p>{focus.description}</p>
            <h4>{t('docs.types.guideTitle')}</h4>
            <p className="docs-guide-text">{focus.guide || t('docs.types.guideEmpty')}</p>
            <h4>{t('docs.types.materialsTitle')}</h4>
            <ul className="docs-material-list">
              {(focus.materials || []).map((m) => (
                <li key={m.key}>
                  <strong>{m.label}</strong>
                  {m.required ? (
                    <Tag size="small" color="app-red" variant="soft">
                      {t('docs.apply.required')}
                    </Tag>
                  ) : (
                    <Tag size="small" variant="soft">
                      {t('common.optional')}
                    </Tag>
                  )}
                  <span className="muted-text">
                    {t('docs.types.materialRule', { count: m.max_count, mb: m.max_mb })}
                  </span>
                </li>
              ))}
              {(focus.materials || []).length === 0 && <li className="muted-text">{t('docs.types.materialsEmpty')}</li>}
            </ul>
            <h4>{t('docs.types.formTitle')}</h4>
            <ul className="docs-material-list">
              <li>
                {t('docs.apply.nickname')} / {t('docs.apply.contact')} /{' '}
                {focus.bizNoLabel ? `${focus.bizNoLabel}${focus.bizRequired ? '' : `(${t('common.optional')})`}` : t('docs.types.noBiz')}
              </li>
              {(focus.formFields || []).map((f) => (
                <li key={f.key}>
                  {f.label}
                  {f.required ? <Tag size="small" color="app-red" variant="soft">{t('docs.apply.required')}</Tag> : <Tag size="small" variant="soft">{t('common.optional')}</Tag>}
                </li>
              ))}
            </ul>
            <h4>{t('docs.types.shownTitle')}</h4>
            <p className="muted-text">{t('docs.types.shownBody')}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
