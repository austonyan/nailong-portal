import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Input, Pagination, Table, Tag, Title } from 'animal-island-ui';
import { SearchIcon, ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { CERT_STATUS_COLORS, normalizeDocNo } from '../../api/docs.js';
import { toastError, toastWarning } from '../../components/toast.js';

function ResultCard({ result }) {
  const { t } = useTranslation();
  if (!result) return null;
  if (!result.found) {
    return (
      <Card color="default" className="docs-verify-result">
        <strong>{t('docs.verify.notFoundTitle')}</strong>
        <p className="muted-text">{t('docs.verify.notFoundBody')}</p>
      </Card>
    );
  }
  if (result.self) {
    return (
      <Card color="app-blue" className="docs-verify-result">
        <div className="docs-verify-head">
          <strong>{t('docs.verify.selfTitle', { no: result.appNo })}</strong>
          <Tag color="app-blue" variant="soft">
            {t(`docs.status.${result.status}`)}
          </Tag>
        </div>
        {result.certificate?.found ? (
          <dl className="docs-kv">
            <dt>{t('docs.cert.certNo')}</dt>
            <dd>{result.certificate.certNo}</dd>
            <dt>{t('docs.certDetail.certStatus')}</dt>
            <dd>
              <Tag color={CERT_STATUS_COLORS[result.certificate.status]} variant="soft">
                {t(`docs.certStatus.${result.certificate.status}`)}
              </Tag>
            </dd>
          </dl>
        ) : (
          <p className="muted-text">{t('docs.verify.selfNoCert')}</p>
        )}
      </Card>
    );
  }
  return (
    <Card color={result.valid ? 'app-green' : 'default'} className="docs-verify-result">
      <div className="docs-verify-head">
        <strong>{t('docs.verify.foundTitle')}</strong>
        <Tag color={result.valid ? 'app-green' : 'app-red'} variant="soft">
          {result.valid ? t('docs.verify.validYes') : t('docs.verify.validNo')}
        </Tag>
      </div>
      <dl className="docs-kv">
        <dt>{t('docs.cert.certNo')}</dt>
        <dd>{result.certNo}</dd>
        <dt>{t('docs.appList.type')}</dt>
        <dd>{result.typeName}</dd>
        <dt>{t('docs.certDetail.certStatus')}</dt>
        <dd>
          <Tag color={CERT_STATUS_COLORS[result.status]} variant="soft">
            {t(`docs.certStatus.${result.status}`)}
          </Tag>
        </dd>
        <dt>{t('docs.cert.issuedAt')}</dt>
        <dd>{String(result.issuedAt || '').slice(0, 10)}</dd>
        <dt>{t('docs.cert.expiresAt')}</dt>
        <dd>{String(result.expiresAt || '').slice(0, 10)}</dd>
        <dt>{t('docs.verify.issuer')}</dt>
        <dd>{result.issuer}</dd>
      </dl>
    </Card>
  );
}

export default function DocsVerify() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [no, setNo] = useState(searchParams.get('no') || '');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const [page, setPage] = useState(1);

  const loadHistory = useCallback(async () => {
    try {
      const d = await api.get(`/docs/verify/mine?page=${page}&pageSize=8`);
      setHistory(d);
    } catch {
      setHistory({ items: [], total: 0 });
    }
  }, [page]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const query = useCallback(
    async (value) => {
      const target = normalizeDocNo(value);
      if (!target) {
        toastWarning(t('docs.verify.inputRequired'));
        return;
      }
      setBusy(true);
      try {
        const d = await api.post('/docs/verify', { no: target });
        setResult(d);
        loadHistory();
      } catch (err) {
        toastError(t(`api.${err.code}`, { defaultValue: err.message }));
      } finally {
        setBusy(false);
      }
    },
    [t, loadHistory]
  );

  // /docs/verify?no=xxx 从文书详情跳转时自动查询
  useEffect(() => {
    const prefill = searchParams.get('no');
    if (prefill) query(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resultColumns = [
    { title: t('docs.verify.historyQuery'), dataIndex: 'query', width: 220 },
    {
      title: t('docs.verify.historyResult'),
      dataIndex: 'result',
      width: 120,
      render: (v) => (
        <Tag color={v === 'not_found' ? 'app-red' : 'app-green'} variant="soft">
          {t(`docs.verify.result.${v}`)}
        </Tag>
      ),
    },
    { title: t('common.createdAt'), dataIndex: 'createdAt', render: (v) => String(v).slice(0, 16).replace('T', ' ') },
  ];

  return (
    <div className="docs-verify">
      <Title size="middle" color="app-blue">
        {t('docs.verify.title')}
      </Title>
      <Card className="docs-block">
        <p className="muted-text">{t('docs.verify.tip')}</p>
        <div className="docs-verify-bar">
          <Input
            value={no}
            onChange={(e) => setNo(e.target.value)}
            placeholder={t('docs.verify.placeholder')}
            allowClear
            size="large"
            onKeyDown={(e) => e.key === 'Enter' && query(no)}
          />
          <Button type="primary" size="large" icon={<SearchIcon />} loading={busy} onClick={() => query(no)} disabled={busy}>
            {t('docs.verify.query')}
          </Button>
        </div>
        <p className="muted-text docs-verify-limit">
          <ShieldIcon size={14} /> {t('docs.verify.limitTip')}
        </p>
      </Card>

      <ResultCard result={result} />

      <Card className="docs-block">
        <h3 className="docs-block-title">{t('docs.verify.historyTitle')}</h3>
        <Table className="table-fit"
          columns={resultColumns}
          dataSource={history?.items || []}
          rowKey="id"
          loading={history === null}
          emptyText={t('docs.verify.historyEmpty')}
          pagination={false}
        />
        {history?.total > 8 && (
          <div className="docs-pagination">
            <Pagination total={history.total} current={page} pageSize={8} onChange={setPage} showTotal />
          </div>
        )}
      </Card>
    </div>
  );
}
