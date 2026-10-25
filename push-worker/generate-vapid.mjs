// Prints a new VAPID key pair for push-worker (P-256, base64url).
// Run once: node generate-vapid.mjs. Keep the private key secret.
import { b64urlEncode } from './webpush.mjs';

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
console.log(`VAPID_PUBLIC_KEY=${b64urlEncode(pub)}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);
