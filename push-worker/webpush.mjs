// Web Push for Cloudflare Workers using WebCrypto only (no Node libraries).
//   RFC 8291: message encryption (aes128gcm content coding)
//   RFC 8292: VAPID (who is sending: an ES256-signed JWT)
// Also runs under Node 20+ (global crypto.subtle), which is how the tests
// check it against the RFC 8291 worked example.

const enc = new TextEncoder();

export function b64urlDecode(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlEncode(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// HKDF with a single output block (every length used here is <= 32).
async function hkdf(salt, ikm, info, length) {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

// P-256 key pair from base64url raw public key (65 bytes) + private d (32).
function p256Jwk(publicKey, privateKey) {
  const pub = b64urlDecode(publicKey);
  return { kty: 'EC', crv: 'P-256', x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), d: privateKey, ext: true };
}

export async function importEcdhKeys(publicKey, privateKey) {
  const jwk = p256Jwk(publicKey, privateKey);
  const priv = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = await crypto.subtle.importKey('raw', b64urlDecode(publicKey), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  return { publicKey: pub, privateKey: priv };
}

// Encrypts `plaintext` for one subscription (keys.p256dh, keys.auth).
// opts.salt / opts.serverKeys are for the RFC test vector only; normally a
// fresh salt and key pair are made for every message.
export async function encryptPayload(plaintext, p256dh, auth, opts = {}) {
  const uaPublic = b64urlDecode(p256dh);
  const authSecret = b64urlDecode(auth);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const serverKeys = opts.serverKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKeys.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const body = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext;
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // One record: content + 0x02 (last-record delimiter), no extra padding.
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(body, new Uint8Array([2]))));

  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ct);
}

// "vapid t=<jwt>, k=<public key>" for one push service (the JWT audience).
export async function vapidAuthorization(endpoint, vapid, nowSec = Math.floor(Date.now() / 1000)) {
  const aud = new URL(endpoint).origin;
  const head = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: vapid.subject })));
  const key = await crypto.subtle.importKey('jwk', p256Jwk(vapid.publicKey, vapid.privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64urlEncode(sig)}, k=${vapid.publicKey}`;
}

// Sends one push. Returns { status, reason }: the push service's HTTP status
// (201 = accepted, 404/410 = subscription gone) and, when it refuses, the
// short reason it gives (e.g. Apple's {"reason":"BadJwtToken"}).
// `authCache` reuses a JWT per push service.
export async function sendPush(subscription, payload, vapid, { ttl = 3600, urgency = 'high', authCache = null, fetchImpl = fetch } = {}) {
  const aud = new URL(subscription.endpoint).origin;
  let authorization = authCache && authCache.get(aud);
  if (!authorization) {
    authorization = await vapidAuthorization(subscription.endpoint, vapid);
    if (authCache) authCache.set(aud, authorization);
  }
  const body = await encryptPayload(JSON.stringify(payload), subscription.p256dh, subscription.auth);
  const res = await fetchImpl(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
      Authorization: authorization,
    },
    body,
  });
  let reason = '';
  if ((res.status < 200 || res.status >= 300) && typeof res.text === 'function') {
    reason = (await res.text().catch(() => '')).slice(0, 200);
  }
  return { status: res.status, reason };
}
