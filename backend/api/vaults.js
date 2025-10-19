const express = require('express');
const router = express.Router();
const { supa } = require('../supa');

async function getAppUser(supabase_user_id) {
  const { data, error } = await supa
    .from('users')
    .select('*')
    .eq('supabase_user_id', supabase_user_id);
  if (error) throw error;
  return data && data[0];
}

// GET /api/vaults (list)
router.get('/', async (req, res) => {
  const suid = req.user.sub;
  try {
    const appUser = await getAppUser(suid);
    if (!appUser) return res.status(401).json({ error: 'App user not found' });
    if (appUser.role === 'superadmin') {
      const { data, error } = await supa
        .from('vaults')
        .select('vault_id,user_id,vault_name,created_at,updated_at');
      if (error) throw error;
      await supa.from('audit_logs').insert([{ user_id: appUser.id, action: 'vaults_listed_admin' }]);
      return res.json(data || []);
    } else {
      const { data, error } = await supa
        .from('vaults')
        .select('vault_id,user_id,vault_name,created_at,updated_at')
        .eq('user_id', appUser.id);
      if (error) throw error;
      await supa.from('audit_logs').insert([{ user_id: appUser.id, action: 'vaults_listed' }]);
      return res.json(data || []);
    }
  } catch (err) {
    console.error('vaults.list error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// POST /api/vaults (create)
router.post('/', async (req, res) => {
  const suid = req.user.sub;
  const { vault_name, encrypted_vault_key, salt } = req.body;
  if (!vault_name || !encrypted_vault_key || !salt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const appUser = await getAppUser(suid);
    if (!appUser) return res.status(401).json({ error: 'App user not found' });
    const { data, error } = await supa
      .from('vaults')
      .insert([{ user_id: appUser.id, vault_name, encrypted_vault_key, salt }])
      .select()
      .single();
    if (error) throw error;
    await supa.from('audit_logs').insert([{ vault_id: data.vault_id, user_id: appUser.id, action: 'vault_created' }]);
    res.status(201).json(data);
  } catch (err) {
    console.error('vaults.create error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// GET /api/vaults/:vaultId (details)
router.get('/:vaultId', async (req, res) => {
  const suid = req.user.sub;
  const { vaultId } = req.params;
  try {
    const appUser = await getAppUser(suid);
    if (!appUser) return res.status(401).json({ error: 'App user not found' });
    const { data, error } = await supa.from('vaults').select('*').eq('vault_id', vaultId);
    if (error) throw error;
    const v = data && data[0];
    if (!v) return res.status(404).json({ error: 'Vault not found' });
    if (appUser.role === 'superadmin') {
      return res.json({ vault_id: v.vault_id, user_id: v.user_id, vault_name: v.vault_name, created_at: v.created_at, updated_at: v.updated_at });
    }
    if (v.user_id !== appUser.id) return res.status(403).json({ error: 'Forbidden' });
    // owner receives encrypted fields
    return res.json(v);
  } catch (err) {
    console.error('vaults.detail error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// DELETE /api/vaults/:vaultId (owner only)
router.delete('/:vaultId', async (req, res) => {
  const suid = req.user.sub;
  const { vaultId } = req.params;
  try {
    const appUser = await getAppUser(suid);
    if (!appUser) return res.status(401).json({ error: 'App user not found' });
    const { data, error } = await supa.from('vaults').select('*').eq('vault_id', vaultId);
    if (error) throw error;
    const v = data && data[0];
    if (!v) return res.status(404).json({ error: 'Vault not found' });
    if (v.user_id !== appUser.id) return res.status(403).json({ error: 'Forbidden' });
    const { error: delErr } = await supa.from('vaults').delete().eq('vault_id', vaultId);
    if (delErr) throw delErr;
    await supa.from('audit_logs').insert([{ vault_id: vaultId, user_id: appUser.id, action: 'vault_deleted' }]);
    return res.status(204).send();
  } catch (err) {
    console.error('vaults.delete error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

module.exports = router;
