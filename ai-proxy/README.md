# Clarity Desk AI proxy

A free Cloudflare Worker that holds the Gemini, Groq and OpenRouter keys, so the
website no longer ships them to every visitor. The app sends its AI scan requests
here; the Worker adds the key and forwards them.

Cost: $0. The Workers free plan allows 100,000 requests a day; one timetable or
attendance scan uses 1–3.

## What it protects

- Keys live only in Cloudflare as encrypted secrets. They never reach the browser.
- Only pages from `ALLOWED_ORIGINS` (the two Firebase Hosting domains) can call it.
- Signed-in students are rate-limited per account (20 calls/min); guests per
  network (30 calls/min). Change these in `wrangler.toml`.
- OpenRouter calls are limited to `:free` models, so a key with credit can't be spent.
- Request bodies over 12 MB are refused.

It does not stop someone from scripting requests with a faked `Origin` header.
The worst they can do is use up the free provider quota for the day; they can't
read the keys or run up a bill, as long as the Gemini key's Google Cloud project
has no billing account attached.

## Deploy (Windows PowerShell, one line at a time)

You need a free Cloudflare account: https://dash.cloudflare.com/sign-up

```
cd "D:\Clarity Desk\ai-proxy"
npx wrangler@latest login
npx wrangler@latest secret put GEMINI_API_KEY
npx wrangler@latest secret put GROQ_API_KEY
npx wrangler@latest secret put OPENROUTER_API_KEY
npx wrangler@latest deploy
```

Each `secret put` asks you to paste the key. Use new keys (see "Rotate the keys"
below). Skip any provider you don't use.

`deploy` prints a URL like `https://clarity-desk-ai.<your-name>.workers.dev`.
Check it:

```
curl.exe https://clarity-desk-ai.<your-name>.workers.dev/v1/health
```

It should show `"ok":true` and `true` for each provider you added a key for.

## Point the app at it

In `firebase-config.js`, paste that URL into `AI_PROXY_URL`, then deploy the site
as usual. Once it's set, the app sends every AI call through the proxy, even if
keys are still present in `firebase-config.local.js`.

## Rotate the keys

The old keys were served publicly in `firebase-config.local.js`, so treat them as
leaked:

1. Create new keys (Gemini: https://aistudio.google.com/apikey, Groq:
   https://console.groq.com/keys, OpenRouter: https://openrouter.ai/keys).
2. Put the new keys only in the Worker (`secret put` above).
3. Delete the three key lines from `firebase-config.local.js` and redeploy the site.
4. Delete the old keys in each provider's console.

## Test locally

Create `ai-proxy/.dev.vars` (ignored by git and by Firebase Hosting) with your
keys and a localhost origin:

```
GEMINI_API_KEY=...
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
ALLOWED_ORIGINS=http://127.0.0.1:*,http://localhost:*
```

Then run `npx wrangler@latest dev` and, in another terminal from the repo root,
`npm run test:ocr-kit -- --proxy http://127.0.0.1:8787`.
