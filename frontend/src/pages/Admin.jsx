import { useEffect, useState } from 'react';
import { apiGet } from '../utils/api';
import { ArrowClockwise } from 'phosphor-react';
import Spinner from '../components/Spinner';
import { useToast } from '../contexts/ToastContext';

export default function Admin() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  async function loadMetrics() {
    setLoading(true);
    try {
      const m = await apiGet('/api/admin/metrics');
      if (m && m.error) { showToast(m.error, 'error'); setMetrics(null); } else { setMetrics(m); }
    } catch (e) { showToast(e?.message || String(e), 'error'); } finally { setLoading(false); }
  }

  useEffect(() => {
    loadMetrics();
    const id = setInterval(loadMetrics, 15000);
    const onVis = () => { if (document.visibilityState === 'visible') loadMetrics(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  return (
    <section className="mx-auto max-w-5xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Admin Analytics (last 30 days)</h3>
        <button
          className="icon-btn h-9 w-9"
          onClick={loadMetrics}
          disabled={loading}
          aria-label="Refresh metrics"
          title="Refresh"
        >
          {loading ? (
            <Spinner size={20} inline />
          ) : (
            <ArrowClockwise size={18} />
          )}
        </button>
      </div>
      {!metrics && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card">
              <div className="skeleton skeleton-line w-40"></div>
              <div className="mt-3 space-y-2">
                <div className="skeleton skeleton-line w-3/4"></div>
                <div className="skeleton skeleton-line w-2/3"></div>
                <div className="skeleton skeleton-line w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      )}
      {metrics && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="card">
            <h4 className="mb-1 text-base font-semibold">Totals</h4>
            <ul className="list-inside list-disc text-sm">
              <li>Users: {metrics?.totals?.users ?? 0}</li>
              <li>Vaults: {metrics?.totals?.vaults ?? 0}</li>
              <li>Items: {metrics?.totals?.items ?? 0}</li>
              <li>Audit events: {metrics?.totals?.auditEvents ?? 0}</li>
            </ul>
            <h5 className="mt-3 text-sm font-semibold">Roles</h5>
            <ul className="list-inside list-disc text-sm">
              {Object.entries(metrics?.roles || {}).map(([role, count]) => (
                <li key={role}>{role}: {count}</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h4 className="mb-1 text-base font-semibold">Events by action</h4>
            <ul className="list-inside list-disc text-sm">
              {metrics?.actions?.map(a => (
                <li key={a.action}>{a.action}: {a.count}</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h4 className="mb-1 text-base font-semibold">Vaults per day</h4>
            <ul className="list-inside list-disc text-sm">
              {metrics?.series?.vaultsPerDay?.map(x => <li key={x.day}>{x.day}: {x.count}</li>)}
            </ul>
          </div>

          <div className="card">
            <h4 className="mb-1 text-base font-semibold">Items per day</h4>
            <ul className="list-inside list-disc text-sm">
              {metrics?.series?.itemsPerDay?.map(x => <li key={x.day}>{x.day}: {x.count}</li>)}
            </ul>
          </div>

          <div className="card">
            <h4 className="mb-1 text-base font-semibold">Events per day</h4>
            <ul className="list-inside list-disc text-sm">
              {metrics?.series?.eventsPerDay?.map(x => <li key={x.day}>{x.day}: {x.count}</li>)}
            </ul>
          </div>

          <div className="card">
            <h4 className="mb-1 text-base font-semibold">Top users by vaults</h4>
            <ul className="list-inside list-disc text-sm">
              {metrics?.distributions?.vaultsPerUser?.map(x => (
                <li key={x.user_id}>user_id {x.user_id}: {x.count}</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h4 className="mb-1 text-base font-semibold">Top vaults by items</h4>
            <ul className="list-inside list-disc text-sm">
              {metrics?.distributions?.itemsPerVaultTop?.map(x => (
                <li key={x.vault_id}>vault {x.vault_id}: {x.count}</li>
              ))}
            </ul>
            <div className="mt-2 text-sm">Avg items/vault: {metrics?.distributions?.itemsStats?.avg ?? 0} (min {metrics?.distributions?.itemsStats?.min ?? 0}, max {metrics?.distributions?.itemsStats?.max ?? 0})</div>
          </div>

          <div className="card">
            <h4 className="mb-1 text-base font-semibold">Top users by events</h4>
            <ul className="list-inside list-disc text-sm">
              {metrics?.topUsersByEvents?.map(x => (
                <li key={x.user_id}>user_id {x.user_id}: {x.count}</li>
              ))}
            </ul>
          </div>

          <div className="card md:col-span-2">
            <h4 className="mb-1 text-base font-semibold">Recent events</h4>
            <ul className="list-inside list-disc text-sm">
              {metrics?.recentEvents?.map((e, idx) => (
                <li key={idx}>{new Date(e.timestamp).toLocaleString()} – user_id {e.user_id || 'n/a'} – {e.action}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
