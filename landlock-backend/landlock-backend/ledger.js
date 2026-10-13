// Hash-linked, digitally signed, append-only ledger.
// hash      = SHA-256(prev_hash + event data)   -> detects edits
// signature = Ed25519(hash, registrar key)      -> stops an attacker who recomputes the hashes
const crypto = require('crypto');
const db = require('./db');
const keys = require('./keys');

const GENESIS = '0'.repeat(64);

function computeHash(prev_hash, entry) {
  const payload = JSON.stringify({
    plot_id: entry.plot_id,
    event_type: entry.event_type,
    data: entry.data,
    timestamp: entry.timestamp,
  });
  return crypto.createHash('sha256').update(prev_hash + payload).digest('hex');
}

function append(plot_id, event_type, data) {
  const d = db.get();
  const prev_hash = d.ledger.length ? d.ledger[d.ledger.length - 1].hash : GENESIS;
  const entry = {
    id: d.ledger.length + 1,
    plot_id,
    event_type,
    data,
    timestamp: new Date().toISOString(),
    prev_hash,
  };
  entry.hash = computeHash(prev_hash, entry);
  entry.signature = keys.sign(entry.hash);
  entry.signer = keys.SIGNER;
  d.ledger.push(entry);
  db.save();
  return entry;
}

// Walks the whole chain. kind tells which protection caught the problem.
function verify() {
  const { ledger } = db.get();
  let prev = GENESIS;
  for (const e of ledger) {
    if (e.prev_hash !== prev) {
      return { valid: false, kind: 'hash', brokenAt: e.id, reason: `Entry #${e.id}: link to previous entry is broken` };
    }
    if (computeHash(e.prev_hash, e) !== e.hash) {
      return { valid: false, kind: 'hash', brokenAt: e.id, reason: `Entry #${e.id}: content was altered (hash mismatch)` };
    }
    if (!keys.verify(e.hash, e.signature)) {
      return { valid: false, kind: 'signature', brokenAt: e.id, reason: `Entry #${e.id}: hashes look fine, but the registrar's digital signature is invalid (forged or re-written entry)` };
    }
    prev = e.hash;
  }
  return { valid: true, kind: null, brokenAt: null, reason: 'Ledger is intact and every entry is signed by the registry' };
}

function forPlot(plot_id) {
  return db.get().ledger.filter((e) => e.plot_id === plot_id);
}

module.exports = { append, verify, forPlot, computeHash };