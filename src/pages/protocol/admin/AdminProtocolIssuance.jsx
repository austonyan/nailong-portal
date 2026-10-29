// 邀请函与活动凭证管理:定向邀请、撤销、凭证作废与补发。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  DatePicker,
  Input,
  Modal,
  Pagination,
  Select,
  Table,
  Tag,
  Tabs,
  Title,
} from 'animal-island-ui';
import { BanIcon, PlusIcon, RefreshIcon, SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { StatusTag, TextArea, fmtDateTime, toastProtocolError } from '../shared.jsx';
import { toastSuccess } from '../shared.jsx';

const INV_STATUSES = ['valid', 'used', 'expired', 'revoked'];
const PASS_STATUSES = ['pending', 'used', 'expired', 'voided'];
const INV_TYPES = ['event', 'foreign', 'resident', 'diplomatic'];

export default function AdminProtocolIssuance() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('invitations');
  const [events, setEvents] = useState([]);

  const [invItems, setInvItems] = useState(null);
  const [invTotal, setInvTotal] = useState(0);
  const [invPage, setInvPage] = useState(1);
  const [invStatus, setInvStatus] = useState('');
  const [invType, setInvType] = useState('');
  // invQ = 输入中,invQuery = 已提交:回车或点搜索才请求,避免逐键打接口。
  const [invQ, setInvQ] = useState('');
  const [invQuery, setInvQuery] = useState('');

  const [passItems, setPassItems] = useState(null);
  const [passTotal, setPassTotal] = useState(0);
  const [passPage, setPassPage] = useState(1);
  const [passStatus, setPassStatus] = useState('');
  const [passQ, setPassQ] = useState('');
  const [passQuery, setPassQuery] = useState('');

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForm, setIssueForm] = useState({ eventId: '', inviteeUsername: '', type: 'event', validUntil: '', note: '' });
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [passTarget, setPassTarget] = useState(null);
  const [passReason, setPassReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/protocol/admin/events?pageSize=100')
      .then((data) => {
        setEvents(data.items);
        setIssueForm((p) => ({ ...p, eventId: p.eventId || (data.items[0] ? String(data.items[0].id) : '') }));
      })
      .catch(() => setEvents([]));
  }, []);

  const loadInvitations = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(invPage) });
      if (invStatus) params.set('status', invStatus);
      if (invType) params.set('type', invType);
      if (invQuery) params.set('q', invQuery);
      const data = await api.get(`/protocol/admin/invitations?${params.toString()}`);
      const rows = data.items ?? [];
      setInvItems(rows);
      setInvTotal(data.total);
      // total 变小时把页码夹回合法范围,否则停在空表且没有分页器可回去。
      if (rows.length === 0 && invPage > 1) setInvPage(Math.max(1, invPage - 1));
    } catch (err) {
      toastProtocolError(t, err);
      setInvItems([]);
    }
  }, [invPage, invStatus, invType, invQuery, t]);

  const loadPasses = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(passPage) });
      if (passStatus) params.set('status', passStatus);
      if (passQuery) params.set('q', passQuery);
      const data = await api.get(`/protocol/admin/passes?${params.toString()}`);
      const rows = data.items ?? [];
      setPassItems(rows);
      setPassTotal(data.total);
      if (rows.length === 0 && passPage > 1) setPassPage(Math.max(1, passPage - 1));
    } catch (err) {
      toastProtocolError(t, err);
      setPassItems([]);
    }
  }, [passPage, passStatus, passQuery, t]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  useEffect(() => {
    loadPasses();
  }, [loadPasses]);

  const issue = async () => {
    setBusy(true);
    try {
      await api.post('/protocol/admin/invitations', {
        eventId: Number(issueForm.eventId),
        inviteeUsername: issueForm.inviteeUsername,
        type: issueForm.type,
        validUntil: issueForm.validUntil ? new Date(`${issueForm.validUntil}T23:59:00`).toISOString() : null,
        note: issueForm.note,
      });
      toastSuccess(t('protocol.admin.invitationIssued'));
      setIssueOpen(false);
      setIssueForm((p) => ({ ...p, inviteeUsername: '', validUntil: '', note: '' }));
      await loadInvitations();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setBusy(true);
    try {
      await api.post(`/protocol/admin/invitations/${revokeTarget.id}/revoke`, { reason: revokeReason });
      toastSuccess(t('common.save'));
      setRevokeTarget(null);
      setRevokeReason('');
      await loadInvitations();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const runPassAction = async () => {
    if (!passTarget) return;
    setBusy(true);
    try {
      await api.post(`/protocol/admin/passes/${passTarget.pass.id}/${passTarget.kind}`, { reason: passReason });
      toastSuccess(t('common.save'));
      setPassTarget(null);
      setPassReason('');
      await loadPasses();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const invColumns = [
    { title: t('protocol.field.inviteNo'), dataIndex: 'inviteNo', width: 180 },
    { title: t('protocol.field.event'), dataIndex: 'eventTitle', width: 200 },
    { title: t('protocol.field.type'), dataIndex: 'typeName', width: 120 },
    { title: t('protocol.field.invitee'), width: 120, render: (_, r) => r.displayName || r.username },
    { title: t('common.status'), dataIndex: 'status', width: 90, render: (v) => <StatusTag status={v} /> },
    { title: t('protocol.field.validUntil'), dataIndex: 'validUntil', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      render: (_, row) =>
        row.status === 'valid' ? (
          <Button type="text" size="small" danger icon={<BanIcon />} onClick={() => setRevokeTarget(row)}>
            {t('protocol.action.revoke')}
          </Button>
        ) : (
          <Tag variant="soft" size="small" color={row.response === 'accepted' ? 'app-green' : row.response === 'declined' ? 'app-red' : 'warm-peach-pink'}>{t(`protocol.invitations.response_${row.response}`)}</Tag>
        ),
    },
  ];

  const passColumns = [
    { title: t('protocol.field.passNo'), dataIndex: 'passNo', width: 180 },
    { title: t('protocol.field.event'), dataIndex: 'eventTitle', width: 200 },
    { title: t('protocol.field.holderName'), dataIndex: 'holderName', width: 120 },
    { title: t('common.status'), dataIndex: 'status', width: 90, render: (v) => <StatusTag status={v} /> },
    { title: t('protocol.field.validUntil'), dataIndex: 'validUntil', width: 150, render: fmtDateTime },
    { title: t('protocol.field.checkedInAt'), dataIndex: 'checkedInAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      render: (_, row) => (
        <div className="protocol-row-actions">
          {['pending', 'used'].includes(row.status) && (
            <Button type="text" size="small" danger icon={<BanIcon />} onClick={() => setPassTarget({ kind: 'void', pass: row })}>
              {t('protocol.action.void')}
            </Button>
          )}
          {row.status !== 'voided' && (
            <Button type="text" size="small" icon={<RefreshIcon />} onClick={() => setPassTarget({ kind: 'reissue', pass: row })}>
              {t('protocol.action.reissue')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const invitationTab = (
    <div>
      <div className="protocol-filter-bar">
        <Select
          value={invStatus}
          onChange={(v) => { setInvStatus(v); setInvPage(1); }}
          options={[{ key: '', label: t('protocol.common.allStatus') }, ...INV_STATUSES.map((s) => ({ key: s, label: t(`protocol.status.${s}`) }))]}
        />
        <Select
          value={invType}
          onChange={(v) => { setInvType(v); setInvPage(1); }}
          options={[{ key: '', label: t('protocol.common.allTypes') }, ...INV_TYPES.map((s) => ({ key: s, label: t(`protocol.invType.${s}`) }))]}
        />
        <Input
          allowClear
          prefix={<SearchIcon size={14} />}
          value={invQ}
          onChange={(e) => setInvQ(e.target.value)}
          onClear={() => { setInvQ(''); setInvQuery(''); setInvPage(1); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setInvQuery(invQ.trim());
              setInvPage(1);
            }
          }}
          placeholder={t('protocol.admin.searchInvitation')}
        />
        <Button
          icon={<SearchIcon />}
          onClick={() => {
            setInvQuery(invQ.trim());
            setInvPage(1);
          }}
        >
          {t('common.search')}
        </Button>
        <Button type="primary" icon={<PlusIcon />} onClick={() => setIssueOpen(true)}>
          {t('protocol.admin.issueInvitation')}
        </Button>
      </div>
      <Card>
        <Table className="table-fit" columns={invColumns} dataSource={invItems ?? []} loading={invItems === null} rowKey="id" pagination={false} emptyText={t('protocol.common.noData')} />
        {invTotal > 0 && (
          <div className="protocol-pagination">
            <Pagination total={invTotal} current={invPage} pageSize={20} onChange={setInvPage} showTotal />
          </div>
        )}
      </Card>
    </div>
  );

  const passTab = (
    <div>
      <div className="protocol-filter-bar">
        <Select
          value={passStatus}
          onChange={(v) => { setPassStatus(v); setPassPage(1); }}
          options={[{ key: '', label: t('protocol.common.allStatus') }, ...PASS_STATUSES.map((s) => ({ key: s, label: t(`protocol.status.${s}`) }))]}
        />
        <Input
          allowClear
          prefix={<SearchIcon size={14} />}
          value={passQ}
          onChange={(e) => setPassQ(e.target.value)}
          onClear={() => { setPassQ(''); setPassQuery(''); setPassPage(1); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPassQuery(passQ.trim());
              setPassPage(1);
            }
          }}
          placeholder={t('protocol.admin.searchPass')}
        />
        <Button
          icon={<SearchIcon />}
          onClick={() => {
            setPassQuery(passQ.trim());
            setPassPage(1);
          }}
        >
          {t('common.search')}
        </Button>
      </div>
      <Card>
        <Table className="table-fit" columns={passColumns} dataSource={passItems ?? []} loading={passItems === null} rowKey="id" pagination={false} emptyText={t('protocol.common.noData')} />
        {passTotal > 0 && (
          <div className="protocol-pagination">
            <Pagination total={passTotal} current={passPage} pageSize={20} onChange={setPassPage} showTotal />
          </div>
        )}
      </Card>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('protocol.admin.issuanceTitle')}</Title>
        </h1>
        <p className="muted-text">{t('protocol.admin.issuanceSubtitle')}</p>
      </div>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'invitations', label: t('protocol.admin.invitationsTab'), children: invitationTab },
          { key: 'passes', label: t('protocol.admin.passesTab'), children: passTab },
        ]}
      />

      <Modal
        maskClosable={false}
        open={issueOpen}
        title={t('protocol.admin.issueInvitation')}
        onClose={() => setIssueOpen(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setIssueOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!issueForm.eventId || !issueForm.inviteeUsername} onClick={issue}>
              {t('protocol.action.issue')}
            </Button>
          </>
        }
      >
        <div className="protocol-modal-form">
          <label className="protocol-field">
            <span>{t('protocol.field.event')}</span>
            <Select
              value={issueForm.eventId}
              onChange={(v) => setIssueForm((p) => ({ ...p, eventId: v }))}
              options={events.map((ev) => ({ key: String(ev.id), label: `${ev.title} (${ev.eventNo})` }))}
              showSearch
            />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.invitee')}</span>
            <Input value={issueForm.inviteeUsername} onChange={(e) => setIssueForm((p) => ({ ...p, inviteeUsername: e.target.value }))} placeholder={t('protocol.admin.inviteePlaceholder')} />
          </label>
          <p className="muted-text">{t('protocol.admin.inviteeTip')}</p>
          <label className="protocol-field">
            <span>{t('protocol.field.invType')}</span>
            <Select value={issueForm.type} onChange={(v) => setIssueForm((p) => ({ ...p, type: v }))} options={INV_TYPES.map((s) => ({ key: s, label: t(`protocol.invType.${s}`) }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.validUntil')}</span>
            <DatePicker value={issueForm.validUntil} onChange={(v) => setIssueForm((p) => ({ ...p, validUntil: v || '' }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.note')}</span>
            <TextArea rows={3} value={issueForm.note} onChange={(e) => setIssueForm((p) => ({ ...p, note: e.target.value }))} />
          </label>
          <p className="muted-text">{t('protocol.admin.inviteTypeTip')}</p>
        </div>
      </Modal>

      <Modal
        open={revokeTarget !== null}
        title={t('protocol.admin.revokeTitle')}
        onClose={() => {
          if (!busy) {
            setRevokeTarget(null);
            setRevokeReason('');
          }
        }}
        maskClosable={false}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setRevokeTarget(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" danger loading={busy} disabled={busy || !revokeReason.trim()} onClick={revoke}>{t('protocol.action.revoke')}</Button>
          </>
        }
      >
        <p>{revokeTarget?.inviteNo}</p>
        <label className="protocol-field">
          <span>{t('protocol.field.reason')}</span>
          <TextArea rows={3} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} />
        </label>
      </Modal>

      <Modal
        open={passTarget !== null}
        title={passTarget?.kind === 'reissue' ? t('protocol.admin.reissueTitle') : t('protocol.admin.voidTitle')}
        onClose={() => {
          if (!busy) {
            setPassTarget(null);
            setPassReason('');
          }
        }}
        maskClosable={false}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setPassTarget(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button
              type="primary"
              danger={passTarget?.kind === 'void'}
              loading={busy}
              disabled={busy || (passTarget?.kind === 'void' && !passReason.trim())}
              onClick={runPassAction}
            >
              {passTarget?.kind === 'reissue' ? t('protocol.action.reissue') : t('protocol.action.void')}
            </Button>
          </>
        }
      >
        <p>{passTarget?.pass.passNo}</p>
        <label className="protocol-field">
          <span>{t('protocol.field.reason')}</span>
          <TextArea rows={3} value={passReason} onChange={(e) => setPassReason(e.target.value)} />
        </label>
      </Modal>
    </div>
  );
}