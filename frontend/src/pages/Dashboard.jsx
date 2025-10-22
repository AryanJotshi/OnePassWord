import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost, apiDelete, apiGet } from '../utils/api';
import { deriveAesKeyFromPassword, randomBytes, aesGcmEncrypt, aesGcmDecrypt } from '../utils/zkCrypto';
import { Plus, Trash, ArrowSquareOut } from 'phosphor-react';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';

export default function Dashboard({ vaults = [], vaultsLoading = false, selectVault, setVaults, reloadVaults }) {
  const [name, setName] = useState('');
  const [vaultPassword, setVaultPassword] = useState('');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const { showToast } = useToast();

  async function createVault(e) {
    e.preventDefault();
    if (!name.trim() || !vaultPassword) { showToast('Vault name and password required.', 'error'); return; }
    try {
      const salt = randomBytes(16);
      const kdfKey = await deriveAesKeyFromPassword(vaultPassword, salt);
      const vaultKeyBytes = randomBytes(32);
      const vaultKeyB64 = btoa(String.fromCharCode(...vaultKeyBytes));
      const encrypted = await aesGcmEncrypt(vaultKeyB64, kdfKey);
      await apiPost('/api/vaults', { vault_name: name, encrypted_vault_key: JSON.stringify(encrypted), salt: btoa(String.fromCharCode(...salt)) });
      setName(''); setVaultPassword('');
      showToast('Vault created!', 'success');
      await reloadVaults();
    } catch (e) {
      showToast('Could not create vault. ' + (e?.message || String(e)), 'error');
    }
  }

  async function deleteVault(vaultId) {
    try {
      const pwd = window.prompt("Enter this vault's password to confirm deletion:");
      if (!pwd) return;
      const v = await apiGet(`/api/vaults/${vaultId}`);
      const enc = JSON.parse(v.encrypted_vault_key);
      const saltBytes = Uint8Array.from(atob(v.salt), c => c.charCodeAt(0));
      const kdfKey = await deriveAesKeyFromPassword(pwd, saltBytes);
      await aesGcmDecrypt(enc.ct_b64, enc.iv_b64, kdfKey);
      await apiDelete(`/api/vaults/${vaultId}`);
      await reloadVaults();
      showToast('Vault deleted.', 'success');
    } catch (e) {
      showToast('Vault deletion cancelled or password incorrect.', 'error');
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? vaults.filter(v => (v.vault_name || '').toLowerCase().includes(q)) : vaults.slice();
    list.sort((a, b) => {
      const ka = new Date(a[sortBy] || 0).getTime();
      const kb = new Date(b[sortBy] || 0).getTime();
      return sortDir === 'asc' ? ka - kb : kb - ka;
    });
    return list;
  }, [vaults, query, sortBy, sortDir]);

  return (
    <section className="mx-auto max-w-3xl">
      <div className="card">
        <form onSubmit={createVault} className="flex flex-wrap items-center gap-3">
          <input className="input flex-1 min-w-[12rem]" value={name} onChange={e => setName(e.target.value)} placeholder="Vault name" />
          <input className="input flex-1 min-w-[12rem]" type="password" value={vaultPassword} onChange={e => setVaultPassword(e.target.value)} placeholder="Vault password" />
          <button type="submit" className="icon-btn ms-auto" aria-label="Create vault" title="Create vault"><Plus size={22} weight="bold" /></button>
        </form>
      </div>

      <h2 className="mt-10 mb-3 text-xl font-semibold">Your Vaults</h2>
      <div className="mt-2 mb-2 flex flex-wrap items-center gap-2">
        <input className="input w-64" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search vault name" aria-label="Search vaults" />
        <select className="input w-44" value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort by">
          <option value="created_at">Created time</option>
          <option value="updated_at">Updated time</option>
        </select>
        <select className="input w-40" value={sortDir} onChange={e => setSortDir(e.target.value)} aria-label="Sort direction">
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </div>

      {vaultsLoading && (
        <div className="mt-6 flex justify-center" aria-live="polite" aria-busy="true">
          <Spinner size={36} radius={5} inline />
        </div>
      )}
      {!vaultsLoading && (
        <ul className="space-y-3 mt-3">
          {filtered.map(v => (
            <li key={v.vault_id} className="card flex items-center justify-between">
              <div className="min-w-0">
                <div className="truncate text-base font-medium">{v.vault_name}</div>
                <div className="text-xs text-slate-500 dark:text-neutral-400">created {v.created_at ? new Date(v.created_at).toLocaleString() : '—'} • updated {v.updated_at ? new Date(v.updated_at).toLocaleString() : '—'}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="icon-btn" aria-label="Open" title="Open" onClick={() => { selectVault(v); navigate(`/vault/${v.vault_id}`); }}><ArrowSquareOut size={20} weight="bold" /></button>
                <button className="icon-btn-danger" aria-label="Delete" title="Delete" onClick={() => deleteVault(v.vault_id)}><Trash size={20} weight="bold" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
