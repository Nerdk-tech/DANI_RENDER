/**
 * server.js — Express HTTP server for DANI
 *
 * Responsibilities:
 *  1. Serve the status dashboard (public/index.html)
 *  2. Expose /api/status JSON endpoint
 *  3. Self-ping every 14 minutes so Render's free tier doesn't sleep
 *
 * The server is started from main.js and shares a `state` object
 * so it can report live WhatsApp connection status.
 */

const express = require('express');
const path    = require('path');
const axios   = require('axios');

const PING_INTERVAL_MS = 14 * 60 * 1000; // 14 min  (Render sleeps at 15)

/**
 * @param {object} sharedState  — mutable ref owned by main.js
 *   sharedState.waConnected   {boolean}
 *   sharedState.startedAt     {number}   Date.now() when bot started
 */
function startServer(sharedState) {
  const app  = express();
  const PORT = process.env.PORT || 3000;

  // ── Track ping stats ──────────────────────────────────────────────────────
  let pingCount  = 0;
  let lastPingAt = null;

  // ── Static dashboard ──────────────────────────────────────────────────────
  app.use(express.static(path.join(__dirname, 'public')));

  // ── Status API ────────────────────────────────────────────────────────────
  app.get('/api/status', (_req, res) => {
    const uptimeSec = Math.floor((Date.now() - sharedState.startedAt) / 1000);
    res.json({
      alive:       true,
      uptime:      uptimeSec,
      waConnected: sharedState.waConnected ?? false,
      pingCount,
      lastPingAt,
      env:         process.env.NODE_ENV || 'production',
      memUsed:     process.memoryUsage().heapUsed,
    });
  });

  // ── Health check (for Render's own health probe) ──────────────────────────
  app.get('/health', (_req, res) => res.send('OK'));

  // ── Catch-all → dashboard ─────────────────────────────────────────────────
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // ── Start listening ───────────────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`\n🌐  Status dashboard → http://localhost:${PORT}\n`);
  });

  // ── Self-ping loop ────────────────────────────────────────────────────────
  // Render provides the external URL via RENDER_EXTERNAL_URL env var.
  // Falls back to localhost (useful for testing locally).
  function selfPing() {
    const base = process.env.RENDER_EXTERNAL_URL
      ? process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '')
      : `http://localhost:${PORT}`;

    const url = `${base}/health`;

    axios.get(url, { timeout: 10000 })
      .then(() => {
        pingCount++;
        lastPingAt = new Date().toISOString();
        console.log(`[self-ping] ✅  #${pingCount} at ${lastPingAt}`);
      })
      .catch((err) => {
        console.warn(`[self-ping] ⚠️  failed — ${err.message}`);
      });
  }

  // Kick off immediately, then repeat every 14 minutes
  selfPing();
  setInterval(selfPing, PING_INTERVAL_MS);
}

module.exports = { startServer };
