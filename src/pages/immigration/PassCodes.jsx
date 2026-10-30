import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Modal, Table, Title } from 'animal-island-ui';
import { ClockIcon, DownloadIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastApiError } from '../../components/immigration/apiError.js';
import { ImNav, PassQr, StatusTag, downloadDataUrl } from '../../components/immigration/shared.jsx';
import { fmtDateTime } from '../../lib/date.js';

function PassCodeModal({ passCode, onClose }) {
  const { t } = useTranslation();
  const canvasHostRef = useRef(null);

  useEffect(() => {
    if (!passCode) return undefined;
    // Capture the rendered canvas element so the PNG download works.
    const timer = setTimeout(() => {
      const canvas = canvasHostRef.current?.querySelector('canvas');
      if (canvas) canvasHostRef.current.canvasEl = canvas;
    }, 300);
    return () => clearTimeout(timer);
  }, [passCode]);

  if (!passCode) return null;
  const usable = passCode.status === 'unused';
  const verifyUrl = `${window.location.origin}${passCode.verifyPath}`;

  const download = () => {
    const canvas = canvasHostRef.current?.canvasEl;
    if (!canvas) return;
    downloadDataUrl(canvas.toDataURL('image/png'), `pass-${passCode.codeNo}.png`);
  };

  return (
    <Modal
      maskClosable={false}
      open
      title={t('imm.pass.detailTitle')}
      onClose={onClose}
      footer={
        <>
          <Button icon={<DownloadIcon />} onClick={download} disabled={!usable}>
            {t('imm.pass.download')}
          </Button>
          <Button type="primary" onClick={onClose}>{t('common.confirm')}</Button>
        </>
      }
      width={480}
      typewriter={false}
    >
      <div className="im-pass-modal">
        <div ref={canvasHostRef} className={`im-pass-qr-wrap${usable ? '' : ' im-pass-qr-disabled'}`}>
          <PassQr value={verifyUrl} />
        </div>
        {!usable && <StatusTag value={passCode.status} />}
        <div className="im-pass-meta">
          <p><b>{passCode.codeNo}</b></p>
          <p>{t('imm.mydecl.no')}: {passCode.declarationNo}</p>
          <p>{t('imm.declare.port')}: {passCode.portName} ({passCode.portCode})</p>
          <p>
            <ClockIcon size={14} /> {t('imm.pass.validUntil')}: {fmtDateTime(passCode.validUntil)}
          </p>
          <p>{t('imm.pass.status')}: <StatusTag value={passCode.status} /></p>
        </div>
        <p className="muted-text">{t('imm.pass.qrTip')}</p>
      </div>
    </Modal>
  );
}

export default function PassCodes() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [openCode, setOpenCode] = useState(null);

  useEffect(() => {
    api
      .get('/immigration/pass-codes')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastApiError(err);
        setItems([]);
      });
  }, []);

  const openDetail = async (record) => {
    try {
      const data = await api.get(`/immigration/pass-codes/${record.id}`);
      setOpenCode(data.passCode);
    } catch (err) {
      toastApiError(err);
    }
  };

  const columns = [
    { title: t('imm.pass.codeNo'), dataIndex: 'codeNo', width: 190 },
    { title: t('imm.mydecl.no'), dataIndex: 'declarationNo', width: 190 },
    { title: t('imm.declare.port'), dataIndex: 'portName', width: 130 },
    { title: t('common.status'), dataIndex: 'status', width: 100, render: (v) => <StatusTag value={v} /> },
    { title: t('imm.pass.validUntil'), dataIndex: 'validUntil', width: 160, render: (v) => fmtDateTime(v) },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 140,
      render: (_, record) => (
        <Button type="default" size="small" onClick={() => openDetail(record)}>
          {t('imm.pass.view')}
        </Button>
      ),
    },
  ];

  return (
    <div className="im-page">
      <ImNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-blue">
            {t('imm.pass.title')}
          </Title>
        </h1>
      </div>
      <Card>
        <Table className="table-fit" columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={{ defaultPageSize: 10, showTotal: true }} emptyText={t('imm.pass.empty')} />
      </Card>
      {openCode && <PassCodeModal passCode={openCode} onClose={() => setOpenCode(null)} />}
    </div>
  );
}
