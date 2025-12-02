import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../utils/supabase';
import { apiGet, apiPost } from '../utils/api';

const AuthContext = createContext(null);

function usernameToEmail(username) {
  return `${username}@onepassword.com`;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [userMeta, setUserMeta] = useState(undefined); // undefined = loading, null = no meta
  const regGuard = useRef({ inFlight: false, userId: null, done: new Set() });

  async function getMeWithRetry(max = 3, delayMs = 150) {
    let lastErr;
    for (let i = 0; i < max; i++) {
      try { return await apiGet('/api/users/me'); } catch (e) {
        lastErr = e;
        if (!(e?.status === 404) || i === max - 1) throw e;
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
    throw lastErr;
  }

  async function ensureRegistered(supaUser) {
    if (!supaUser) return;
    const guard = regGuard.current;
    if (guard.done.has(supaUser.id)) {
      // Avoid leaving userMeta undefined on route changes; fetch /me quickly
      try {
        const meta = await apiGet('/api/users/me');
        setUserMeta(meta);
      } catch { setUserMeta(null); }
      return;
    }
    if (guard.inFlight && guard.userId === supaUser.id) return;
    guard.inFlight = true;
    guard.userId = supaUser.id;

    console.log('[Auth] ensureRegistered start', { supaUserId: supaUser.id, email: supaUser.email });
    try {
      await apiGet('/api/users/me')
        .then(meta => {
          console.log('[Auth] /api/users/me success', meta);
          guard.done.add(supaUser.id);
          setUserMeta(meta);
        })
        .catch(async (err) => {
          console.log('[Auth] /api/users/me error', err.status, err.message || err, err.body);
          const is404 = err?.status === 404 || err?.body?.error === 'Not found' || /404/.test(String(err?.message));
          if (is404) {
            const username = supaUser.email.split('@')[0];
            console.log('[Auth] registering new user', { username, supabase_user_id: supaUser.id });
            try {
              await apiPost('/api/users/register', {
                supabase_user_id: supaUser.id,
                username,
                role: username === 'superadmin' ? 'superadmin' : 'user'
              });
              console.log('[Auth] register success');
            } catch (e) {
              console.log('[Auth] register error', e.status, e.message || e);
              if (!(e.status === 409 || String(e).includes('already exists'))) throw e;
            }
            await getMeWithRetry().then(m => { console.log('[Auth] post-register /me success', m); guard.done.add(supaUser.id); setUserMeta(m); }).catch(e2 => { console.log('[Auth] post-register /me still missing', e2.status, e2.message || e2); setUserMeta(null); });
          } else {
            console.log('[Auth] non-404 error getting /me, setting userMeta null');
            setUserMeta(null);
          }
        });
    } catch (outer) {
      console.log('[Auth] ensureRegistered outer catch', outer.status, outer.message || outer);
      setUserMeta(null);
    } finally {
      guard.inFlight = false;
      guard.userId = null;
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      setUser(data.session?.user || null);
      console.log('[Auth] initial session', { hasSession: !!data.session });
      if (data.session?.user) {
        setUserMeta(undefined);
        ensureRegistered(data.session.user);
      } else {
        setUserMeta(null);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, sess) => {
      console.log('[Auth] auth state change', { event, hasSession: !!sess });
      setSession(sess);
      setUser(sess?.user || null);
      if (sess?.user) {
        setUserMeta(undefined);
        ensureRegistered(sess.user);
      } else {
        setUserMeta(null);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function signUp(username, password) {
    const email = usernameToEmail(username);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async function signIn(username, password) {
    const email = usernameToEmail(username);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    await supabase.auth.signOut();
    console.log('[Auth] signed out');
  }

  const value = { session, user, signIn, signUp, signOut, userMeta };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
