#!/bin/bash
# One-time (re-runnable) bot setup: Clarity Desk name, logo, description,
# commands, and the webhook that lets the bot answer people who message it.
# Run from anywhere:  bash workers/feedback/brand-bot.sh
# It asks for the bot token (hidden) and never writes it to disk.
set -e
cd "$(dirname "$0")"
LOGO="../../icon-512-maskable.png"
WORKER_URL="https://clarity-desk-feedback.sanghapal2006.workers.dev"
[ -f "$LOGO" ] || { echo "Logo not found: $LOGO"; exit 1; }

read -r -s -p "Paste your bot token, then press Enter: " T; echo
API="https://api.telegram.org/bot$T"
call() { curl -s -X POST "$API/$1" "${@:2}" | grep -o '"ok":[a-z]*\|"description":"[^"]*"' | tr '\n' ' '; echo; }

JPG="$(mktemp -t cdlogo).jpg"
sips -s format jpeg -z 512 512 "$LOGO" --out "$JPG" >/dev/null

echo "Name:";        call setMyName -d "name=Clarity Desk"
echo "About:";       call setMyShortDescription --data-urlencode "short_description=Clarity Desk feedback. Bug reports, feedback and ideas from the app land here."
echo "Description:"; call setMyDescription --data-urlencode "description=Clarity Desk is the student desk for your timetable, attendance, tasks and notes.

This bot receives bug reports, feedback and ideas sent from inside the app. To send one, open Clarity Desk > Settings > Tell me what breaks."
echo "Commands:";    call setMyCommands --data-urlencode 'commands=[{"command":"start","description":"How to send feedback"},{"command":"help","description":"How to send feedback"}]'
echo "Logo:";        call setMyProfilePhoto -F 'photo={"type":"static","photo":"attach://logo"}' -F "logo=@$JPG"
rm -f "$JPG"

SECRET="$(openssl rand -hex 24)"
printf '%s' "$SECRET" | npx wrangler@latest secret put TELEGRAM_WEBHOOK_SECRET
echo "Webhook:";     call setWebhook -d "url=$WORKER_URL/telegram" -d "secret_token=$SECRET" -d 'allowed_updates=["message"]'
echo "Check:";       curl -s "$API/getWebhookInfo" | grep -o '"url":"[^"]*"\|"last_error_message":"[^"]*"\|"pending_update_count":[0-9]*' | tr '\n' ' '; echo
unset T SECRET
echo "Finished. Message your bot to see its reply."
