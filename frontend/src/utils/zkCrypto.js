// zkCrypto: derive keys and encrypt/decrypt in-browser

export const ENVELOPE_VERSION = 1;

async function getPBKDF2Key(password, salt, iterations = 600000) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function deriveAesKeyFromPassword(password, saltBytes) {
  return getPBKDF2Key(password, saltBytes);
}

export function randomBytes(len) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}

export async function aesGcmEncrypt(utf8Text, key) {
  const iv = randomBytes(12);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(utf8Text));
  return { iv_b64: btoa(String.fromCharCode(...iv)), ct_b64: btoa(String.fromCharCode(...new Uint8Array(ciphertext))) };
}

export async function aesGcmDecrypt(ct_b64, iv_b64, key) {
  const ct = Uint8Array.from(atob(ct_b64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(iv_b64), c => c.charCodeAt(0));
  const dec = new TextDecoder();
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return dec.decode(pt);
}

export async function copyToClipboardSecure(secret) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    console.warn('Clipboard API not available in this environment');
    return;
  }
  await navigator.clipboard.writeText(secret);
  console.warn('Sensitive value copied. Clipboard may persist in OS history. It will be cleared here after delay.');
  setTimeout(() => {
    secret && secret.split('').fill('');
  }, 0);
}


