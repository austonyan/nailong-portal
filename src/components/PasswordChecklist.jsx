import { CheckCircleIcon } from 'naive-icons';
import { useTranslation } from 'react-i18next';

// 密码实时规则反馈:输入即校验,每条规则同时给图标和文字(不只靠颜色)。
// value 非空才显示规则清单;confirm 非空才显示两次一致行,避免空表单时的噪音。
// rules: [{ key, label, test(value) }];pass 态用 success 色混墨(薄荷/叶绿不做小字)。
export default function PasswordChecklist({ value, rules, confirm }) {
  const { t } = useTranslation();
  const filled = typeof value === 'string' && value.length > 0;
  const confirmFilled = typeof confirm === 'string' && confirm.length > 0;
  if (!filled && !confirmFilled) return null;
  const matched = filled && confirmFilled && value === confirm;

  return (
    <ul className="pw-check" aria-live="polite">
      {filled &&
        rules.map((rule) => {
          const passed = rule.test(value);
          return (
            <li key={rule.key} className={passed ? 'pass' : 'todo'}>
              {passed ? <CheckCircleIcon size={13} /> : <i className="pw-check-dot" aria-hidden="true" />}
              <span>{rule.label}</span>
            </li>
          );
        })}
      {confirmFilled && (
        <li className={matched ? 'pass' : 'err'}>
          {matched ? <CheckCircleIcon size={13} /> : <i className="pw-check-dot err" aria-hidden="true" />}
          <span>{t(matched ? 'auth.pwCheck.match' : 'auth.pwCheck.mismatch')}</span>
        </li>
      )}
    </ul>
  );
}
