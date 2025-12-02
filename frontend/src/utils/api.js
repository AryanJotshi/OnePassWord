import { supabase } from './supabase';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet(path) {
  const headers = await authHeader();
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || res.statusText);
    err.status = res.status;
    try { err.body = JSON.parse(text); } catch {}
    throw err;
  }
  return res.json();
}

export async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || res.statusText);
    err.status = res.status;
    try { err.body = JSON.parse(text); } catch {}
    throw err;
  }
  return res.json();
}

export async function apiDelete(path) {
  const headers = await authHeader();
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE', headers });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || res.statusText);
    err.status = res.status;
    try { err.body = JSON.parse(text); } catch {}
    throw err;
  }
  return true;
}

export async function apiPatch(path, body) {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
  const res = await fetch(`${BASE_URL}${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || res.statusText);
    err.status = res.status;
    try { err.body = JSON.parse(text); } catch {}
    throw err;
  }
  return res.json();
}
