# Feedback relay

Cloudflare Worker (free plan) behind the in-app "Tell me what breaks" form.
It checks the page origin, size and rate limit, then forwards the report to a
private Telegram chat. The bot token and chat id live only as Worker secrets.

Not deployed by `npm run ship`. Deploy by hand:

1. Create a bot with @BotFather (`/newbot`), message it once, find your chat id
   with `getUpdates`.
2. From this folder:
   - `npx wrangler@latest login`
   - `npx wrangler@latest secret put TELEGRAM_BOT_TOKEN`
   - `npx wrangler@latest secret put TELEGRAM_CHAT_ID`
   - `npx wrangler@latest deploy`
3. Put the printed `https://clarity-desk-feedback.<you>.workers.dev` URL in
   `FEEDBACK_URL` at the top of the feedback section in `app.js`.

Request: `POST` multipart with `type` (bug|feedback|idea), `message`,
`version`, `route`, `device`, `mode` and an optional `screenshot` image.
