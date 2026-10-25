# Clarity Desk push worker

Sends class and deadline reminders to phones while Clarity Desk is closed.
It runs on Cloudflare Workers and D1, both on the free plan.

- The phone works out its own reminders for the next 14 days and syncs only what a notification needs: title, body, tag, the screen to open, and the fire time in UTC.
- A cron job runs every minute. It sends the reminders that are due by Web Push (WebCrypto, RFC 8291/8292), then deletes them.
- There is no login. Each device gets a random id and a secret, and only the secret's hash is stored.
- Chats and task descriptions are never sent here.

## First deploy (once)

```bash
cd push-worker
npx wrangler@latest d1 create clarity-desk-push        # paste database_id into wrangler.toml
npx wrangler@latest d1 execute clarity-desk-push --remote --file=schema.sql
node generate-vapid.mjs                                # prints both keys
npx wrangler@latest secret put VAPID_PUBLIC_KEY        # paste the public key
npx wrangler@latest secret put VAPID_PRIVATE_KEY       # paste the private key
npx wrangler@latest deploy
```

The deployed URL must match `PUSH_API_URL` in `../firebase-config.js`: `https://clarity-desk-push.<account>.workers.dev`.

Check that it is up:

```bash
curl -s -H "Origin: https://campusos-83365.web.app" https://clarity-desk-push.sanghapal2006.workers.dev/vapid
```

`npm run ship` does not deploy this folder. After changing it, run `npx wrangler@latest deploy` here.

Changing the VAPID keys signs every phone out of push. Each phone signs up again the next time its app opens.

## Free-plan budget

These limits are from memory. Check them against Cloudflare's pricing page.

- **Cron:** 1,440 runs a day. The free plan allows 5 cron triggers per account.
- **CPU:** the free plan allows 10 ms of CPU per run, so each run sends at most 10 pushes (14,400 a day). Anything left over goes out in the next minute. Per-push CPU hasn't been measured on Workers yet: after the first busy morning, check CPU time in the Worker's dashboard and lower `sendPerTick` in `worker.mjs` if runs come close to the limit.
- **D1 writes:** 100k rows a day. A sync writes only the rows that changed.
- **D1 reads:** 5M rows a day. The cron queries use indexes.
