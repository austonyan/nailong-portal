// 年度报告详情:按报告卡排版,可打印(不做图片导出)。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { ArrowLeftIcon, PrinterIcon, RefreshIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastSuccess } from '../../components/toast.js';
import { fmtDateTime, toastStatError } from './shared.jsx';

export default function StatsReportDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/stats/reports/${id}`);
      setReport(data.report);
    } catch (err) {
      toastStatError(t, err);
      setNotFound(true);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  // print 样式只展示报告纸本体
  useEffect(() => {
    if (!printing) return undefined;
    document.body.classList.add('stat-printing');
    const done = () => {
      document.body.classList.remove('stat-printing');
      setPrinting(false);
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    return done;
  }, [printing]);

  const regenerate = async () => {
    if (!report) return;
    setBusy(true);
    try {
      const data = await api.post('/stats/reports', { year: report.year });
      setReport(data.report);
      toastSuccess(t('stat.reports.regeneratedToast', { year: data.report.year }));
    } catch (err) {
      toastStatError(t, err);
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('stat.report.notFound')}</p>
        <Button onClick={() => navigate('/stats/reports')}>{t('stat.report.back')}</Button>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const sections = report.snapshot?.sections ?? [];

  return (
    <div className="stat-page">
      <div className="page-header no-print">
        <Title size="middle" color="app-blue">
          {t('stat.report.title', { year: report.year })}
        </Title>
        <div className="table-actions">
          <Button icon={<ArrowLeftIcon />} onClick={() => navigate('/stats/reports')}>
            {t('stat.report.back')}
          </Button>
          <Button icon={<RefreshIcon />} loading={busy} disabled={busy} onClick={regenerate}>
            {t('stat.report.regenerate')}
          </Button>
          <Button type="primary" icon={<PrinterIcon />} onClick={() => setPrinting(true)}>
            {t('stat.report.print')}
          </Button>
        </div>
      </div>

      <div className="stat-report-paper stat-print-area">
        <div className="stat-report-head">
          <div>
            <h3>{t('stat.report.paperTitle', { year: report.year })}</h3>
            <div className="stat-report-meta">{t('stat.report.paperSub')}</div>
          </div>
          <div className="stat-report-meta">
            <div>{report.no}</div>
            <div>{t('stat.report.generatedAt', { time: fmtDateTime(report.generatedAt) })}</div>
          </div>
        </div>

        {sections.length === 0 && <p className="muted-text">{t('stat.report.empty')}</p>}

        {sections.map((section) => (
          <section key={section.key} className="stat-report-section">
            <div className="stat-report-section-head">
              <Tag variant="soft" color="app-teal">
                {t(`stat.report.section.${section.key}`)}
              </Tag>
            </div>
            <div className="stat-report-items">
              {section.items.map((item) => (
                <div key={item.key} className="stat-report-item">
                  <strong className="stat-report-value">
                    {item.key === 'resident' ? (item.value ? t('common.yes') : t('common.no')) : item.value}
                  </strong>
                  <span className="stat-report-label">{t(`stat.report.item.${item.key}`)}</span>
                </div>
              ))}
            </div>
          </section>
        ))}

        <p className="stat-report-meta">{t('stat.report.footnote')}</p>
      </div>
    </div>
  );
}