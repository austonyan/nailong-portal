// 我的申请:列表、状态、进度入口与常用操作。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Modal, Table, Tag, Title } from 'animal-island-ui';
import { DownloadIcon, FileIcon, PlusIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { downloadVisaFile } from '../../api/visa.js';
import { APPLICATION_STATUS_COLORS, fmtDateTime, toastVisaError } from './shared.jsx';
import { toastSuccess } from '../../components/toast.js';

const WITHDRAWABLE = ['pending_review', 'supplement_required'];

export default function VisaMyApplications() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [withdrawTarget, setWithdrawTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/visa/applications');
      setItems(data.items);
    } catch (err) {
      toastVisaError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmWithdraw = async () => {
    if (!withdrawTarget) return;
    setBusy(true);
    try {
      await api.post(`/visa/applications/${withdrawTarget.id}/withdraw`);
      toastSuccess(t('visa.my.withdrawn'));
      setWithdrawTarget(null);
      await load();
    } catch (err) {
      toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const deleteDraft = async (app) => {
    try {
      await api.del(`/visa/applications/${app.id}`);
      toastSuccess(t('visa.my.draftDeleted'));
      await load();
    } catch (err) {
      toastVisaError(t, err);
    }
  };

  const exportCsv = async () => {
    try {
      await downloadVisaFile('/visa/applications/export.csv', `nailong-visa-${Date.now()}.csv`);
    } catch (err) {
      toastVisaError(t, err);
    }
  };

  const columns = [
    { title: t('visa.field.appNo'), dataIndex: 'appNo', width: 190 },
    { title: t('visa.field.type'), dataIndex: 'typeName', width: 110 },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 120,
      render: (v) => (
        <Tag color={APPLICATION_STATUS_COLORS[v] || 'default'} variant="soft">
          {t(`visa.status.${v}`)}
        </Tag>
      ),
    },
    { title: t('visa.field.submittedAt'), dataIndex: 'submittedAt', width: 160, render: fmtDateTime },
    { title: t('visa.field.updatedAt'), dataIndex: 'updatedAt', width: 160, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      render: (_, record) => (
        <div className="table-actions">
          <Button type="default" size="small" icon={<FileIcon />} onClick={() => navigate(`/visa/applications/${record.id}`)}>
            {t('visa.my.view')}
          </Button>
          {record.status === 'draft' && (
            <>
              <Button type="default" size="small" onClick={() => navigate(`/visa/applications/${record.id}/edit`)}>
                {t('common.edit')}
              </Button>
              <Button type="default" size="small" danger onClick={() => deleteDraft(record)}>
                {t('common.delete')}
              </Button>
            </>
          )}
          {WITHDRAWABLE.includes(record.status) && (
            <Button type="default" size="small" danger onClick={() => setWithdrawTarget(record)}>
              {t('visa.my.withdraw')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('visa.my.title')}</Title>
        <div className="table-actions">
          <Button icon={<DownloadIcon />} onClick={exportCsv}>
            {t('visa.my.export')}
          </Button>
          <Button type="primary" icon={<PlusIcon />} onClick={() => navigate('/visa/apply')}>
            {t('visa.home.applyEntry')}
          </Button>
        </div>
      </div>
      <Card>
        <Table className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={{ pageSize: 10, showTotal: true }}
          emptyText={t('visa.my.empty')}
        />
      </Card>

      <Modal
        open={withdrawTarget !== null}
        title={t('visa.my.withdrawConfirmTitle')}
        onClose={() => setWithdrawTarget(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setWithdrawTarget(null)}>{t('common.cancel')}</Button>
            <Button type="primary" danger loading={busy} onClick={confirmWithdraw} disabled={busy}>
              {t('visa.my.withdraw')}
            </Button>
          </>
        }
      >
        {withdrawTarget
          ? t('visa.my.withdrawConfirmBody', { no: withdrawTarget.appNo })
          : ''}
      </Modal>
    </div>
  );
}
