const express = require('express');
const router = express.Router();
const { supa } = require('../supa');

async function getAppUser(supabase_user_id) {
  // SQL: SELECT * FROM users WHERE supabase_user_id = $1;
  const { data, error } = await supa.from('users').select('*').eq('supabase_user_id', supabase_user_id);
  if (error) throw error;
  return data && data[0];
}

// GET /api/audit
router.get('/', async (req, res) => {
  const suid = req.user.sub;
  try {
    const appUser = await getAppUser(suid);
    if (!appUser) return res.status(401).json({ error: 'App user not found' });
    if (appUser.role === 'superadmin') {
      // SQL: SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500;
      const { data, error } = await supa
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(500);
      if (error) throw error;
      return res.json(data || []);
    } else {
      // SQL: SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 200;
      const { data, error } = await supa
        .from('audit_logs')
        .select('*')
        .eq('user_id', appUser.id)
        .order('timestamp', { ascending: false })
        .limit(200);
      if (error) throw error;
      return res.json(data || []);
    }
  } catch (err) {
    console.error('audit.list error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// POST /api/audit
router.post('/', async (req, res) => {
  const suid = req.user.sub;
  const { action, vault_id, item_id } = req.body;
  if (!action) return res.status(400).json({ error: 'Missing action' });
  try {
    const appUser = await getAppUser(suid);
    if (!appUser) return res.status(401).json({ error: 'App user not found' });
    // SQL: INSERT INTO audit_logs (vault_id, user_id, item_id, action) VALUES ($1, $2, $3, $4) RETURNING *;
    const { data, error } = await supa
      .from('audit_logs')
      .insert([{ vault_id: vault_id || null, user_id: appUser.id, item_id: item_id || null, action }])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('audit.create error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

module.exports = router;
