const express = require('express');
const router = express.Router({ mergeParams: true });
const { supa } = require('../supa');

async function getAppUser(supabase_user_id) {
  const { data, error } = await supa.from('users').select('*').eq('supabase_user_id', supabase_user_id);
  if (error) throw error;
  return data && data[0];
}
async function getVault(vault_id) {
  const { data, error } = await supa.from('vaults').select('*').eq('vault_id', vault_id);
  if (error) throw error;
  return data && data[0];
}

// GET /api/vaults/:vaultId/items
router.get('/', async (req, res) => {
  const suid = req.user.sub;
  const { vaultId } = req.params;
  try {
    const appUser = await getAppUser(suid);
    if (!appUser) return res.status(401).json({ error: 'App user not found' });
    const vault = await getVault(vaultId);
    if (!vault) return res.status(404).json({ error: 'Vault not found' });
    if (appUser.role === 'superadmin') {
      const { data, error } = await supa
        .from('password_entries')
        .select('item_id,vault_id,item_type,date_created,date_modified')
        .eq('vault_id', vaultId);
      if (error) throw error;
      await supa.from('audit_logs').insert([{ vault_id: vaultId, user_id: appUser.id, action: 'items_listed_admin' }]);
      return res.json(data || []);
    }
    if (vault.user_id !== appUser.id) return res.status(403).json({ error: 'Forbidden' });
    const { data, error } = await supa
      .from('password_entries')
      .select('item_id,vault_id,item_type,encrypted_label,encrypted_website,encrypted_username,encrypted_password,nonce,tag,date_created,date_modified')
      .eq('vault_id', vaultId);
    if (error) throw error;
    await supa.from('audit_logs').insert([{ vault_id: vaultId, user_id: appUser.id, action: 'items_listed' }]);
    res.json(data || []);
  } catch (err) {
    console.error('items.list error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// POST /api/vaults/:vaultId/items
router.post('/', async (req, res) => {
  const suid = req.user.sub;
  const { vaultId } = req.params;
  const { item_type, encrypted_label, encrypted_website, encrypted_username, encrypted_password, nonce, tag } = req.body;
  try {
    const appUser = await getAppUser(suid);
    if (!appUser) return res.status(401).json({ error: 'App user not found' });
    const vault = await getVault(vaultId);
    if (!vault) return res.status(404).json({ error: 'Vault not found' });
    if (vault.user_id !== appUser.id) return res.status(403).json({ error: 'Forbidden' });
    if (!item_type || !encrypted_label || !encrypted_password || !nonce || !tag) {
      return res.status(400).json({ error: 'Missing required encrypted fields' });
    }
    const { data, error } = await supa
      .from('password_entries')
      .insert([{ vault_id: vaultId, item_type, encrypted_label, encrypted_website, encrypted_username, encrypted_password, nonce, tag }])
      .select()
      .single();
    if (error) throw error;
    await supa.from('audit_logs').insert([{ vault_id: vaultId, user_id: appUser.id, item_id: data.item_id, action: 'item_created' }]);
    res.status(201).json(data);
  } catch (err) {
    console.error('items.create error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// DELETE /api/vaults/:vaultId/items/:itemId
router.delete('/:itemId', async (req, res) => {
  const suid = req.user.sub;
  const { vaultId, itemId } = req.params;
  try {
    const appUser = await getAppUser(suid);
    if (!appUser) return res.status(401).json({ error: 'App user not found' });
    const vault = await getVault(vaultId);
    if (!vault) return res.status(404).json({ error: 'Vault not found' });
    if (vault.user_id !== appUser.id) return res.status(403).json({ error: 'Forbidden' });
    const { error: delErr } = await supa
      .from('password_entries')
      .delete()
      .eq('item_id', itemId)
      .eq('vault_id', vaultId);
    if (delErr) throw delErr;
    await supa.from('audit_logs').insert([{ vault_id: vaultId, user_id: appUser.id, item_id: itemId, action: 'item_deleted' }]);
    return res.status(204).send();
  } catch (err) {
    console.error('items.delete error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

module.exports = router;

// PATCH /api/vaults/:vaultId/items/:itemId
router.patch('/:itemId', async (req, res) => {
  const suid = req.user.sub;
  const { vaultId, itemId } = req.params;
  const { encrypted_label, encrypted_website, encrypted_username, encrypted_password, nonce, tag, item_type } = req.body || {};
  try {
    const appUser = await getAppUser(suid);
    if (!appUser) return res.status(401).json({ error: 'App user not found' });
    const vault = await getVault(vaultId);
    if (!vault) return res.status(404).json({ error: 'Vault not found' });
    if (vault.user_id !== appUser.id && appUser.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });

    const update = { date_modified: new Date().toISOString() };
    if (typeof encrypted_label !== 'undefined') update.encrypted_label = encrypted_label;
    if (typeof encrypted_website !== 'undefined') update.encrypted_website = encrypted_website;
    if (typeof encrypted_username !== 'undefined') update.encrypted_username = encrypted_username;
    if (typeof encrypted_password !== 'undefined') update.encrypted_password = encrypted_password;
    if (typeof nonce !== 'undefined') update.nonce = nonce;
    if (typeof tag !== 'undefined') update.tag = tag;
    if (typeof item_type !== 'undefined') update.item_type = item_type;

    if (Object.keys(update).length === 1) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supa
      .from('password_entries')
      .update(update)
      .eq('item_id', itemId)
      .eq('vault_id', vaultId)
      .select()
      .single();
    if (error) throw error;
    await supa.from('audit_logs').insert([{ vault_id: vaultId, user_id: appUser.id, item_id: itemId, action: 'item_updated' }]);
    res.json(data);
  } catch (err) {
    console.error('items.update error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});
