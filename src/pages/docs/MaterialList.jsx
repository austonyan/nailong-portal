import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Image, Modal, Tag } from 'animal-island-ui';
import { DownloadIcon, EyeIcon, PaperclipIcon } from 'naive-icons';
import { downloadMaterial, formatBytes, isImageMime, materialPreviewUrl } from '../../api/docs.js';
import { toastError } from '../../components/toast.js';

// 只读材料列表(申请详情 / 审核工作台共用): 预览图片、下载、来源标记。
export default function MaterialList({ materials, type }) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState(null); // { url, name }

  const kindLabel = (kind) => type?.materials?.find((m) => m.key === kind)?.label || kind;
  const openPreview = async (mat) => {
    try {
      const url = await materialPreviewUrl(mat.id);
      setPreview({ url, name: mat.filename });
    } catch (err) {
      toastError(t(`api.${err?.code}`, { defaultValue: err?.message || t('api.INTERNAL_ERROR') }));
    }
  };

  if (!materials?.length) {
    return <p className="muted-text">{t('docs.materials.empty')}</p>;
  }

  return (
    <ul className="docs-mat-list docs-mat-list-rich">
      {materials.map((mat) => (
        <li key={mat.id}>
          <PaperclipIcon size={14} />
          <span className="docs-mat-kind">{kindLabel(mat.kind)}</span>
          <span className="docs-mat-name">{mat.filename}</span>
          <span className="muted-text">{formatBytes(mat.size)}</span>
          {mat.origin === 'supplement' && (
            <Tag size="small" color="app-orange" variant="soft">
              {t('docs.apply.supplementOrigin')}
            </Tag>
          )}
          <div className="table-actions">
            {isImageMime(mat.mime) && (
              <Button size="small" type="text" icon={<EyeIcon />} aria-label={t('docs.materials.preview')} onClick={() => openPreview(mat)} />
            )}
            <Button size="small" type="text" icon={<DownloadIcon />} aria-label={t('docs.materials.download')} onClick={() => downloadMaterial(mat.id, mat.filename)} />
          </div>
        </li>
      ))}
      <Modal open={!!preview} title={preview?.name} typewriter={false} footer={null} width={640} onClose={() => setPreview(null)}>
        {preview && <Image src={preview.url} alt={preview.name} width="100%" />}
      </Modal>
    </ul>
  );
}
