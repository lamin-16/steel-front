'use strict';

const express = require('express');
const path = require('path');
const cors = require('cors');
const pqc = require('./pqc.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.use(express.static(__dirname, { extensions: ['html'] }));

let serverSignKey = null;
let pqcReady = null;
const leaderboard = new Map();
const MAX_ENTRIES = 100;

function ensureInit() {
  if (!pqcReady) {
    pqcReady = pqc.init().then(() => {
      serverSignKey = pqc.generateSignKeypair();
      console.log('[PQC] Server signature key ready:', serverSignKey.algorithm);
      console.log('[PQC] Standard:', pqc.ALGORITHMS.STANDARD);
      console.log('[PQC] Security:', pqc.ALGORITHMS.SECURITY_LEVEL);
    });
  }
  return pqcReady;
}

app.use(async (req, res, next) => {
  try { await ensureInit(); next(); }
  catch (e) { res.status(500).json({ error: 'pqc-init-failed' }); }
});

app.get('/api/pubkey', (req, res) => {
  res.json({
    algorithm: serverSignKey.algorithm,
    publicKey: serverSignKey.publicKey,
    standard: pqc.ALGORITHMS.STANDARD
  });
});

app.post('/api/score', (req, res) => {
  try {
    const { name, score, proof } = req.body;
    if (!name || typeof score !== 'number' || !proof) {
      return res.status(400).json({ error: 'missing-fields' });
    }
    if (name.length > 24 || score < 0 || score > 1e9) {
      return res.status(400).json({ error: 'invalid-values' });
    }

    const payload = name + ':' + score;
    const ok = pqc.verify(payload, proof, serverSignKey.publicKey);
    if (!ok) return res.status(403).json({ error: 'bad-signature' });

    const existing = leaderboard.get(name) || 0;
    if (score > existing) leaderboard.set(name, score);

    const sorted = Array.from(leaderboard.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ENTRIES);

    res.json({ ok: true, rank: sorted.findIndex(e => e[0] === name) + 1 });
  } catch (e) {
    res.status(500).json({ error: 'server-error' });
  }
});

app.get('/api/leaderboard', (req, res) => {
  const top = Array.from(leaderboard.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ENTRIES)
    .map((e, i) => ({ rank: i + 1, name: e[0], score: e[1] }));
  res.json({ leaderboard: top, total: leaderboard.size });
});

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
  ensureInit().then(() => {
    app.listen(PORT, () => {
      console.log('Steel Front running at http://localhost:' + PORT);
    });
  });
}

module.exports = app;
