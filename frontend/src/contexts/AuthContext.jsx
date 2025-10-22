import { createContext, useContext, useEffect, useState } from 'react';
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

  async function ensureRegistered(supaUser) {
    if (!supaUser) return;
    try {
      await apiGet('/api/users/me')
        .then(setUserMeta)
        .catch(async (err) => {
          if (err.message?.includes('404')) {
            // Try register
            const username = supaUser.email.split('@')[0];
            try {
              await apiPost('/api/users/register', {
                supabase_user_id: supaUser.id,
                username,
                role: 'user'
              });
            } catch (e) {
              if (!(String(e).includes('already exists') || String(e).includes('409'))) throw e;
            }
            await apiGet('/api/users/me').then(setUserMeta).catch(() => setUserMeta(null));
          } else {
            setUserMeta(null);
          }
        });
    } catch {
      setUserMeta(null);
    }
  }

  useEffect(() => {
    const current = supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      setUser(data.session?.user || null);
      if (data.session?.user) {
        setUserMeta(undefined);
        ensureRegistered(data.session.user);
      } else {
        setUserMeta(null);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
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
  }

  const value = { session, user, signIn, signUp, signOut, userMeta };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
