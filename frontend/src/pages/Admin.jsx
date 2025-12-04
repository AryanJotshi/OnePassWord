import { useEffect, useState, useMemo } from 'react';
import { apiGet } from '../utils/api';
import { ArrowClockwise } from 'phosphor-react';
import Spinner from '../components/Spinner';
import { useToast } from '../contexts/ToastContext';
import { Line, Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  BarElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(LineElement, BarElement, ArcElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend);

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// helper: simple moving average
function sma(values, window = 7) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
    out.push(Number(avg.toFixed(2)));
  }
  return out;
}
// helper: week-over-week delta % between last point and point 7 days earlier
function wowDelta(values) {
  if (!values?.length) return null;
  const last = values[values.length - 1] ?? 0;
  const idxPrev = values.length - 8; // 7 days earlier (0-based)
  if (idxPrev < 0) return null;
  const prev = values[idxPrev] ?? 0;
  if (prev === 0) return last === 0 ? 0 : 100;
  return Number((((last - prev) / prev) * 100).toFixed(1));
}
// helper: anomaly points where deviation from SMA > threshold
function anomalyIndices(values, avg, thresholdRatio = 0.4) {
  const idxs = [];
  for (let i = 0; i < values.length; i++) {
    const base = avg[i] || 0;
    const v = values[i] || 0;
    if (base === 0) continue;
    if (Math.abs(v - base) / base > thresholdRatio) idxs.push(i);
  }
  return idxs;
}

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

  const palette = useMemo(() => ({
    blue: cssVar('--chart-blue', '#3b82f6'),
    blueFill: cssVar('--chart-blue-fill', 'rgba(59,130,246,0.25)'),
    green: cssVar('--chart-green', '#10b981'),
    greenFill: cssVar('--chart-green-fill', 'rgba(16,185,129,0.25)'),
    amber: cssVar('--chart-amber', '#f59e0b'),
    amberFill: cssVar('--chart-amber-fill', 'rgba(245,158,11,0.25)'),
    red: cssVar('--chart-red', '#ef4444'),
    violet: cssVar('--chart-violet', '#8b5cf6'),
  }), []);

  const chartOptions = useMemo(() => {
    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const tickColor = isDark ? '#e5e7eb' : '#374151';
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: tickColor } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.y ?? ctx.parsed;
              return `${ctx.dataset.label || ctx.label}: ${val}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: tickColor, maxRotation: 0, autoSkip: true }
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: tickColor, precision: 0 }
        }
      }
    };
  }, []);

  // Build per-day line datasets with SMA overlay, WoW delta badges, and anomaly point colors
  const buildLineWithSMA = (series, label, color, fillColor) => {
    const labels = series.map(x => x.day);
    const values = series.map(x => x.count);
    const avg = sma(values, 7);
    const anomalies = new Set(anomalyIndices(values, avg, 0.4));
    const pointBackgroundColors = values.map((_, i) => anomalies.has(i) ? '#ef4444' : color);
    return {
      labels,
      datasets: [
        {
          label,
          data: values,
          borderColor: color,
          backgroundColor: fillColor,
          tension: 0.25,
          pointRadius: 3,
          pointBackgroundColor: pointBackgroundColors,
          fill: true,
        },
        {
          label: `${label} (7d avg)`,
          data: avg,
          borderColor: '#9ca3af',
          backgroundColor: 'transparent',
          tension: 0.25,
          pointRadius: 0,
        }
      ]
    };
  };

  const vaultsSeries = metrics?.series?.vaultsPerDay || [];
  const itemsSeries = metrics?.series?.itemsPerDay || [];
  const eventsSeries = metrics?.series?.eventsPerDay || [];
  const usersSeries = metrics?.series?.usersPerDay || [];

  const vaultsPerDayData = useMemo(() => buildLineWithSMA(vaultsSeries, 'Vaults/day', palette.blue, palette.blueFill), [metrics, palette]);
  const itemsPerDayData = useMemo(() => buildLineWithSMA(itemsSeries, 'Items/day', palette.green, palette.greenFill), [metrics, palette]);
  const eventsPerDayData = useMemo(() => buildLineWithSMA(eventsSeries, 'Events/day', palette.amber, palette.amberFill), [metrics, palette]);
  const usersPerDayData = useMemo(() => buildLineWithSMA(usersSeries, 'Users/day', palette.violet, 'rgba(139,92,246,0.25)'), [metrics, palette]);

  const wowVaults = useMemo(() => wowDelta(vaultsSeries.map(x => x.count)), [metrics]);
  const wowItems = useMemo(() => wowDelta(itemsSeries.map(x => x.count)), [metrics]);
  const wowEvents = useMemo(() => wowDelta(eventsSeries.map(x => x.count)), [metrics]);
  const wowUsers = useMemo(() => wowDelta(usersSeries.map(x => x.count)), [metrics]);

  const itemTypesPie = useMemo(() => {
    const entries = Object.entries(metrics?.itemTypes || {});
    return { labels: entries.map(([t]) => t), datasets: [{ data: entries.map(([, c]) => c), backgroundColor: [palette.blue, palette.green, palette.amber, palette.red, palette.violet] }] };
  }, [metrics, palette]);

  const vaultsPerUserBar = useMemo(() => {
    const list = metrics?.distributions?.vaultsPerUser || [];
    return { labels: list.map(x => String(x.user_id)), datasets: [{ label: 'Vaults per user', data: list.map(x => x.count), backgroundColor: palette.blueFill }] };
  }, [metrics, palette]);

  const itemsPerVaultBar = useMemo(() => {
    const list = metrics?.distributions?.itemsPerVaultTop || [];
    return { labels: list.map(x => String(x.vault_id)), datasets: [{ label: 'Items per vault (top)', data: list.map(x => x.count), backgroundColor: palette.greenFill }] };
  }, [metrics, palette]);

  const actionsBar = useMemo(() => {
    const list = metrics?.actions || [];
    return { labels: list.map(x => x.action), datasets: [{ label: 'Events by action', data: list.map(x => x.count), backgroundColor: palette.amberFill }] };
  }, [metrics, palette]);

  // Stacked actions by day
  const actionsByDayStacked = useMemo(() => {
    const list = metrics?.actionsByDay || [];
    const days = list.map(x => x.day);
    const actionKeys = Array.from(new Set(list.flatMap(x => Object.keys(x.actionCounts || {}))));
    const colors = [palette.blue, palette.green, palette.amber, palette.red, palette.violet];
    const datasets = actionKeys.map((key, idx) => ({
      label: key,
      data: list.map(x => (x.actionCounts?.[key] || 0)),
      backgroundColor: colors[idx % colors.length]
    }));
    return { labels: days, datasets };
  }, [metrics, palette]);

  const stackedOptions = useMemo(() => ({
    ...chartOptions,
    scales: { x: { ...chartOptions.scales.x, stacked: true }, y: { ...chartOptions.scales.y, stacked: true } },
    plugins: { ...chartOptions.plugins, legend: { ...chartOptions.plugins.legend, position: 'bottom' } }
  }), [chartOptions]);

  const eventsPerRolePie = useMemo(() => {
    const list = metrics?.eventsPerRole || [];
    return { labels: list.map(x => x.role), datasets: [{ data: list.map(x => x.count), backgroundColor: [palette.blue, palette.green, palette.amber, palette.red, palette.violet] }] };
  }, [metrics, palette]);

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Admin Analytics (last 30 days)</h3>
        <button className="icon-btn h-9 w-9" onClick={loadMetrics} disabled={loading} aria-label="Refresh metrics" title="Refresh">
          {loading ? (<Spinner size={20} inline />) : (<ArrowClockwise size={18} />)}
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="card">
            <h4 className="mb-1 text-base font-semibold">Totals</h4>
            <ul className="list-inside list-disc text-sm">
              <li>Users: {metrics?.totals?.users ?? 0}</li>
              <li>Vaults: {metrics?.totals?.vaults ?? 0}</li>
              <li>Items: {metrics?.totals?.items ?? 0}</li>
              <li>Password entries: {metrics?.totals?.passwordEntries ?? 0}</li>
              <li>Audit events: {metrics?.totals?.auditEvents ?? 0}</li>
            </ul>
            <h5 className="mt-3 text-sm font-semibold">Roles</h5>
            <ul className="list-inside list-disc text-sm">
              {Object.entries(metrics?.roles || {}).map(([role, count]) => (
                <li key={role}>{role}: {count}</li>
              ))}
            </ul>
            <h5 className="mt-3 text-sm font-semibold">Item types</h5>
            <div aria-label="Item types pie chart" className="h-56">
              <Pie data={itemTypesPie} options={chartOptions} />
            </div>
            <h5 className="mt-3 text-sm font-semibold">Password entry fields</h5>
            <ul className="list-inside list-disc text-sm">
              <li>With website: {metrics?.passwordEntryFieldStats?.withWebsite ?? 0}</li>
              <li>With username: {metrics?.passwordEntryFieldStats?.withUsername ?? 0}</li>
              <li>With password cipher: {metrics?.passwordEntryFieldStats?.withPasswordCipher ?? 0}</li>
            </ul>
          </div>

          <div className="card">
            <h4 className="mb-1 text-base font-semibold">Events by action</h4>
            <div aria-label="Events by action bar chart" className="h-56">
              <Bar data={actionsBar} options={chartOptions} />
            </div>
          </div>

          <div className="card">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-base font-semibold">Vaults per day</h4>
              {wowVaults != null && (
                <span className={`rounded px-2 py-0.5 text-xs ${wowVaults >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>{wowVaults >= 0 ? '+' : ''}{wowVaults}% WoW</span>
              )}
            </div>
            <div aria-label="Vaults per day line chart" className="h-56">
              <Line data={vaultsPerDayData} options={chartOptions} />
            </div>
          </div>

          <div className="card">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-base font-semibold">Items per day</h4>
              {wowItems != null && (
                <span className={`rounded px-2 py-0.5 text-xs ${wowItems >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>{wowItems >= 0 ? '+' : ''}{wowItems}% WoW</span>
              )}
            </div>
            <div aria-label="Items per day line chart" className="h-56">
              <Line data={itemsPerDayData} options={chartOptions} />
            </div>
          </div>

          <div className="card">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-base font-semibold">Events per day</h4>
              {wowEvents != null && (
                <span className={`rounded px-2 py-0.5 text-xs ${wowEvents >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>{wowEvents >= 0 ? '+' : ''}{wowEvents}% WoW</span>
              )}
            </div>
            <div aria-label="Events per day line chart" className="h-56">
              <Line data={eventsPerDayData} options={chartOptions} />
            </div>
          </div>

          <div className="card">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-base font-semibold">Users per day</h4>
              {wowUsers != null && (
                <span className={`rounded px-2 py-0.5 text-xs ${wowUsers >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>{wowUsers >= 0 ? '+' : ''}{wowUsers}% WoW</span>
              )}
            </div>
            <div aria-label="Users per day line chart" className="h-56">
              <Line data={usersPerDayData} options={chartOptions} />
            </div>
          </div>

          <div className="card">
            <h4 className="mb-1 text-base font-semibold">Actions by day (stacked)</h4>
            <div aria-label="Actions by day stacked bar chart" className="h-56">
              <Bar data={actionsByDayStacked} options={stackedOptions} />
            </div>
          </div>

          <div className="card">
            <h4 className="mb-1 text-base font-semibold">Events by role</h4>
            <div aria-label="Events by role pie chart" className="h-56">
              <Pie data={eventsPerRolePie} options={chartOptions} />
            </div>
          </div>

          <div className="card md:col-span-2 xl:col-span-3">
            <h4 className="mb-1 text-base font-semibold">Recent events</h4>
            {metrics?.recentEvents?.length ? (
              <ul className="list-inside list-disc text-sm">
                {metrics?.recentEvents?.map((e, idx) => (
                  <li key={idx}>{new Date(e.timestamp).toLocaleString()} – user_id {e.user_id || 'n/a'} – {e.action}</li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-slate-500 dark:text-neutral-400">No recent events.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
