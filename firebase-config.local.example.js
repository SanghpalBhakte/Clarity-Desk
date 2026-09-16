// ============================================================
// Clarity Desk — Local AI key override (NOT committed to git)
//
// 1. Copy this file to "firebase-config.local.js" (same folder).
// 2. Get a FREE Gemini API key: https://aistudio.google.com/apikey
//    (sign in with any Google account, click "Create API key" —
//    no credit card required, generous free tier).
// 3. Paste it below.
// 4. Deploy: firebase deploy --only hosting
//
// This file is listed in .gitignore, so your key never gets
// committed or pushed to GitHub. It just needs to exist locally
// on the machine you deploy from.
// ============================================================
window.ENV = window.ENV || {};
window.ENV.GEMINI_API_KEY = "PASTE_YOUR_FREE_GEMINI_KEY_HERE";
