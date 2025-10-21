import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { useToast } from '../contexts/ToastContext';

export default function AuthPage({ reloadVaults }) {
  const { signIn, signUp, user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin');
  const navigate = useNavigate();
  const { showToast } = useToast();

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (mode === 'signup') {
        await signUp(username, password);
        showToast('Account created! Please sign in.', 'success');
        // Registration is handled centrally by AuthContext ensureRegistered after next sign in
        reloadVaults && reloadVaults();
        return;
      } else {
        await signIn(username, password);
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      showToast(err.message || String(err), 'error');
    }
  }

  return (
    <div className="container-responsive">
      <div className="mx-auto mt-10 w-full max-w-md">
        <h2 className="mb-4 text-center text-2xl font-semibold tracking-tight">{mode === 'signup' ? 'Create an account!' : 'Welcome!'}</h2>
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label" htmlFor="username">Username</label>
              <input id="username" className="input" value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" className="input" value={password} onChange={e => setPassword(e.target.value)} type="password" />
            </div>
            <div className="text-center">
              <button type="submit" className="inline-block font-semibold text-blue-600 hover:underline dark:text-blue-400">
                {mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            </div>
          </form>
          <div className="mt-4 text-center">
            <button onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')} className="inline-block text-blue-600 hover:underline dark:text-blue-400">
              {mode === 'signup' ? 'Have an account? Sign in' : 'No account? Sign up'}
            </button>
          </div>
          {user && <div className="mt-3 text-xs text-slate-500 dark:text-neutral-400">Signed in as {user.id}</div>}
        </div>
      </div>
    </div>
  );
}
