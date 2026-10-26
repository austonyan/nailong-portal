import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Table, Tabs, Title } from 'animal-island-ui';
import { AlertTriangleIcon, DownloadIcon, EditIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastApiError } from '../../../components/immigration/apiError.js';
import { ImAdminNav, StampView, StatusTag, exportCsv } from '../../../components/immigration/shared.jsx';
import { toastSuccess } from '../../../components/toast.js';

function EntryRecordsTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [entryDate, setEntryDate] = useState('');
  const [note, setNote] = useState('');
  const pageSize = 10;

  const load = useCallback(() => {
    api
      .get(`/immigration/admin/records?type=entry&page=${page}&pageSize=${pageSize}`)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        toastApiError(err);
        setItems([]);
      });
  }, [page]);

  useEffect(load, [load]);

  const saveEdit = async () => {
    try {
      await api.patch(`/immigration/admin/records/entry/${editing.id}`, { entryDate, note });
      toastSuccess(t('common.save'));
      setEditing(null);
      load();
    } catch (err) {
      toastApiError(err);
    }
  };

  const markInvalid = async (row) => {
    try {
      await api.post(`/immigration/admin/records/entry/${row.id}/mark`, { status: 'invalid' });
      toastSuccess(t('common.saved'));
      load();
    } catch (err) {
      toastApiError(err);
    }
  };

  const exportAll = () => {
    exportCsv(
      'im-entry-records.csv',
      [
        { key: 'no', label: t('imm.records.recordNo') },
        { key: 'traveler', label: t('imm.records.traveler') },
        { key: 'declarationNo', label: t('imm.mydecl.no') },
        { key: 'portName', label: t('imm.declare.port') },
        { key: 'visaNo', label: t('imm.declare.visaNo') },
        { key: 'entryDate', label: t('imm.records.entryDate') },
        { key: 'status', label: t('common.status') },
      ],
      (items ?? []).map((r) => ({ ...r, status: t(`imm.status.${r.status}`) }))
    );
  };

  const columns = [
    { title: t('imm.records.recordNo'), dataIndex: 'no', width: 190 },
    { title: t('imm.records.traveler'), dataIndex: 'traveler', width: 110 },
    { title: t('imm.mydecl.no'), dataIndex: 'declarationNo', width: 180 },
    { title: t('imm.declare.port'), dataIndex: 'portName', width: 110 },
    { title: t('imm.records.entryDate'), dataIndex: 'entryDate', width: 105 },
    { title: t('imm.records.stamp'), dataIndex: 'stampStyle', width: 130, render: (v, r) => <StampView portName={r.portName} date={r.entryDate} recordNo={r.no} style={v} compact /> },
    { title: t('common.status'), dataIndex: 'status', width: 95, render: (v) => <StatusTag value={v} /> },
    {
      title: t('common.actions'),
      width: 190,
      render: (_, record) => (
        <div className="table-actions">
          <Button
            type="default"
            size="small"
            icon={<EditIcon />}
            onClick={() => {
              setEditing(record);
              setEntryDate(record.entryDate);
              setNote(record.note ?? '');
            }}
          >
            {t('imm.records.correct')}
          </Button>
          {record.status !== 'invalid' && (
            <Button type="default" size="small" danger icon={<AlertTriangleIcon />} onClick={() => markInvalid(record)}>
              {t('imm.records.markInvalid')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="im-export-row">
        <Button type="text" size="small" icon={<DownloadIcon />} onClick={exportAll} disabled={!items?.length}>
          {t('imm.records.export')}
        </Button>
      </div>
      <Table className="table-fit"
        columns={columns}
        dataSource={items ?? []}
        loading={items === null}
        rowKey="id"
        pagination={{ current: page, pageSize, total, onChange: (p) => setPage(p), showTotal: true }}
      />
      <Modal
        open={editing !== null}
        title={t('imm.records.correctTitle', { no: editing?.no })}
        onClose={() => setEditing(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={saveEdit}>{t('common.save')}</Button>
          </>
        }
      >
        <p className="muted-text">{t('imm.records.correctTip')}</p>
        <p className="im-field-label">{t('imm.records.entryDate')}</p>
        <Input size="large" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} placeholder="YYYY-MM-DD" />
        <p className="im-field-label">{t('imm.admin.review.opinion')}</p>
        <Input size="large" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </Modal>
    </>
  );
}

function ExitRecordsTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    api
      .get(`/immigration/admin/records?type=exit&page=${page}&pageSize=${pageSize}`)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        toastApiError(err);
        setItems([]);
      });
  }, [page]);

  const columns = [
    { title: t('imm.records.recordNo'), dataIndex: 'no', width: 190 },
    { title: t('imm.records.traveler'), dataIndex: 'traveler', width: 110 },
    { title: t('imm.records.entryNo'), dataIndex: 'entryNo', width: 190 },
    { title: t('imm.declare.port'), dataIndex: 'portName', width: 120 },
    { title: t('imm.records.exitDate'), dataIndex: 'exitDate', width: 105 },
  ];

  return (
    <Table className="table-fit"
      columns={columns}
      dataSource={items ?? []}
      loading={items === null}
      rowKey="id"
      pagination={{ current: page, pageSize, total, onChange: (p) => setPage(p), showTotal: true }}
    />
  );
}

export default function AdminImRecords() {
  const { t } = useTranslation();
  return (
    <div className="im-page">
      <ImAdminNav />
      <div className="page-header">
        <Title size="middle" color="app-orange">
          {t('imm.records.adminTitle')}
        </Title>
      </div>
      <Card>
        <Tabs
          items={[
            { key: 'entry', label: t('imm.records.entryTab'), children: <EntryRecordsTab /> },
            { key: 'exit', label: t('imm.records.exitTab'), children: <ExitRecordsTab /> },
          ]}
        />
      </Card>
    </div>
  );
}
