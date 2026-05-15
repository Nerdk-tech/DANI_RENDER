# Deploying DANI to Render (Free Tier)

## What was added

| File | Purpose |
|---|---|
| `server.js` | Express HTTP server — status dashboard + `/health` + `/api/status` |
| `public/index.html` | Live status dashboard UI |
| `render.yaml` | Render service config |

The bot self-pings its own `/health` endpoint every **14 minutes** so Render's
15-minute sleep timer never triggers.

---

## Step 1 — Session files (critical)

Render's file system is **ephemeral** — it resets on every deploy. Your WhatsApp
session folder will be wiped. You have two options:

### Option A — Pair fresh on every deploy (simplest)
Leave `PAIR_PHONE_NUMBER` set in Render env vars. On each deploy the bot will
print a pairing code in the **Logs** tab. Go to WhatsApp → Settings → Linked
Devices → Link a Device → Enter phone number → type the code.

### Option B — Persist session to an external store (recommended for stability)
Use a free Redis (Render or Upstash) or a small Supabase bucket to save/restore
the `session/` folder contents on startup. This avoids re-pairing after every
deploy. (Advanced — tackle this after the basic setup works.)

---

## Step 2 — Push to GitHub

```bash
# In your dani_newbuild folder:
git init
git add .
git commit -m "feat: add Render deployment + status dashboard + self-ping"
git remote add origin https://github.com/YOUR_USERNAME/dani-bot.git
git push -u origin main
```

> Make sure `.gitignore` excludes `session/` and `.env` — never commit those.

---

## Step 3 — Create the Render service

1. Go to https://render.com → **New** → **Web Service**
2. Connect your GitHub repo
3. Render will auto-detect `render.yaml` — click **Apply**
4. Or fill manually:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node main.js`
   - **Plan**: Free

---

## Step 4 — Environment variables

In the Render dashboard → your service → **Environment**, add:

| Key | Value |
|---|---|
| `PAIR_PHONE_NUMBER` | `2349120185747` (your number, no +) |
| `GEMINI_API_KEY` | your Gemini key |
| `FAL_KEY` | your fal.ai key |
| `BOT_NAME` | `Dani` |
| Any other keys from your `.env` | … |

`RENDER_EXTERNAL_URL` is injected automatically by Render — don't set it
manually.

---

## Step 5 — First deploy

1. Click **Deploy** (or push a commit)
2. Open the **Logs** tab — wait for the pairing code to print
3. Pair your WhatsApp (see Step 1 Option A)
4. Visit `https://YOUR-APP.onrender.com` — you'll see the status dashboard

---

## Self-ping behaviour

- `server.js` calls `/health` on itself every 14 minutes
- Logged as `[self-ping] ✅ #N at <time>` in Render logs
- Dashboard shows ping count, last ping time, and a countdown bar
- If self-ping fails it warns but doesn't crash

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Bot pairs but goes offline after 15 min | Self-ping should prevent this — check logs for `[self-ping]` lines |
| `Cannot find module 'express'` | Run `npm install` locally and push `package.json` with express listed |
| Session lost after redeploy | Expected on free tier — re-pair or implement Option B above |
| Pairing code never appears | Check `PAIR_PHONE_NUMBER` env var is set correctly (digits only) |
