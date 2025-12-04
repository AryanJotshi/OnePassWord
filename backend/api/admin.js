const express = require('express');
const router = express.Router();
const { supa } = require('../supa');

async function getAppUser(supabase_user_id) {
  // SQL: SELECT * FROM users WHERE supabase_user_id = $1;
  const { data, error } = await supa.from('users').select('*').eq('supabase_user_id', supabase_user_id);
  if (error) throw error;
  return data && data[0];
}

// GET /api/admin/metrics - detailed analytics for superadmin
router.get('/metrics', async (req, res) => {
  try {
    const appUser = await getAppUser(req.user.sub);
    if (!appUser || appUser.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });

    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch core tables
    // SQL: SELECT id, created_at, role, username FROM users;
    // SQL: SELECT vault_id, user_id, created_at FROM vaults;
    // SQL: SELECT item_id, vault_id, item_type, date_created FROM items;
    // SQL: SELECT timestamp, user_id, action FROM audit_logs;
    // SQL: SELECT item_id, encrypted_website, encrypted_username, encrypted_password FROM password_entries;
    const [usersResp, vaultsResp, itemsResp, auditsResp, peResp] = await Promise.all([
      supa.from('users').select('id, created_at, role, username'),
      supa.from('vaults').select('vault_id, user_id, created_at'),
      supa.from('items').select('item_id, vault_id, item_type, date_created'),
      supa.from('audit_logs').select('timestamp, user_id, action'),
      supa.from('password_entries').select('item_id, encrypted_website, encrypted_username, encrypted_password')
    ]);
    if (usersResp.error) throw usersResp.error;
    if (vaultsResp.error) throw vaultsResp.error;
    if (itemsResp.error) throw itemsResp.error;
    if (auditsResp.error) throw auditsResp.error;
    if (peResp.error) throw peResp.error;

    const users = usersResp.data || [];
    const vaults = vaultsResp.data || [];
    const items = itemsResp.data || [];
    const audits = auditsResp.data || [];
    const passwordEntries = peResp.data || [];

    const peMap = new Map();
    for (const p of passwordEntries) peMap.set(p.item_id, p);

    function bucketByDay(rows, field, since = since30) {
      const m = new Map();
      for (const r of rows) {
        const d = new Date(r[field]);
        if (isNaN(d.getTime()) || d < since) continue;
        const key = d.toISOString().slice(0, 10);
        m.set(key, (m.get(key) || 0) + 1);
      }
      return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count }));
    }

  // Totals
    const totals = {
      users: users.length,
      vaults: vaults.length,
      items: items.length,
      passwordEntries: passwordEntries.length,
      auditEvents: audits.length
    };

    // Role breakdown
    const roles = users.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {});

    // Items type breakdown
    const itemTypeCounts = items.reduce((acc, it) => { acc[it.item_type] = (acc[it.item_type] || 0) + 1; return acc; }, {});

    // Items per vault
    const itemsPerVaultMap = new Map();
    for (const it of items) itemsPerVaultMap.set(it.vault_id, (itemsPerVaultMap.get(it.vault_id) || 0) + 1);
    const itemsPerVaultTop = Array.from(itemsPerVaultMap.entries()).map(([vault_id, count]) => ({ vault_id, count })).sort((a, b) => b.count - a.count).slice(0, 15);
    const itemsCounts = Array.from(itemsPerVaultMap.values());
    const itemsStats = itemsCounts.length ? {
      avg: Number((itemsCounts.reduce((a, b) => a + b, 0) / itemsCounts.length).toFixed(2)),
      max: Math.max(...itemsCounts),
      min: Math.min(...itemsCounts)
    } : { avg: 0, max: 0, min: 0 };

    // Vaults per user
    const vaultsPerUserMap = new Map();
    for (const v of vaults) vaultsPerUserMap.set(v.user_id, (vaultsPerUserMap.get(v.user_id) || 0) + 1);
    const vaultsPerUser = Array.from(vaultsPerUserMap.entries()).map(([user_id, count]) => ({ user_id, count })).sort((a, b) => b.count - a.count).slice(0, 15);

    // Password entry field presence stats
    let withWebsite = 0, withUsername = 0, withPasswordCipher = 0;
    for (const p of passwordEntries) {
      if (p.encrypted_website) withWebsite++;
      if (p.encrypted_username) withUsername++;
      if (p.encrypted_password) withPasswordCipher++;
    }
    const passwordEntryFieldStats = { withWebsite, withUsername, withPasswordCipher };

  // Activity series
    const vaultsPerDay = bucketByDay(vaults, 'created_at');
    const itemsPerDay = bucketByDay(items, 'date_created');
    const eventsPerDay = bucketByDay(audits, 'timestamp');

  // Additional series: users registered per day
  const usersPerDay = bucketByDay(users, 'created_at');

    // Actions breakdown
    const actionsMap = new Map();
    for (const ev of audits) actionsMap.set(ev.action || 'unknown', (actionsMap.get(ev.action || 'unknown') || 0) + 1);
    const actions = Array.from(actionsMap.entries()).map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count);

    // Stacked actions by day: { day, actionCounts: {create: n, update: m, ...} }
    const actionsByDayMap = new Map();
    for (const ev of audits) {
      const d = new Date(ev.timestamp);
      if (isNaN(d.getTime()) || d < since30) continue;
      const day = d.toISOString().slice(0, 10);
      const key = ev.action || 'unknown';
      const row = actionsByDayMap.get(day) || {};
      row[key] = (row[key] || 0) + 1;
      actionsByDayMap.set(day, row);
    }
    const actionsByDay = Array.from(actionsByDayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, actionCounts]) => ({ day, actionCounts }));

    // Top active users by events
    const eventsByUserMap = new Map();
    for (const ev of audits) { if (ev.user_id) eventsByUserMap.set(ev.user_id, (eventsByUserMap.get(ev.user_id) || 0) + 1); }
    const topUsersByEvents = Array.from(eventsByUserMap.entries()).map(([user_id, count]) => ({ user_id, count })).sort((a, b) => b.count - a.count).slice(0, 15);

    // Events per role (using users table to map user_id -> role)
    const userRoleMap = new Map();
    for (const u of users) userRoleMap.set(u.id, u.role);
    const eventsPerRoleMap = new Map();
    for (const ev of audits) {
      const role = userRoleMap.get(ev.user_id) || 'unknown';
      eventsPerRoleMap.set(role, (eventsPerRoleMap.get(role) || 0) + 1);
    }
    const eventsPerRole = Array.from(eventsPerRoleMap.entries()).map(([role, count]) => ({ role, count }));

    // Recent events
    const recentEvents = audits.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 50);

    res.json({
      totals,
      roles,
      itemTypes: itemTypeCounts,
      series: { vaultsPerDay, itemsPerDay, eventsPerDay, usersPerDay },
      distributions: { vaultsPerUser, itemsPerVaultTop, itemsStats },
      passwordEntryFieldStats,
      actions,
      actionsByDay,
      eventsPerRole,
      topUsersByEvents,
      recentEvents
    });
  } catch (err) {
    console.error('admin.metrics error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

module.exports = router;
