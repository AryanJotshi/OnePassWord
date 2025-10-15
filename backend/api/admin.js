const express = require('express');
const router = express.Router();
const { supa } = require('../supa');

async function getAppUser(supabase_user_id) {
  const { data, error } = await supa.from('users').select('*').eq('supabase_user_id', supabase_user_id);
  if (error) throw error;
  return data && data[0];
}

// GET /api/admin/metrics - detailed analytics for superadmin
router.get('/metrics', async (req, res) => {
  try {
    const appUser = await getAppUser(req.user.sub);
    if (!appUser || appUser.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
    // time window
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch data sets
    const [{ data: users, error: uErr }, { data: vaults, error: vErr }, { data: items, error: iErr }, { data: audits, error: aErr }] = await Promise.all([
      supa.from('users').select('id, created_at, role, username'),
      supa.from('vaults').select('vault_id, user_id, created_at'),
      supa.from('password_entries').select('item_id, vault_id, date_created'),
      supa.from('audit_logs').select('timestamp, user_id, action')
    ]);
    if (uErr) throw uErr; if (vErr) throw vErr; if (iErr) throw iErr; if (aErr) throw aErr;

    function bucketByDay(rows, field, since = since30) {
      const m = new Map();
      for (const r of rows || []) {
        const d = new Date(r[field]);
        if (isNaN(d.getTime()) || d < since) continue;
        const key = d.toISOString().slice(0, 10);
        m.set(key, (m.get(key) || 0) + 1);
      }
      return Array.from(m.entries()).sort(([a], [b]) => a < b ? -1 : 1).map(([day, count]) => ({ day, count }));
    }

    // Totals
    const totals = {
      users: users?.length || 0,
      vaults: vaults?.length || 0,
      items: items?.length || 0,
      auditEvents: audits?.length || 0
    };

    // Distribution: vaults per user
    const vaultsPerUserMap = new Map();
    for (const v of vaults || []) {
      vaultsPerUserMap.set(v.user_id, (vaultsPerUserMap.get(v.user_id) || 0) + 1);
    }
    const vaultsPerUser = Array.from(vaultsPerUserMap.entries()).map(([user_id, count]) => ({ user_id, count })).sort((a, b) => b.count - a.count).slice(0, 15);

    // Items per vault (summary)
    const itemsPerVaultMap = new Map();
    for (const it of items || []) {
      itemsPerVaultMap.set(it.vault_id, (itemsPerVaultMap.get(it.vault_id) || 0) + 1);
    }
    const itemsPerVaultTop = Array.from(itemsPerVaultMap.entries()).map(([vault_id, count]) => ({ vault_id, count })).sort((a, b) => b.count - a.count).slice(0, 15);
    const itemsCounts = Array.from(itemsPerVaultMap.values());
    const itemsStats = itemsCounts.length ? {
      avg: Number((itemsCounts.reduce((a, b) => a + b, 0) / itemsCounts.length).toFixed(2)),
      max: Math.max(...itemsCounts),
      min: Math.min(...itemsCounts)
    } : { avg: 0, max: 0, min: 0 };

    // Role breakdown
    const roles = users?.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {}) || {};

    // Activity by day and by action
    const eventsPerDay = bucketByDay(audits || [], 'timestamp');
    const vaultsPerDay = bucketByDay(vaults || [], 'created_at');
    const itemsPerDay = bucketByDay(items || [], 'date_created');
    const actionsMap = new Map();
    for (const ev of audits || []) {
      const a = ev.action || 'unknown';
      actionsMap.set(a, (actionsMap.get(a) || 0) + 1);
    }
    const actions = Array.from(actionsMap.entries()).map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count);

    // Top active users by events
    const eventsByUserMap = new Map();
    for (const ev of audits || []) {
      if (!ev.user_id) continue;
      eventsByUserMap.set(ev.user_id, (eventsByUserMap.get(ev.user_id) || 0) + 1);
    }
    const topUsersByEvents = Array.from(eventsByUserMap.entries()).map(([user_id, count]) => ({ user_id, count })).sort((a, b) => b.count - a.count).slice(0, 15);

    // Recent events
    const recentEvents = (audits || [])
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 50);

    res.json({
      totals,
      roles,
      series: { vaultsPerDay, itemsPerDay, eventsPerDay },
      distributions: { vaultsPerUser, itemsPerVaultTop, itemsStats },
      actions,
      topUsersByEvents,
      recentEvents
    });
  } catch (err) {
    console.error('admin.metrics error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

module.exports = router;
