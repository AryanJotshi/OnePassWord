// POST /api/users/register: add user to app db linked to Supabase Auth
const express = require('express');
const router = express.Router();
const { supa } = require('../supa');

router.post('/register', async (req, res) => {
  const { supabase_user_id, username, role } = req.body;
  if (!supabase_user_id || !username || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    // SQL: SELECT id FROM users WHERE supabase_user_id = $1;
    const { data: existing, error: selErr } = await supa
      .from('users')
      .select('id')
      .eq('supabase_user_id', supabase_user_id);
    if (selErr) throw selErr;
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }
    // SQL: INSERT INTO users (supabase_user_id, username, role) VALUES ($1, LOWER($2), $3);
    const { error: insErr } = await supa
      .from('users')
      .insert([{ supabase_user_id, username: username.toLowerCase(), role }]);
    if (insErr) throw insErr;
    res.status(201).json({ status: 'created' });
  } catch (err) {
    console.error('users.register error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// GET /api/users/me - return current username/role
router.get('/me', async (req, res) => {
  try {
    const supabase_user_id = req.user.sub;
    // SQL: SELECT username, role FROM users WHERE supabase_user_id = $1 LIMIT 1;
    const { data, error } = await supa
      .from('users')
      .select('username,role')
      .eq('supabase_user_id', supabase_user_id)
      .limit(1);
    if (error) throw error;
    const user = data && data[0];
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (err) {
    const msg = err?.message || String(err);
    console.error('users.me error:', { message: msg, stack: err?.stack });
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/users/me - delete current user (auth + app rows). Cascades vaults/items via FKs
router.delete('/me', async (req, res) => {
  try {
    const supabase_user_id = req.user.sub;
    // Find app user id for auditing (optional)
    // SQL: SELECT id FROM users WHERE supabase_user_id = $1 LIMIT 1;
    const { data: users, error: selErr } = await supa
      .from('users')
      .select('id')
      .eq('supabase_user_id', supabase_user_id)
      .limit(1);
    if (selErr) throw selErr;
    const appUser = users && users[0];

    // Delete Supabase auth user (requires service key privileges)
    try {
      // No direct SQL; Supabase Auth Admin API call: deleteUser(supabase_user_id)
      await supa.auth.admin.deleteUser(supabase_user_id);
    } catch (e) {
      // If auth deletion fails (e.g., not found), continue with app cleanup
      console.warn('Supabase auth deletion warning:', e?.message || e);
    }

    // Delete from app users table; cascades will remove vaults/items
    // SQL: DELETE FROM users WHERE supabase_user_id = $1;
    const { error: delErr } = await supa
      .from('users')
      .delete()
      .eq('supabase_user_id', supabase_user_id);
    if (delErr) throw delErr;

    // Optional: write audit log with null user_id after deletion is tricky; skip
    return res.status(204).send();
  } catch (err) {
    console.error('users.delete.me error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

module.exports = router;
