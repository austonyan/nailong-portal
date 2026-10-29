// 我的年度报告:生成(按年度)、列表与查看入口。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { EyeIcon, PlusIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastSuccess } from '../../components/toast.js';
import { fmtDateTime, toastStatError } from './shared.jsx';

export default function StatsReports() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/stats/reports');
      setItems(data.items);
    } catch (err) {
      toastStatError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2].map((y) => ({
    key: String(y),
    label: t('stat.reports.yearOption', { year: y }),
  }));

  const openGenerate = () => {
    setYear(String(currentYear));
    setModalOpen(true);
  };

  const closeGenerate = () => {
    if (busy) return;
    setModalOpen(false);
  };

  const generate = async () => {
    if (!year) return;
    setBusy(true);
    try {
      const data = await api.post('/stats/reports', { year: Number(year) });
      setModalOpen(false);
      toastSuccess(t('stat.reports.generatedToast', { year: data.report.year }));
      await load();
      navigate(`/stats/reports/${data.report.id}`);
    } catch (err) {
      toastStatError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      title: t('stat.reports.year'),
      dataIndex: 'year',
      width: 110,
      render: (v) => <Tag variant="soft" color="app-blue">{v}</Tag>,
    },
    { title: t('stat.reports.reportNo'), dataIndex: 'no', width: 200 },
    { title: t('stat.reports.generatedAt'), dataIndex: 'generatedAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 110,
      render: (_, record) => (
        <div className="table-actions">
          <Button type="default" size="small" icon={<EyeIcon />} onClick={() => navigate(`/stats/reports/${record.id}`)}>
            {t('stat.reports.view')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="stat-page">
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-blue">
            {t('stat.reports.title')}
          </Title>
        </h1>
        <Button type="primary" icon={<PlusIcon />} onClick={openGenerate}>
          {t('stat.reports.generate')}
        </Button>
      </div>
      <p className="muted-text">{t('stat.reports.tip')}</p>

      <Card>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('stat.reports.empty')}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={modalOpen}
        title={t('stat.reports.generateTitle')}
        onClose={closeGenerate}
        typewriter={false}
        footer={
          <>
            <Button onClick={closeGenerate} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" loading={busy} disabled={busy || !year} onClick={generate}>
              {t('stat.reports.generate')}
            </Button>
          </>
        }
      >
        <div className="stat-form-row">
          <label htmlFor="stat-report-year">
            {t('stat.reports.year')} <span className="stat-required">*</span>
          </label>
          <Select
            value={year}
            onChange={(value) => setYear(value)}
            options={yearOptions}
            placeholder={t('stat.reports.yearPlaceholder')}
          />
          <p className="muted-text">{t('stat.reports.generateTip')}</p>
        </div>
      </Modal>
    </div>
  );
}