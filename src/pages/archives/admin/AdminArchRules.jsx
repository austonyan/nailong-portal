// 归档规则配置 — 各记录类型是否纳档 + 保留说明(简繁两份)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Modal, Switch, Table, Tag, Title } from 'animal-island-ui';
import { EditIcon, SlidersIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { ArchAdminNav, OfficeTag, TextArea, fmtDateTime, toastArchError } from '../shared.jsx';
import { toastSuccess } from '../../../components/toast.js';

export default function AdminArchRules() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [included, setIncluded] = useState(true);
  const [retention, setRetention] = useState('');
  const [retentionTw, setRetentionTw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .get('/archives/admin/rules')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastArchError(err);
        setItems([]);
      });
  }, []);

  useEffect(load, [load]);

  const openEdit = (item) => {
    setEditing(item);
    setIncluded(item.included);
    // 繁中界面下 localeMiddleware 已把 retention 换成繁体,简体源在 retentionCn;
    // 直接绑 retention 会把繁体写回简体字段,所以简体输入框优先取 retentionCn。
    setRetention(item.retentionCn ?? item.retention ?? '');
    setRetentionTw(item.retentionTw ?? '');
    setError('');
  };

  const closeEdit = () => {
    if (busy) return;
    setEditing(null);
  };

  const save = async () => {
    if (retention.trim().length < 2) {
      setError(t('arch.admin.rules.retentionRequired'));
      return;
    }
    setBusy(true);
    try {
      await api.patch('/archives/admin/rules', {
        items: [
          {
            code: editing.code,
            included,
            retention: retention.trim(),
            retentionTw: retentionTw.trim(),
          },
        ],
      });
      setEditing(null);
      toastSuccess(t('common.saved'));
      load();
    } catch (err) {
      toastArchError(err);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      title: t('arch.admin.rules.type'),
      dataIndex: 'name',
      width: 190,
      render: (v, record) => (
        <div>
          <b>{v}</b>
          <div className="arch-note">{record.description}</div>
        </div>
      ),
    },
    { title: t('arch.catalog.office'), dataIndex: 'office', width: 120, render: (v) => <OfficeTag office={v} /> },
    {
      title: t('arch.admin.rules.included'),
      dataIndex: 'included',
      width: 110,
      render: (v) =>
        v ? (
          <Tag color="app-green" variant="soft">
            {t('arch.admin.rules.includedOn')}
          </Tag>
        ) : (
          <Tag color="app-red" variant="soft">
            {t('arch.admin.rules.includedOff')}
          </Tag>
        ),
    },
    { title: t('arch.admin.rules.retention'), dataIndex: 'retention', width: 240, render: (v) => v || <span className="muted-text">-</span> },
    { title: t('arch.admin.rules.updatedAt'), dataIndex: 'updatedAt', width: 150, render: (v) => fmtDateTime(v) },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 110,
      render: (_, record) => (
        <div className="table-actions">
          <Button type="default" size="small" icon={<EditIcon />} onClick={() => openEdit(record)}>
            {t('common.edit')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="arch-page">
      <ArchAdminNav />
      <div className="page-header">
        <Title size="middle" color="brown">
          <SlidersIcon size={18} /> {t('arch.admin.rules.title')}
        </Title>
      </div>

      <Card>
        <p className="arch-note arch-form-tip">{t('arch.admin.rules.tip')}</p>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="code"
          pagination={false}
          emptyText={t('common.empty')}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={editing !== null}
        title={t('arch.admin.rules.editTitle', { name: editing?.name ?? '' })}
        onClose={closeEdit}
        typewriter={false}
        footer={
          <>
            <Button disabled={busy} onClick={closeEdit}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" loading={busy} disabled={busy} onClick={save}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="arch-tag-row arch-switch-row">
          <span className="arch-field-label arch-switch-label">{t('arch.admin.rules.included')}</span>
          <Switch checked={included} onChange={setIncluded} />
        </div>
        <p className="arch-field-label">
          {t('arch.admin.rules.retention')} <Tag color="app-red" variant="soft" size="small">{t('common.required')}</Tag>
        </p>
        <TextArea value={retention} onChange={(e) => setRetention(e.target.value)} maxLength={300} />
        <p className="arch-field-label">{t('arch.admin.rules.retentionTw')}</p>
        <TextArea value={retentionTw} onChange={(e) => setRetentionTw(e.target.value)} maxLength={300} />
        {error && <p className="arch-error">{error}</p>}
      </Modal>
    </div>
  );
}