import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Modal, Select, Table, Tabs, Tag, Title } from 'animal-island-ui';
import { DownloadIcon, SendIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastApiError } from '../../components/immigration/apiError.js';
import { ImNav, StampView, StatusTag, exportCsv } from '../../components/immigration/shared.jsx';
import { toastSuccess } from '../../components/toast.js';

function daysLeft(entry) {
  const deadline = Date.parse(`${entry.entry_date}T00:00:00`) + entry.stay_days * 24 * 60 * 60 * 1000;
  return Math.ceil((deadline - Date.now()) / 24 / 60 / 60 / 1000);
}

function EntryTab({ onReload }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [exitTarget, setExitTarget] = useState(null);
  const [ports, setPorts] = useState([]);
  const [exitPort, setExitPort] = useState('ROYAL_PORT');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get('/immigration/records/entry')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastApiError(err);
        setItems([]);
      });
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    api
      .get('/immigration/ports')
      .then((data) => setPorts(data.items))
      .catch(() => {});
  }, []);

  const registerExit = async () => {
    setBusy(true);
    try {
      const data = await api.post(`/immigration/records/entry/${exitTarget.id}/exit`, { portId: ports.find((p) => p.code === exitPort)?.id });
      toastSuccess(t('imm.records.exitDone', { no: data.exitNo }));
      setExitTarget(null);
      load();
      onReload?.();
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const exportAll = () => {
    exportCsv(
      'entry-records.csv',
      [
        { key: 'no', label: t('imm.records.recordNo') },
        { key: 'port_name', label: t('imm.declare.port') },
        { key: 'entry_date', label: t('imm.records.entryDate') },
        { key: 'stay_days', label: t('imm.declare.stayDays') },
        { key: 'visa_no', label: t('imm.declare.visaNo') },
        { key: 'status', label: t('common.status') },
      ],
      (items ?? []).map((r) => ({ ...r, status: t(`imm.status.${r.status}`) }))
    );
  };

  const columns = [
    { title: t('imm.records.recordNo'), dataIndex: 'no', width: 190 },
    { title: t('imm.declare.port'), dataIndex: 'port_name', width: 120 },
    { title: t('imm.records.entryDate'), dataIndex: 'entry_date', width: 110 },
    { title: t('imm.declare.stayDays'), dataIndex: 'stay_days', width: 90 },
    { title: t('imm.records.stamp'), dataIndex: 'stamp_style', width: 130, render: (v, r) => <StampView portName={r.port_name} date={r.entry_date} recordNo={r.no} style={v} compact /> },
    { title: t('common.status'), dataIndex: 'status', width: 100, render: (v) => <StatusTag value={v} /> },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 160,
      render: (_, record) =>
        record.status === 'entered' ? (
          <Button type="default" size="small" icon={<SendIcon />} onClick={() => setExitTarget(record)}>
            {t('imm.records.registerExit')}
          </Button>
        ) : (
          <span className="muted-text">-</span>
        ),
    },
  ];

  const expiring = (items ?? []).filter((r) => r.status === 'entered' && daysLeft(r) <= 1);

  return (
    <div>
      {expiring.length > 0 && (
        <Card color="app-orange" className="im-expiring-banner">
          <Tag color="app-orange" variant="solid">{t('imm.records.expiring')}</Tag>
          {t('imm.records.expiringTip', { count: expiring.length })}
        </Card>
      )}
      <div className="im-export-row">
        <Button type="text" size="small" icon={<DownloadIcon />} onClick={exportAll} disabled={!items?.length}>
          {t('imm.records.export')}
        </Button>
      </div>
      <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={{ defaultPageSize: 10, showTotal: true }} emptyText={t('imm.records.empty')} />
      <Modal
        open={exitTarget !== null}
        title={t('imm.records.exitTitle', { no: exitTarget?.no })}
        onClose={() => setExitTarget(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setExitTarget(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={registerExit}>{t('imm.records.confirmExit')}</Button>
          </>
        }
      >
        <p>{t('imm.records.exitTip')}</p>
        <Select
          value={exitPort}
          onChange={setExitPort}
          options={ports.map((p) => ({ key: p.code, label: p.name }))}
        />
      </Modal>
    </div>
  );
}

function ExitTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);

  useEffect(() => {
    api
      .get('/immigration/records/exit')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastApiError(err);
        setItems([]);
      });
  }, []);

  const columns = [
    { title: t('imm.records.recordNo'), dataIndex: 'no', width: 190 },
    { title: t('imm.records.entryNo'), dataIndex: 'entry_no', width: 190 },
    { title: t('imm.declare.port'), dataIndex: 'port_name', width: 130 },
    { title: t('imm.records.exitDate'), dataIndex: 'exit_date', width: 110 },
  ];

  return (
    <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={{ defaultPageSize: 10, showTotal: true }} emptyText={t('imm.records.exitEmpty')} />
  );
}

export default function ImmigrationRecords() {
  const { t } = useTranslation();
  return (
    <div className="im-page">
      <ImNav />
      <div className="page-header">
        <Title size="middle" color="app-orange">
          {t('imm.records.title')}
        </Title>
      </div>
      <Card>
        <Tabs
          items={[
            { key: 'entry', label: t('imm.records.entryTab'), children: <EntryTab /> },
            { key: 'exit', label: t('imm.records.exitTab'), children: <ExitTab /> },
          ]}
        />
      </Card>
      <p className="muted-text im-records-note">{t('imm.records.note')}</p>
    </div>
  );
}
