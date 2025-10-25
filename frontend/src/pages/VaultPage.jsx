import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost, apiDelete, apiPatch } from '../utils/api';
import { deriveAesKeyFromPassword, aesGcmDecrypt, aesGcmEncrypt, copyToClipboardSecure } from '../utils/zkCrypto';
import { ArrowLeft, PencilSimple, Clipboard, Check, Trash, Plus, DiceSix, FloppyDisk, X, LockOpen, GlobeSimple, User } from 'phosphor-react';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';

export default function VaultPage({ vault, goBack }) {
  const [items, setItems] = useState([]);
  const [unlocked, setUnlocked] = useState(false);
  const [vaultKey, setVaultKey] = useState(null);
  const [cryptoKey, setCryptoKey] = useState(null);
  const [vaultPassword, setVaultPassword] = useState('');
  const [error, setError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [website, setWebsite] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // copyMsg no longer shown inline; retain only copiedId for icon swap
  const [copiedId, setCopiedId] = useState(null);
  const [vaultDetail, setVaultDetail] = useState(vault);
  const [decryptedMeta, setDecryptedMeta] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const idleTimer = useRef(null);
  const params = useParams();
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('date_created');
  const [sortDir, setSortDir] = useState('desc');
  const { showToast } = useToast();

  function lockVault() {
    setUnlocked(false);
    setDecryptedMeta({});
    setItems([]);
    if (vaultKey) for (let i = 0; i < vaultKey.length; i++) vaultKey[i] = 0;
    setVaultKey(null);
    setCryptoKey(null);
  }

  function resetIdleTimer() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => { lockVault(); }, 2 * 60 * 1000);
  }

  useEffect(() => {
    if (unlocked) {
      resetIdleTimer();
      const onAny = () => resetIdleTimer();
      const onBlur = () => lockVault();
      window.addEventListener('mousemove', onAny);
      window.addEventListener('keydown', onAny);
      window.addEventListener('blur', onBlur);
      return () => {
        window.removeEventListener('mousemove', onAny);
        window.removeEventListener('keydown', onAny);
        window.removeEventListener('blur', onBlur);
        if (idleTimer.current) clearTimeout(idleTimer.current);
      };
    }
  }, [unlocked]);

  async function loadVaultDetail() {
    setDetailLoading(true);
    const t0 = performance.now();
    try {
      const id = vault?.vault_id || params.vaultId;
      if (id) {
        const v = await apiGet(`/api/vaults/${id}`);
        setVaultDetail(v);
        setError('');
      }
    } catch (e) { setError('Failed to load vault. ' + (e?.message || e)); }
    finally {
      const elapsed = performance.now() - t0;
      const remaining = Math.max(0, 500 - elapsed);
      setTimeout(() => setDetailLoading(false), remaining);
    }
  }

  async function loadItems() {
    setItemsLoading(true);
    const t0 = performance.now();
    try {
      const id = vault?.vault_id || params.vaultId;
      if (!id) return;
      const data = await apiGet(`/api/vaults/${id}/items`);
      setItems(data);
    } catch (e) { setError('Failed to load items. ' + (e?.message || e)); }
    finally {
      const elapsed = performance.now() - t0;
      const remaining = Math.max(0, 500 - elapsed);
      setTimeout(() => setItemsLoading(false), remaining);
    }
  }

  useEffect(() => { loadVaultDetail(); }, [vault?.vault_id, params.vaultId]);

  async function unlock(e) {
    e.preventDefault();
    try {
      const enc = JSON.parse(vaultDetail.encrypted_vault_key);
      const saltBytes = Uint8Array.from(atob(vaultDetail.salt), c => c.charCodeAt(0));
      const kdfKey = await deriveAesKeyFromPassword(vaultPassword, saltBytes);
      const vaultKeyB64 = await aesGcmDecrypt(enc.ct_b64, enc.iv_b64, kdfKey);
      const keyBytes = Uint8Array.from(atob(vaultKeyB64), c => c.charCodeAt(0));
      setVaultKey(keyBytes);
      const cKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
      setCryptoKey(cKey);
      setUnlocked(true);
      setVaultPassword('');
      setError('');
      await loadItems();
    } catch (e) { setError('Failed to unlock (bad password or corrupted data).'); showToast('Failed to unlock (bad password or corrupted data).', 'error'); }
  }

  // Bulk meta decryption (label/website/username only)
  useEffect(() => {
    async function run() {
      if (!unlocked || !cryptoKey || !items?.length) { setDecryptedMeta({}); return; }
      const out = {};
      for (const it of items) {
        const meta = {};
        try {
          if (it.encrypted_label) {
            const encLabel = JSON.parse(it.encrypted_label);
            meta.label = await aesGcmDecrypt(encLabel.ct_b64, encLabel.iv_b64, cryptoKey);
          }
          if (it.encrypted_website) {
            const encWeb = JSON.parse(it.encrypted_website);
            meta.website = await aesGcmDecrypt(encWeb.ct_b64, encWeb.iv_b64, cryptoKey);
          }
          if (it.encrypted_username) {
            const encUser = JSON.parse(it.encrypted_username);
            meta.username = await aesGcmDecrypt(encUser.ct_b64, encUser.iv_b64, cryptoKey);
          }
          // Note: password intentionally NOT decrypted here (on-demand only)
        } catch { }
        out[it.item_id] = meta;
      }
      setDecryptedMeta(out);
    }
    run();
  }, [unlocked, cryptoKey, items]);

  async function addItem(e) {
    e.preventDefault();
    if (!unlocked || !vaultKey) return;
    if (!label || !password) { setError('Label and password are required.'); showToast('Label and password are required.', 'error'); return; }
    try {
      const key = cryptoKey || await crypto.subtle.importKey('raw', vaultKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
      const eLabel = await aesGcmEncrypt(label, key);
      const eWeb = website ? await aesGcmEncrypt(website, key) : null;
      const eUser = username ? await aesGcmEncrypt(username, key) : null;
      const ePass = await aesGcmEncrypt(password, key);
      const body = {
        item_type: 'website',
        encrypted_label: JSON.stringify(eLabel),
        encrypted_website: eWeb ? JSON.stringify(eWeb) : null,
        encrypted_username: eUser ? JSON.stringify(eUser) : null,
        encrypted_password: JSON.stringify(ePass),
        nonce: 'iv-included-in-fields',
        tag: 'tag-included-in-aes-gcm',
      };
      const id = vault?.vault_id || params.vaultId;
      await apiPost(`/api/vaults/${id}/items`, body);
      setLabel(''); setWebsite(''); setUsername(''); setPassword('');
      showToast('Password added', 'success');
      await loadItems();
    } catch (e) { setError('Could not add item. ' + (e?.message || e)); showToast('Could not add item. ' + (e?.message || e), 'error'); }
  }

  function generatePassword() {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < length; i++) out += charset[bytes[i] % charset.length];
    setPassword(out);
  }

  async function copyPassword(item) {
    if (!unlocked || !cryptoKey) return;
    try {
      const ePass = JSON.parse(item.encrypted_password);
      const plaintext = await aesGcmDecrypt(ePass.ct_b64, ePass.iv_b64, cryptoKey);
      await copyToClipboardSecure(plaintext);
      // feedback handled via toast & icon swap
      setCopiedId(item.item_id);
      setTimeout(() => setCopiedId(null), 1200);
      showToast('Password copied', 'success');
    } catch (e) { setError('Failed to decrypt/copy: ' + (e?.message || e)); showToast('Failed to decrypt/copy', 'error'); }
  }

  async function copyWebsite(item) {
    if (!unlocked || !cryptoKey) return;
    try {
      const meta = decryptedMeta[item.item_id];
      let plain = meta?.website;
      if (!plain && item.encrypted_website) {
        const encWeb = JSON.parse(item.encrypted_website);
        plain = await aesGcmDecrypt(encWeb.ct_b64, encWeb.iv_b64, cryptoKey);
      }
      if (!plain) return; // nothing to copy
      await copyToClipboardSecure(plain);
      // feedback via toast & icon swap
      setCopiedId(item.item_id + '-website');
      setTimeout(() => setCopiedId(null), 1200);
      showToast('Website copied', 'success');
    } catch (e) { setError('Failed to copy website: ' + (e?.message || e)); showToast('Failed to copy website', 'error'); }
  }

  async function copyUsername(item) {
    if (!unlocked || !cryptoKey) return;
    try {
      const meta = decryptedMeta[item.item_id];
      let plain = meta?.username;
      if (!plain && item.encrypted_username) {
        const encUser = JSON.parse(item.encrypted_username);
        plain = await aesGcmDecrypt(encUser.ct_b64, encUser.iv_b64, cryptoKey);
      }
      if (!plain) return;
      await copyToClipboardSecure(plain);
      // feedback via toast & icon swap
      setCopiedId(item.item_id + '-username');
      setTimeout(() => setCopiedId(null), 1200);
      showToast('Username copied', 'success');
    } catch (e) { setError('Failed to copy username: ' + (e?.message || e)); showToast('Failed to copy username', 'error'); }
  }

  async function deleteItem(itemId) {
    try {
      const id = vault?.vault_id || params.vaultId;
      await apiDelete(`/api/vaults/${id}/items/${itemId}`);
      showToast('Password deleted', 'success');
      await loadItems();
    } catch (e) { setError('Could not delete entry. ' + (e?.message || e)); showToast('Could not delete entry. ' + (e?.message || e), 'error'); }
  }

  async function startEdit(item) {
    if (!unlocked || !cryptoKey) return;
    try {
      const meta = decryptedMeta[item.item_id] || {};
      setEditLabel(meta.label || '');
      setEditWebsite(meta.website || '');
      setEditUsername(meta.username || '');
      // Do NOT prefill password to avoid leaking length; leave it empty
      setEditPassword('');
      setEditingId(item.item_id);
    } catch (e) {
      showToast(e?.message || String(e), 'error');
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel('');
    setEditWebsite('');
    setEditUsername('');
    setEditPassword('');
  }

  function generateEditPassword() {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < length; i++) out += charset[bytes[i] % charset.length];
    setEditPassword(out);
  }

  async function saveEdit(item) {
    if (!editingId || editingId !== item.item_id) return;
    if (!unlocked || !cryptoKey) return;
    if (!editLabel.trim()) { showToast('Label is required', 'error'); return; }
    setEditBusy(true);
    try {
      // Encrypt updated fields
      const eLabel = await aesGcmEncrypt(editLabel, cryptoKey);
      const body = {
        encrypted_label: JSON.stringify(eLabel),
        encrypted_website: editWebsite ? JSON.stringify(await aesGcmEncrypt(editWebsite, cryptoKey)) : null,
        encrypted_username: editUsername ? JSON.stringify(await aesGcmEncrypt(editUsername, cryptoKey)) : null,
      };
      // Only update password if a new one was provided
      if (editPassword && editPassword.length > 0) {
        body.encrypted_password = JSON.stringify(await aesGcmEncrypt(editPassword, cryptoKey));
      }
      const id = vault?.vault_id || params.vaultId;
      await apiPatch(`/api/vaults/${id}/items/${item.item_id}`, body);
      cancelEdit();
      showToast('Entry updated', 'success');
      await loadItems();
    } catch (e) {
      showToast(e?.message || String(e), 'error');
    } finally {
      setEditBusy(false);
    }
  }

  const itemsToShow = useMemo(() => {
    if (!unlocked) return [];
    const base = items ? items.slice() : [];
    const q = query.trim().toLowerCase();
    const filtered = (!unlocked || !q)
      ? base
      : base.filter(it => {
        const meta = decryptedMeta[it.item_id] || {};
        const hay = `${meta.label || ''} ${meta.website || ''} ${meta.username || ''}`.toLowerCase();
        return hay.includes(q);
      });
    filtered.sort((a, b) => {
      const ka = new Date(a[sortBy] || 0).getTime();
      const kb = new Date(b[sortBy] || 0).getTime();
      return sortDir === 'asc' ? ka - kb : kb - ka;
    });
    return filtered;
  }, [items, decryptedMeta, query, sortBy, sortDir, unlocked]);

  return (
    <section className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">{vault.vault_name}</h3>
        <button onClick={goBack} className="icon-btn" aria-label="Back" title="Back"><ArrowLeft size={20} weight="bold" /></button>
      </div>

      {!unlocked && (
        <div className="card">
          <form onSubmit={unlock} className={`flex items-center gap-2 ${error ? 'shake' : ''}`}>
            <div className="flex-1 min-w-0">
              <input className="input w-full" type="password" value={vaultPassword} onChange={e => setVaultPassword(e.target.value)} placeholder="Vault password" />
            </div>
            <button type="submit" className="icon-btn shrink-0" aria-label="Unlock" title="Unlock"><LockOpen size={20} weight="bold" /></button>
          </form>
          {detailLoading && (
            <div className="mt-4 flex justify-center" aria-live="polite" aria-busy="true">
              <Spinner size={32} radius={5} inline />
            </div>
          )}
        </div>
      )}

      {unlocked && (
        <>
          <div className="card">
            <form onSubmit={addItem} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* Row 1 */}
              <input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (e.g. Gmail)" />
              <input className="input" value={website} onChange={e => setWebsite(e.target.value)} placeholder="Website (optional)" />
              {/* Row 2 */}
              <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username (optional)" />
              <div className="flex items-center gap-2">
                <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
                <button type="button" className="icon-btn" onClick={generatePassword} aria-label="Generate random password" title="Generate random password"><DiceSix size={20} weight="bold" /></button>
                <button type="submit" className="icon-btn" aria-label="Add password" title="Add password"><Plus size={20} weight="bold" /></button>
              </div>
            </form>
          </div>

          <h2 className="mt-10 mb-3 text-xl font-semibold">Your Passwords</h2>
          <div className="mt-3 mb-2 flex flex-wrap items-center gap-2">
            <input className="input w-72" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search label/website/username" aria-label="Search items" />
            <select className="input w-44" value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort by">
              <option value="date_created">Created time</option>
              <option value="date_modified">Updated time</option>
            </select>
            <select className="input w-40" value={sortDir} onChange={e => setSortDir(e.target.value)} aria-label="Sort direction">
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>

          {itemsLoading && (
            <div className="mt-4 flex justify-center" aria-live="polite" aria-busy="true">
              <Spinner size={40} radius={5} inline />
            </div>
          )}
          {!itemsLoading && items.length === 0 && <div className="text-sm text-slate-500 dark:text-neutral-400">No passwords stored.</div>}

          {!itemsLoading && (
            <ul className="space-y-3 mt-3">
              {itemsToShow.map(it => {
                const meta = decryptedMeta[it.item_id] || {};
                const hasOptional = !!(meta.website || meta.username);
                return (
                  <li key={it.item_id} className="card">
                    <div className="list-enter">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-semibold">{meta.label || 'Untitled'}</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <button className="icon-btn" onClick={() => startEdit(it)} aria-label="Edit" title="Edit"><PencilSimple size={20} weight="bold" /></button>
                          <button className="icon-btn" onClick={() => copyPassword(it)} aria-label="Copy password" title="Copy password">{copiedId === it.item_id ? <Check size={20} weight="bold" /> : <Clipboard size={20} weight="bold" />}</button>
                          <button className="icon-btn-danger" onClick={() => deleteItem(it.item_id)} aria-label="Delete" title="Delete"><Trash size={20} weight="bold" /></button>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-neutral-400">created {it.date_created ? new Date(it.date_created).toLocaleString() : '—'} • updated {it.date_modified ? new Date(it.date_modified).toLocaleString() : '—'}</div>
                      {hasOptional && (
                        <div className="mt-2 rounded-md border border-dashed border-slate-300 p-2 dark:border-neutral-700">
                          {meta.website && (
                            <div className="flex items-center gap-2">
                              <GlobeSimple size={18} weight="bold" className="text-slate-500" />
                              <span className="truncate">{meta.website}</span>
                              <button className="icon-btn" onClick={() => copyWebsite(it)} aria-label="Copy website" title="Copy website">{copiedId === it.item_id + '-website' ? <Check size={18} weight="bold" /> : <Clipboard size={18} weight="bold" />}</button>
                            </div>
                          )}
                          {meta.username && (
                            <div className="mt-1 flex items-center gap-2">
                              <User size={18} weight="bold" className="text-slate-500" />
                              <span className="truncate">{meta.username}</span>
                              <button className="icon-btn" onClick={() => copyUsername(it)} aria-label="Copy username" title="Copy username">{copiedId === it.item_id + '-username' ? <Check size={18} weight="bold" /> : <Clipboard size={18} weight="bold" />}</button>
                            </div>
                          )}
                        </div>
                      )}
                      {editingId === it.item_id && (
                        <div className="mt-3">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <input className="input" value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="Label" />
                            <input className="input" value={editWebsite} onChange={e => setEditWebsite(e.target.value)} placeholder="Website (optional)" />
                            <input className="input" value={editUsername} onChange={e => setEditUsername(e.target.value)} placeholder="Username (optional)" />
                            <div className="flex items-center gap-2">
                              <input className="input" type="password" autoComplete="new-password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="New password (leave blank to keep)" />
                              <button type="button" className="icon-btn" title="Generate strong password" aria-label="Generate strong password" onClick={generateEditPassword}><DiceSix size={18} weight="bold" /></button>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <button className="icon-btn" disabled={editBusy} onClick={() => saveEdit(it)} aria-label="Save" title="Save"><FloppyDisk size={18} weight="bold" /></button>
                            <button className="icon-btn" onClick={cancelEdit} aria-label="Cancel" title="Cancel"><X size={18} weight="bold" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
