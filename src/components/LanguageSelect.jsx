import { useTranslation } from 'react-i18next';
import { Select } from 'animal-island-ui';
import { REQUIRED_LOCALES, setLanguage } from '../i18n/index.js';

// 语种名走 i18n(而不是写死中文),这样切到繁体界面时语言名称也是繁体;
// aria-label 必须挂在 Select 控件本身,读屏才能读到名称(挂外层 div 读不到)。
export default function LanguageSelect() {
  const { i18n, t } = useTranslation();
  const change = (lng) => {
    if (lng === i18n.language) return;
    // 原地切换:界面文案立刻重渲染,依赖 `t` 的页面加载回调会重新拉取服务端
    // 本地化内容(X-Nailong-Locale 取自当前 i18n.language)。不再整页刷新,
    // 表单里未提交的草稿因此不会丢失。
    setLanguage(lng);
  };
  return (
    <div className="language-select">
      <Select
        aria-label={t('nav.language')}
        value={REQUIRED_LOCALES.includes(i18n.language) ? i18n.language : 'zh-CN'}
        onChange={change}
        options={REQUIRED_LOCALES.map((lng) => ({ key: lng, label: t(`language.${lng}`) }))}
      />
    </div>
  );
}
