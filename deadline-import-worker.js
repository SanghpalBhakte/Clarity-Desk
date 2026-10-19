// Runs the WhatsApp deadline scan off the main thread for long chats,
// so the screen never freezes. The chat text only lives in this worker's
// memory for the length of one scan; nothing is stored or sent anywhere.
import { scanChat } from './deadline-import.js';

self.onmessage = (e) => {
  const { raw, now } = e.data || {};
  try {
    self.postMessage({ ok: true, result: scanChat(raw, now ? new Date(now) : new Date()) });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};
