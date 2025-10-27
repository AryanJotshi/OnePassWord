import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiDelete } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useToast } from '../contexts/ToastContext';

export default function Profile() {
  const { user, signOut, userMeta } = useAuth();
  const [accountPassword, setAccountPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  async function deleteAccount() {
    if (!user) return;
    if (!accountPassword) { showToast('Enter your account password', 'error'); return; }
    setBusy(true);
    try {
      const email = user.email;
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: accountPassword });
      if (reauthErr) throw reauthErr;
      await apiDelete('/api/users/me');
      await signOut();
      showToast('account deleted', 'success');
      navigate('/auth', { replace: true });
    } catch (e) {
      showToast(e?.message || String(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="card">
        <h2 className="mb-2 text-xl font-semibold">Profile</h2>
        <div className="mb-2">Username: <b>{userMeta?.username || user?.email}</b></div>
        <div className="mb-4">Role: <b>{userMeta?.role || 'user'}</b></div>
        <hr className="my-4 border-slate-200 dark:border-neutral-700" />
        <h3 className="mb-2 text-lg font-semibold text-red-600">Danger Zone</h3>
        <p className="mb-3 text-sm text-slate-600 dark:text-neutral-400">Deleting your account removes all vaults and entries permanently. Please confirm with your account password.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-64" type="password" value={accountPassword} onChange={e => setAccountPassword(e.target.value)} placeholder="Account password" />
          <button disabled={busy} className="btn-danger" onClick={deleteAccount}>Delete my account</button>
        </div>
      </div>
    </section>
  );
}


