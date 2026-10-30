// Toast helper usable outside React components.
import i18n from '../../i18n/index.js';
import { toastError } from '../toast.js';

export function toastApiError(err) {
  toastError(i18n.t(`api.${err?.code}`, { defaultValue: i18n.t('api.INTERNAL_ERROR') }));
}