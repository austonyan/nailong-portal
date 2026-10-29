// Declaration attachments: private upload / authorized download / delete.
// Server enforces ownership, state machine and mime/size limits; the download
// endpoint writes a file-access audit entry.
import { useTranslation } from 'react-i18next';
import { Button, Tag, Upload } from 'animal-island-ui';
import { PaperclipIcon, TrashIcon } from 'naive-icons';
import { api, getAccessToken, getLocaleHeader } from '../../api/client.js';
import { toastApiError } from './apiError.js';

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// Thin wrapper around the library Upload (text trigger, hidden built-in list).
function UploadInline({ customRequest, onDone }) {
  const { t } = useTranslation();
  return (
    <Upload customRequest={customRequest} onChange={onDone} showUploadList={false} accept="image/*,application/pdf" aria-label={t('imm.attachments.upload')}>
      <Button type="dashed" size="small" icon={<PaperclipIcon />}>
        {t('imm.attachments.upload')}
      </Button>
    </Upload>
  );
}

export default function Attachments({ declarationId, attachments = [], canUpload, onChanged }) {
  const { t } = useTranslation();

  const customRequest = ({ file, onSuccess, onError }) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/immigration/declarations/${declarationId}/attachments`);
    xhr.setRequestHeader('Authorization', `Bearer ${getAccessToken()}`);
    xhr.setRequestHeader('X-Nailong-Locale', getLocaleHeader()['X-Nailong-Locale']);
    xhr.onload = () => {
      if (xhr.status < 400) onSuccess(JSON.parse(xhr.responseText || '{}'));
      else onError(JSON.parse(xhr.responseText || '{}'));
    };
    xhr.onerror = () => onError({});
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  };

  const handleChange = (info) => {
    if (info.file.status === 'done') {
      if (info.file.response?.attachment) onChanged(info.file.response.attachment);
    } else if (info.file.status === 'error') {
      toastApiError({ code: info.file.response?.code || 'NETWORK_ERROR' });
    }
  };

  const remove = async (att) => {
    try {
      await api.del(`/attachments/${att.id}`);
      onChanged({ id: att.id, removed: true });
    } catch (err) {
      toastApiError(err);
    }
  };

  const download = async (att) => {
    try {
      const res = await fetch(`/api/attachments/${att.id}/download`, {
        headers: { Authorization: `Bearer ${getAccessToken()}`, ...getLocaleHeader() },
      });
      if (!res.ok) throw new Error(res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toastApiError({ code: 'FORBIDDEN' });
    }
  };

  return (
    <div className="im-attachments">
      <div className="im-attachment-list">
        {attachments.map((att) => (
          <div key={att.id} className="im-attachment-row">
            <PaperclipIcon size={16} />
            <button type="button" className="im-attachment-name" onClick={() => download(att)}>
              {att.filename}
            </button>
            <span className="muted-text">{fmtSize(att.size)}</span>
            {canUpload && (
              <Button type="text" size="small" danger icon={<TrashIcon />} onClick={() => remove(att)}>
                {t('common.delete')}
              </Button>
            )}
          </div>
        ))}
        {attachments.length === 0 && <span className="muted-text">{t('imm.attachments.empty')}</span>}
      </div>
      {canUpload && (
        <div className="im-attachment-upload">
          <UploadInline customRequest={customRequest} onDone={handleChange} />
          <Tag size="small">{t('imm.attachments.limit')}</Tag>
        </div>
      )}
    </div>
  );
}
