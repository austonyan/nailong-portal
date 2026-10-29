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
  const [invalidTarget, setInvalidTarget] = useState(null);
  const [entryDate, setEntryDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const pageSize = 10;

  const load = useCallback(() => {
    return api
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

  const closeEdit = () => {
    if (busy) return;
    setEditing(null);
  };

  const saveEdit = async () => {
    if (busy) return; // 双击会写两次更正并留两条审计
    setBusy(true);
    try {
      await api.patch(`/immigration/admin/records/entry/${editing.id}`, { entryDate, note });
      setEditing(null);
      toastSuccess(t('common.save'));
      await load();
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  // 把法律状态改成无效不可撤销:先确认,再执行,执行期间禁用按钮。
  const confirmInvalid = async () => {
    if (!invalidTarget || busy) return;
    setBusy(true);
    try {
      await api.post(`/immigration/admin/records/entry/${invalidTarget.id}/mark`, { status: 'invalid' });
      setInvalidTarget(null);
      toastSuccess(t('common.saved'));
      await load();
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
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
            <Button type="default" size="small" danger icon={<AlertTriangleIcon />} onClick={() => setInvalidTarget(record)}>
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
        maskClosable={false}
        open={editing !== null}
        title={t('imm.records.correctTitle', { no: editing?.no })}
        onClose={closeEdit}
        typewriter={false}
        footer={
          <>
            <Button onClick={closeEdit} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={busy} onClick={saveEdit}>{t('common.save')}</Button>
          </>
        }
      >
        <p className="muted-text">{t('imm.records.correctTip')}</p>
        <p className="im-field-label">{t('imm.records.entryDate')}</p>
        <Input size="large" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} placeholder="YYYY-MM-DD" />
        <p className="im-field-label">{t('imm.admin.review.opinion')}</p>
        <Input size="large" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </Modal>

      <Modal
        maskClosable={false}
        open={invalidTarget !== null}
        title={t('imm.records.markInvalidTitle')}
        onClose={() => {
          if (busy) return;
          setInvalidTarget(null);
        }}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setInvalidTarget(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" danger loading={busy} disabled={busy} onClick={confirmInvalid}>
              {t('imm.records.markInvalid')}
            </Button>
          </>
        }
      >
        {invalidTarget ? t('imm.records.markInvalidConfirm', { no: invalidTarget.no }) : ''}
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
        <h1 className="page-title">
          <Title size="middle" color="app-orange">
            {t('imm.records.adminTitle')}
          </Title>
        </h1>
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
