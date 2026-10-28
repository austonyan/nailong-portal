// 外交礼遇: 礼遇类型说明 / 凭外交身份编号查资格 / 我的使用记录。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Table, Tag, Title } from 'animal-island-ui';
import { SearchIcon, StarIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { DipNav, fmtDate, fmtDateTime, toastDipError } from '../../components/dip/shared.jsx';

export default function DipCourtesies() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [code, setCode] = useState('');
  const [checkResult, setCheckResult] = useState(null);

  const load = useCallback(() => {
    api
      .get('/dip/courtesies')
      .then(setData)
      .catch((err) => {
        toastDipError(t, err);
        setData({ types: [], items: [] });
      });
  }, [t]);

  useEffect(load, [load]);

  const check = async () => {
    if (!code.trim()) return;
    try {
      const res = await api.post('/dip/courtesies/check', { code: code.trim() });
      setCheckResult(res);
    } catch (err) {
      setCheckResult(null);
      toastDipError(t, err);
    }
  };

  const recordColumns = [
    { title: t('dip.courtesy.type'), dataIndex: 'courtesy_name', width: 140, render: (v, r) => v || t(`dip.courtesy.${r.courtesy_code}`, { defaultValue: r.courtesy_code }) },
    {
      title: t('dip.courtesy.source'),
      dataIndex: 'source',
      width: 100,
      render: (v) => <Tag size="small" color={v === 'auto' ? 'app-teal' : 'app-blue'} variant="soft">{t(`dip.courtesy.source_${v}`)}</Tag>,
    },
    { title: t('dip.identity.no'), dataIndex: 'identity_no', width: 200 },
    { title: t('dip.courtesy.note'), dataIndex: 'note', render: (v) => v || '-' },
    { title: t('dip.courtesy.at'), dataIndex: 'created_at', width: 160, render: (v) => fmtDateTime(v) },
  ];

  return (
    <div className="dip-page">
      <DipNav />
      <div className="page-header">
        <Title size="middle" color="purple">{t('dip.courtesy.title')}</Title>
      </div>

      <Card>
        <Title size="small">{t('dip.courtesy.typesTitle')}</Title>
        <div className="dip-courtesy-grid">
          {(data?.types ?? []).map((c) => (
            <Card key={c.code} hoverable className="dip-courtesy-card">
              <StarIcon size={22} />
              <b>{c.name}</b>
              <p className="muted-text">{c.description}</p>
            </Card>
          ))}
          {(data?.types ?? []).length === 0 && <p className="muted-text">{t('common.empty')}</p>}
        </div>
      </Card>

      <Card>
        <Title size="small">{t('dip.courtesy.checkTitle')}</Title>
        <p className="muted-text">{t('dip.courtesy.checkTip')}</p>
        <div className="dip-check-row">
          <Input
            size="large"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="NLE20261025-XXXXXX"
            allowClear
            maxLength={40}
          />
          <Button type="primary" icon={<SearchIcon />} onClick={check}>{t('dip.agreement.check')}</Button>
        </div>
        {checkResult && (
          <div className="dip-eligibility-result">
            <p>
              <Tag color="app-green" variant="soft">{t('dip.courtesy.eligible')}</Tag>
              {t('dip.agreement.entity')}: <b>{checkResult.entityName}</b> ·{' '}
              {t('dip.identity.termEnd')}: {checkResult.termEnd ? fmtDate(checkResult.termEnd) : '-'}
            </p>
            <div className="dip-courtesy-grid">
              {checkResult.types.map((c) => (
                <Card key={c.code} className="dip-courtesy-card">
                  <StarIcon size={18} />
                  <b>{c.name}</b>
                </Card>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <Title size="small">{t('dip.courtesy.recordsTitle')}</Title>
        <Table className="table-fit" columns={recordColumns} dataSource={data?.items ?? []} loading={data === null} rowKey="id" pagination={{ defaultPageSize: 10, showTotal: true }} />
      </Card>
    </div>
  );
}
