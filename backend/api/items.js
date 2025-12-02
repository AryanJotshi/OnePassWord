const express = require('express');
const router = express.Router({ mergeParams: true });
const { supa } = require('../supa');

// Helper lookups
async function getAppUser(supabase_user_id) {
  // SQL: SELECT * FROM users WHERE supabase_user_id = $1;
  const { data, error } = await supa.from('users').select('*').eq('supabase_user_id', supabase_user_id);
  if (error) throw error;
  return data && data[0];
}
async function getVault(vault_id) {
  // SQL: SELECT * FROM vaults WHERE vault_id = $1;
  const { data, error } = await supa.from('vaults').select('*').eq('vault_id', vault_id);
  if (error) throw error;
  return data && data[0];
}

// Flatten joined item + password_entries row
function flattenJoined(row) {
  const pe = Array.isArray(row.password_entries) ? row.password_entries[0] : row.password_entries;
  return {
    item_id: row.item_id,
    vault_id: row.vault_id,
    item_type: row.item_type,
    encrypted_label: row.encrypted_label || null,
    encrypted_website: pe ? pe.encrypted_website : null,
    encrypted_username: pe ? pe.encrypted_username : null,
    encrypted_password: pe ? pe.encrypted_password : null,
    nonce: pe ? pe.nonce : null,
    tag: pe ? pe.tag : null,
    date_created: row.date_created,
    date_modified: row.date_modified
  };
}

