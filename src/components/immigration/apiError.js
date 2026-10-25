// Toast helper usable outside React components (static Notification API).
import { Notification } from 'animal-island-ui';
import i18n from '../../i18n/index.js';

export function toastApiError(err) {
  Notification.error(i18n.t(`api.${err?.code}`, { defaultValue: err?.message || i18n.t('api.INTERNAL_ERROR') }));
}
