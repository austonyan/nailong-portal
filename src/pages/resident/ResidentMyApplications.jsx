// 我的登记申请:列表、状态追踪与入口。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Title } from 'animal-island-ui';
import { api } from '../../api/client.js';
import { APPLICATION_STATUS_COLORS, StatusTag, fmtDateTime, toastResError } from './shared.jsx';

// Card 只是带 onClick 的 div:补 role/tabIndex 后由这里接住 Enter/Space。
function cardKeyDown(handler) {
  return (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler();
    }
  };
}

export default function ResidentMyApplications() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/resident/applications');
      setItems(data.items);
    } catch (err) {
      toastResError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  if (items === null) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  return (
    <div className="res-my-apps">
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-green">
            {t('res.myApps.title')}
          </Title>
        </h1>
        <Button type="primary" onClick={() => navigate('/resident/apply')}>
          {t('res.myApps.new')}
        </Button>
      </div>

      {items.length === 0 ? (
        <Card type="dashed">
          <p className="muted-text">{t('res.myApps.empty')}</p>
        </Card>
      ) : (
        <div className="res-app-list">
          {items.map((app) => (
            <Card
              key={app.id}
              className="res-app-item"
              hoverable
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/resident/applications/${app.id}`)}
              onKeyDown={cardKeyDown(() => navigate(`/resident/applications/${app.id}`))}
            >
              <div className="res-app-item-main">
                <b className="res-app-no">{app.appNo}</b>
                <span className="muted-text">{app.typeName || t('common.unknown')}</span>
                <span className="muted-text">{fmtDateTime(app.submittedAt || app.createdAt)}</span>
              </div>
              <div className="res-app-item-side">
                <StatusTag value={app.status} map={APPLICATION_STATUS_COLORS} i18nPrefix="res.appStatus" />
                {app.card && app.status === 'approved' && (
                  <span className="muted-text">{t('res.myApps.cardNo', { no: app.card.cardNo })}</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