// GET /api/vaults/:vaultId/items (normalized: items + password_entries) - now using two-step fetch to avoid nested column alias issues
router.get('/', async (req, res) => {
  const suid = req.user.sub;
  const { vaultId } = req.params;
  try {
    const appUser = await getAppUser(suid);
    if (!appUser) return res.status(401).json({ error: 'App user not found' });
    const vault = await getVault(vaultId);
    if (!vault) return res.status(404).json({ error: 'Vault not found' });

    if (appUser.role === 'superadmin') {
      // Admin view: only structural metadata of items (no encrypted fields)
      // SQL: SELECT item_id, vault_id, item_type, date_created, date_modified FROM items WHERE vault_id = $1;
      const { data, error } = await supa
        .from('items')
        .select('item_id,vault_id,item_type,date_created,date_modified')
        .eq('vault_id', vaultId);
      if (error) throw error;
      // SQL: INSERT INTO audit_logs (vault_id, user_id, action) VALUES ($1, $2, 'items_listed_admin');
      await supa.from('audit_logs').insert([{ vault_id: vaultId, user_id: appUser.id, action: 'items_listed_admin' }]);
      return res.json((data || []).map(r => ({ ...r }))); // keep same shape
    }

    if (vault.user_id !== appUser.id) return res.status(403).json({ error: 'Forbidden' });
    // Join items -> password_entries via FK (expects relationship defined in Supabase)
    // Fetch items first
    // SQL: SELECT item_id, vault_id, item_type, encrypted_label, date_created, date_modified FROM items WHERE vault_id = $1;
    const { data: itemsData, error: itemsErr } = await supa
      .from('items')
      .select('item_id,vault_id,item_type,encrypted_label,date_created,date_modified')
      .eq('vault_id', vaultId);
    if (itemsErr) throw itemsErr;
    const ids = (itemsData || []).map(r => r.item_id);
    let peMap = {};
    if (ids.length) {
      // SQL: SELECT item_id, encrypted_website, encrypted_username, encrypted_password, nonce, tag FROM password_entries WHERE item_id IN ($1, ...);
      const { data: peData, error: peErr } = await supa
        .from('password_entries')
        .select('item_id,encrypted_website,encrypted_username,encrypted_password,nonce,tag')
        .in('item_id', ids);
      if (peErr) throw peErr;
      for (const row of peData || []) peMap[row.item_id] = row;
    }
    const flattened = (itemsData || []).map(row => flattenJoined({ ...row, password_entries: peMap[row.item_id] || null }));
    // SQL: INSERT INTO audit_logs (vault_id, user_id, action) VALUES ($1, $2, 'items_listed');
    await supa.from('audit_logs').insert([{ vault_id: vaultId, user_id: appUser.id, action: 'items_listed' }]);
    res.json(flattened);
  } catch (err) {
    console.error('items.list error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// POST /api/vaults/:vaultId/items (create item + password_entries row)
router.post('/', async (req, res) => {
  const suid = req.user.sub;
  const { vaultId } = req.params;
  let { item_type, encrypted_label, encrypted_website, encrypted_username, encrypted_password, nonce, tag } = req.body || {};
  try {
    const appUser = await getAppUser(suid);
    if (!appUser) return res.status(401).json({ error: 'App user not found' });
    const vault = await getVault(vaultId);
    if (!vault) return res.status(404).json({ error: 'Vault not found' });
    if (vault.user_id !== appUser.id) return res.status(403).json({ error: 'Forbidden' });

    if (!item_type || !encrypted_label || !encrypted_password || !nonce || !tag) {
      return res.status(400).json({ error: 'Missing required encrypted fields' });
    }

    // Map legacy frontend item_type 'website' to schema 'password'
    if (item_type === 'website') item_type = 'password';

    // Step 1: create item with encrypted_label in items table
    // SQL: INSERT INTO items (vault_id, item_type, encrypted_label) VALUES ($1, $2, $3) RETURNING *;
    const { data: itemRow, error: itemErr } = await supa
      .from('items')
      .insert([{ vault_id: vaultId, item_type, encrypted_label }])
      .select()
      .single();
    if (itemErr) throw itemErr;

    // Step 2: add password entry referencing item
    // SQL: INSERT INTO password_entries (item_id, encrypted_website, encrypted_username, encrypted_password, nonce, tag) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
    const { data: peRow, error: peErr } = await supa
      .from('password_entries')
      .insert([{ item_id: itemRow.item_id, encrypted_website, encrypted_username, encrypted_password, nonce, tag }])
      .select()
      .single();
    if (peErr) {
      // Attempt rollback of created item if password entry fails
      // SQL: DELETE FROM items WHERE item_id = $1;
      await supa.from('items').delete().eq('item_id', itemRow.item_id);
      throw peErr;
    }

    const response = flattenJoined({ ...itemRow, password_entries: peRow });
    // SQL: INSERT INTO audit_logs (vault_id, user_id, item_id, action) VALUES ($1, $2, $3, 'item_created');
    await supa.from('audit_logs').insert([{ vault_id: vaultId, user_id: appUser.id, item_id: itemRow.item_id, action: 'item_created' }]);
    res.status(201).json(response);
  } catch (err) {
    console.error('items.create error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// PATCH /api/vaults/:vaultId/items/:itemId (update across items/password_entries)
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

    const itemUpdates = {};
    if (typeof item_type !== 'undefined') itemUpdates.item_type = item_type;
    if (Object.keys(itemUpdates).length) {
      // SQL: UPDATE items SET item_type = COALESCE($1, item_type), encrypted_label = COALESCE($2, encrypted_label) WHERE item_id = $3 AND vault_id = $4;
      const { error: iuErr } = await supa.from('items').update(itemUpdates).eq('item_id', itemId).eq('vault_id', vaultId);
      if (iuErr) throw iuErr;
    }

    const peUpdates = {};
    // encrypted_label now lives in items table, not password_entries
    if (typeof encrypted_label !== 'undefined') itemUpdates.encrypted_label = encrypted_label;
    if (typeof encrypted_website !== 'undefined') peUpdates.encrypted_website = encrypted_website;
    if (typeof encrypted_username !== 'undefined') peUpdates.encrypted_username = encrypted_username;
    if (typeof encrypted_password !== 'undefined') peUpdates.encrypted_password = encrypted_password;
    if (typeof nonce !== 'undefined') peUpdates.nonce = nonce;
    if (typeof tag !== 'undefined') peUpdates.tag = tag;

    if (!Object.keys(itemUpdates).length && !Object.keys(peUpdates).length) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    if (Object.keys(peUpdates).length) {
      // SQL: UPDATE password_entries SET encrypted_website = COALESCE($1, encrypted_website), encrypted_username = COALESCE($2, encrypted_username), encrypted_password = COALESCE($3, encrypted_password), nonce = COALESCE($4, nonce), tag = COALESCE($5, tag) WHERE item_id = $6;
      const { error: peUpdErr } = await supa.from('password_entries').update(peUpdates).eq('item_id', itemId);
      if (peUpdErr) throw peUpdErr;
    }

    // Re-fetch updated item + password entry separately
    // SQL: SELECT item_id, vault_id, item_type, encrypted_label, date_created, date_modified FROM items WHERE item_id = $1 AND vault_id = $2 LIMIT 1;
    const { data: itemData, error: itemFetchErr } = await supa
      .from('items')
      .select('item_id,vault_id,item_type,encrypted_label,date_created,date_modified')
      .eq('item_id', itemId)
      .eq('vault_id', vaultId)
      .single();
    if (itemFetchErr) throw itemFetchErr;
    // SQL: SELECT item_id, encrypted_website, encrypted_username, encrypted_password, nonce, tag FROM password_entries WHERE item_id = $1 LIMIT 1;
    const { data: peData, error: peFetchErr } = await supa
      .from('password_entries')
      .select('item_id,encrypted_website,encrypted_username,encrypted_password,nonce,tag')
      .eq('item_id', itemId)
      .single();
    if (peFetchErr) throw peFetchErr;
    // SQL: INSERT INTO audit_logs (vault_id, user_id, item_id, action) VALUES ($1, $2, $3, 'item_updated');
    await supa.from('audit_logs').insert([{ vault_id: vaultId, user_id: appUser.id, item_id: itemId, action: 'item_updated' }]);
    res.json(flattenJoined({ ...itemData, password_entries: peData }));
  } catch (err) {
    console.error('items.update error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// DELETE /api/vaults/:vaultId/items/:itemId (remove password_entries + item)
router.delete('/:itemId', async (req, res) => {
  const suid = req.user.sub;
  const { vaultId, itemId } = req.params;
  try {
    const appUser = await getAppUser(suid);
    if (!appUser) return res.status(401).json({ error: 'App user not found' });
    const vault = await getVault(vaultId);
    if (!vault) return res.status(404).json({ error: 'Vault not found' });
    if (vault.user_id !== appUser.id) return res.status(403).json({ error: 'Forbidden' });

    // Delete password_entries first (in case FK cascade not configured), then item
    // SQL: DELETE FROM password_entries WHERE item_id = $1;
    const { error: peDelErr } = await supa.from('password_entries').delete().eq('item_id', itemId);
    if (peDelErr) throw peDelErr;
    // SQL: DELETE FROM items WHERE item_id = $1 AND vault_id = $2;
    const { error: itemDelErr } = await supa.from('items').delete().eq('item_id', itemId).eq('vault_id', vaultId);
    if (itemDelErr) throw itemDelErr;
    // SQL: INSERT INTO audit_logs (vault_id, user_id, item_id, action) VALUES ($1, $2, $3, 'item_deleted');
    await supa.from('audit_logs').insert([{ vault_id: vaultId, user_id: appUser.id, item_id: itemId, action: 'item_deleted' }]);
    return res.status(204).send();
  } catch (err) {
    console.error('items.delete error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

module.exports = router;
