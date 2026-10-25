// 外交署申请材料:私有上传 / 受控下载 / 删除。
// 服务端校验归属、状态机与 mime/大小限制,下载写文件访问审计。
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Select, Tag, Upload } from 'animal-island-ui';
import { PaperclipIcon, TrashIcon } from 'naive-icons';
import { getAccessToken } from '../../api/client.js';
import { toastDipError } from './shared.jsx';

const KINDS = ['intro', 'proof', 'community', 'appointment', 'letter', 'other'];

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default function DipMaterials({ ownerType, ownerId, materials = [], canUpload, onChanged }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState(ownerType === 'identity' ? 'appointment' : 'intro');

  const download = async (mat) => {
    try {
      const res = await fetch(`/api/dip/materials/${mat.id}/download`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (!res.ok) throw new Error(res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = mat.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toastDipError(t, { code: 'FORBIDDEN' });
    }
  };

  const remove = async (mat) => {
    try {
      const res = await fetch(`/api/dip/materials/${mat.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (!res.ok) throw new Error(res.status);
      onChanged({ id: mat.id, removed: true });
    } catch (err) {
      toastDipError(t, err);
    }
  };

  const customRequest = ({ file, onSuccess, onError }) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/dip/materials/${ownerType}/${ownerId}`);
    xhr.setRequestHeader('Authorization', `Bearer ${getAccessToken()}`);
    xhr.onload = () => {
      if (xhr.status < 400) onSuccess(JSON.parse(xhr.responseText || '{}'));
      else onError(JSON.parse(xhr.responseText || '{}'));
    };
    xhr.onerror = () => onError({});
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    xhr.send(form);
  };

  const handleChange = (info) => {
    if (info.file.status === 'done') {
      if (info.file.response?.material) onChanged(info.file.response.material);
    } else if (info.file.status === 'error') {
      toastDipError(t, { code: info.file.response?.code || 'NETWORK_ERROR' });
    }
  };

  return (
    <div className="dip-materials">
      <div className="dip-material-list">
        {materials.map((mat) => (
          <div key={mat.id} className="dip-material-row">
            <PaperclipIcon size={16} />
            <button type="button" className="dip-material-name" onClick={() => download(mat)}>
              {mat.filename}
            </button>
            <Tag size="small">{t(`dip.materialKind.${mat.kind}`, { defaultValue: mat.kind })}</Tag>
            {mat.origin === 'supplement' && <Tag size="small" color="app-orange" variant="soft">{t('dip.material.supplementOrigin')}</Tag>}
            <span className="muted-text">{fmtSize(mat.size)}</span>
            {canUpload && (
              <Button type="text" size="small" danger icon={<TrashIcon />} onClick={() => remove(mat)}>
                {t('common.delete')}
              </Button>
            )}
          </div>
        ))}
        {materials.length === 0 && <span className="muted-text">{t('dip.material.empty')}</span>}
      </div>
      {canUpload && (
        <div className="dip-material-upload">
          <Upload
            customRequest={customRequest}
            onChange={handleChange}
            showUploadList={false}
            accept="image/*,application/pdf"
            aria-label={t('dip.material.upload')}
          >
            <Button type="dashed" size="small" icon={<PaperclipIcon />}>
              {t('dip.material.upload')}
            </Button>
          </Upload>
          <Select
            value={kind}
            onChange={setKind}
            options={KINDS.map((k) => ({ key: k, label: t(`dip.materialKind.${k}`) }))}
          />
          <Tag size="small">{t('dip.material.limit')}</Tag>
        </div>
      )}
    </div>
  );
}
