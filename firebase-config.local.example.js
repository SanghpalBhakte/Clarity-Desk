// ============================================================
// Clarity Desk — Local AI key override (NOT committed to git)
//
// NOTE: the live site gets AI through the AI proxy (ai-proxy/ folder,
// AI_PROXY_URL in firebase-config.js), which keeps keys on the server.
// Keys put in firebase-config.local.js ARE deployed with the site and
// readable by anyone -- only use this file for offline experiments with
// AI_PROXY_URL cleared, and never deploy it with keys in it.
//
// 1. Copy this file to "firebase-config.local.js" (same folder).
// 2. Get free API keys (any one of these is enough to enable the
//    timetable-scan AI fallback; configuring more than one lets the
//    scanner rotate to the next provider if one is rate-limited):
//      - Gemini:      https://aistudio.google.com/apikey
//                     (any Google account, no credit card, generous free tier)
//      - Groq:        https://console.groq.com/keys
//                     (free, fast, also used for vision extraction)
//      - OpenRouter:  https://openrouter.ai/keys
//                     ($0, no card — pick a current ":free" vision model)
// 3. Paste whichever you have below, and DELETE the line(s) for any key you
//    don't have -- a leftover "PASTE_YOUR_..." placeholder string is still
//    truthy, so it gets read as a real (but invalid) key otherwise.
// 4. Deploy: firebase deploy --only hosting
//
// This file is listed in .gitignore, so your keys never get
// committed or pushed to GitHub. They just need to exist locally
// on the machine you deploy from.
// ============================================================
window.ENV = window.ENV || {};
window.ENV.GEMINI_API_KEY = "PASTE_YOUR_FREE_GEMINI_KEY_HERE";
window.ENV.GROQ_API_KEY = "PASTE_YOUR_FREE_GROQ_KEY_HERE";
window.ENV.OPENROUTER_API_KEY = "PASTE_YOUR_FREE_OPENROUTER_KEY_HERE";
