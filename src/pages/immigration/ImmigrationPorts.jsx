import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Title } from 'animal-island-ui';
import { ArrowUpRightIcon, MapIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastApiError } from '../../components/immigration/apiError.js';
import { ImNav, StatusTag } from '../../components/immigration/shared.jsx';

export default function ImmigrationPorts() {
  const { t } = useTranslation();
  const [ports, setPorts] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/immigration/ports')
      .then((data) => {
        if (!cancelled) setPorts(data.items);
      })
      .catch((err) => {
        toastApiError(err);
        if (!cancelled) setPorts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="im-page">
      <ImNav />
      <div className="page-header">
        <Title size="middle" color="app-orange">
          {t('imm.ports.title')}
        </Title>
      </div>
      <p className="muted-text">{t('imm.ports.subtitle')}</p>
      <div className="im-ports-grid">
        {(ports ?? []).map((port) => (
          <Link key={port.code} to={`/immigration/ports/${port.code}`} className="im-port-link">
            <Card hoverable className="im-port-card">
              <div className="service-card-top">
                <MapIcon size={30} />
                <ArrowUpRightIcon size={18} className="service-card-arrow" />
              </div>
              <h3 className="service-card-name">{port.name}</h3>
              <p className="muted-text">
                {port.code} · {t(`imm.portType.${port.type}`)}
              </p>
              <div className="im-status-tags">
                <StatusTag value={port.status} i18nPrefix="imm.portStatus" />
              </div>
              <p className="muted-text">{port.openHours}</p>
            </Card>
          </Link>
        ))}
        {ports !== null && ports.length === 0 && (
          <Card type="dashed">
            <p className="muted-text">{t('imm.ports.empty')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
