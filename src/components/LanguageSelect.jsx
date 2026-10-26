import { useTranslation } from 'react-i18next';
import { Select } from 'animal-island-ui';
import { REQUIRED_LOCALES, setLanguage } from '../i18n/index.js';

const LOCALE_LABELS = { 'zh-CN': '简体中文', 'zh-TW': '繁體中文' };

export default function LanguageSelect() {
  const { i18n, t } = useTranslation();
  const change = (lng) => {
    if (lng === i18n.language) return;
    setLanguage(lng);
    // API responses carry server-stored content localized per request, so a
    // full reload is required to refresh data already rendered on the page.
    window.location.reload();
  };
  return (
    <div className="language-select" role="group" aria-label={t('nav.language')}>
      <Select
        value={REQUIRED_LOCALES.includes(i18n.language) ? i18n.language : 'zh-CN'}
        onChange={change}
        options={REQUIRED_LOCALES.map((lng) => ({ key: lng, label: LOCALE_LABELS[lng] ?? lng }))}
      />
    </div>
  );
}