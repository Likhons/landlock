// Hash-linked, digitally signed, append-only ledger.
// hash      = SHA-256(prev_hash + event data)   -> detects edits
// signature = Ed25519(hash, registrar key)      -> stops an attacker who recomputes the hashes
// GENESIS   = entry #1, must equal the trusted starting state (db.seed())
// checkpoint = signed {length, head_hash} kept in memory AND in a separate folder -> detects a deleted tail
// replay    = rebuilds every plot/transaction from the ledger -> detects owner/mortgage/survey edits
//             that bypass the registration/mutation workflow
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const keys = require('./keys');
const rbac = require('./rbac');
const { checkSale, checkMortgage } = require('./rules');

const GENESIS = '0'.repeat(64);
const SAMPLE_NOTICE = 'DEMO/SAMPLE DATA - not verified official khatian records';

// Keep the checkpoint away from data.json. Point this at another disk/machine in real use.
const CP_DIR = process.env.LANDLOCK_TRUST_DIR || path.join(__dirname, 'trusted');
const CP_FILE = path.join(CP_DIR, 'checkpoint.json');

function computeHash(prev_hash, entry) {
  const payload = JSON.stringify({
    plot_id: entry.plot_id,
    event_type: entry.event_type,
    data: entry.data,
    timestamp: entry.timestamp,
  });
  return crypto.createHash('sha256').update(prev_hash + payload).digest('hex');
}

// JSON with sorted keys, so two objects compare equal regardless of key order
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}
const clone = (v) => JSON.parse(JSON.stringify(v));

function genesisData() {
  return { notice: SAMPLE_NOTICE, plots: db.seed().plots };
}

// ---- Trusted checkpoint ----
// `trusted` lives in this process's memory and is only changed by append()/reset(), so editing
// data.json (or the in-memory ledger) cannot move it. The file copy lets the next start-up check
// that the ledger was not cut short while the server was stopped.
let trusted = null;
let checkpointProblem = null;

const cpPayload = (cp) => JSON.stringify({ length: cp.length, head_hash: cp.head_hash, genesis_hash: cp.genesis_hash, updated_at: cp.updated_at });

function writeCheckpoint() {
  const { ledger } = db.get();
  const cp = {
    length: ledger.length,
    head_hash: ledger[ledger.length - 1].hash,
    genesis_hash: ledger[0].hash,
    updated_at: new Date().toISOString(),
  };
  cp.signature = keys.sign(cpPayload(cp));
  fs.mkdirSync(CP_DIR, { recursive: true });
  fs.writeFileSync(CP_FILE, JSON.stringify(cp, null, 2));
  trusted = cp;
  checkpointProblem = null;
}

function readCheckpointFile() {
  if (!fs.existsSync(CP_FILE)) return { missing: true };
  try {
    const cp = JSON.parse(fs.readFileSync(CP_FILE, 'utf8'));
    return keys.verify(cpPayload(cp), cp.signature) ? { cp } : { bad: true };
  } catch (e) {
    return { bad: true };
  }
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
  writeCheckpoint();
  return entry;
}

function reset() {
  db.reset();
  append(null, 'GENESIS', genesisData());
}

// ---- Replay: rebuild plots + transactions from the ledger ----
function replay(ledger) {
  const plots = new Map(ledger[0].data.plots.map((p) => [p.id, clone(p)]));
  const txs = new Map();
  for (const e of ledger.slice(1)) {
    const d = e.data || {};
    const fail = (why) => ({ error: { brokenAt: e.id, reason: `Entry #${e.id} (${e.event_type}): ${why}` } });
    const plot = plots.get(e.plot_id);
    if (!plot) return fail('refers to an unknown plot');
    if (!rbac.EVENT_PERMISSION[e.event_type]) return fail('unknown event type');
    // Permission was enforced when the event was written (and the entry is signed). Here we only
    // require a known acting role, because explicit grants may legitimately change over time.
    if (!rbac.ROLES[d.by_role] || d.by_role === rbac.DEFAULT_ROLE) return fail(`no authorized acting role recorded ("${d.by_role}")`);
    const tx = txs.get(d.tx_id);
    const activeTx = () => tx && tx.plot_id === plot.id && tx.state === 'active';

    switch (e.event_type) {
      case 'SALE_INITIATED':
        if (!checkSale(plot, d.seller, d.deed_area, {
          buyer: d.buyer, deedNo: d.deed_no, usedDeedNos: [...txs.values()].map((t) => t.deed_no),
        }).allowed) return fail('sale was not allowed in the replayed state');
        if (txs.has(d.tx_id)) return fail('duplicate transaction id');
        txs.set(d.tx_id, {
          id: d.tx_id, plot_id: plot.id, seller: d.seller, buyer: d.buyer, deed_no: d.deed_no, deed_area: d.deed_area,
          reg_status: 'pending', mutation_status: 'pending', state: 'active',
        });
        plot.status = 'Pending';
        break;
      case 'REGISTRATION_DONE':
        if (!activeTx() || tx.reg_status === 'done') return fail('no matching active, unregistered sale');
        tx.reg_status = 'done';
        break;
      case 'MUTATION_DONE':
        if (!activeTx() || tx.reg_status !== 'done') return fail('mutation without a registered deed');
        if (d.new_owner !== tx.buyer) return fail('new owner does not match the registered buyer');
        plot.current_owner = tx.buyer;
        plot.status = 'Free';
        tx.mutation_status = 'done';
        tx.state = 'completed';
        break;
      case 'MUTATION_REJECTED':
        if (!activeTx() || tx.reg_status !== 'done') return fail('mutation rejected without a registered deed');
        if (!d.reason) return fail('mutation rejected without a reason');
        tx.mutation_status = 'rejected';
        tx.state = 'disputed';
        tx.dispute_reason = d.reason;
        plot.status = 'Disputed';
        break;
      case 'SALE_CANCELLED':
        if (!activeTx()) return fail('no matching active sale');
        if (tx.reg_status === 'done') return fail('a registered deed cannot be cancelled');
        tx.state = 'cancelled';
        plot.status = 'Free';
        break;
      case 'MORTGAGE_CREATED':
        if (!checkMortgage(plot, d.owner, d.bank).allowed) return fail('mortgage was not allowed in the replayed state');
        plot.mortgage = { bank: d.bank, loan_ref: d.loan_ref };
        break;
      case 'MORTGAGE_RELEASED':
        if (!plot.mortgage) return fail('released a mortgage that does not exist');
        plot.mortgage = null;
        break;
      default: // SALE_BLOCKED / MORTGAGE_BLOCKED: audit only, no state change
    }
  }
  return { plots, txs };
}

const TX_FIELDS = ['plot_id', 'seller', 'buyer', 'deed_no', 'deed_area', 'reg_status', 'mutation_status', 'state', 'dispute_reason'];

function checkState(ledger) {
  const r = replay(ledger);
  if (r.error) return { kind: 'workflow', ...r.error };
  const d = db.get();
  const bad = (reason) => ({ kind: 'state', brokenAt: null, reason });

  if (d.plots.length !== r.plots.size) return bad('Plot list does not match the ledger (plots added or removed outside the workflow)');
  for (const p of d.plots) {
    const expected = r.plots.get(p.id);
    if (!expected) return bad(`Plot ${p.id} does not exist in the ledger`);
    if (p.current_owner !== expected.current_owner) {
      return bad(`Plot ${p.id}: current owner "${p.current_owner}" does not match the ledger ("${expected.current_owner}"). Owner was changed without an authorized mutation.`);
    }
    if (stable(p) !== stable(expected)) return bad(`Plot ${p.id}: record (status, mortgage, area or survey history) does not match the ledger`);
  }
  if (d.transactions.length !== r.txs.size) return bad('Transaction list does not match the ledger');
  for (const t of d.transactions) {
    const expected = r.txs.get(t.id);
    if (!expected || TX_FIELDS.some((f) => stable(t[f]) !== stable(expected[f]))) {
      return bad(`Transaction #${t.id} does not match the ledger`);
    }
  }
  return null;
}

const BN = {
  link: 'এন্ট্রিগুলোর সংযোগ (previous hash) ভেঙে গেছে: এন্ট্রি মুছে ফেলা বা ক্রম বদলানো হয়েছে।',
  hash: 'এন্ট্রির তথ্য পরিবর্তন করা হয়েছে (hash মিলছে না)।',
  signature: 'Hash ঠিক দেখালেও রেজিস্ট্রির ডিজিটাল স্বাক্ষর মিলছে না (জাল বা নতুন করে লেখা এন্ট্রি)।',
  sequence: 'এন্ট্রির ক্রমিক নম্বর ঠিক নেই।',
  genesis: 'Ledger সঠিক genesis (শুরুর) এন্ট্রি দিয়ে শুরু হয়নি।',
  truncation: 'Ledger-এর শেষের এন্ট্রি মুছে ফেলা হয়েছে (trusted checkpoint-এর চেয়ে ছোট)।',
  checkpoint: 'Trusted checkpoint পাওয়া যায়নি বা মিলছে না। Ledger কেটে ছোট করা হয়েছে কিনা নিশ্চিত হওয়া যাচ্ছে না।',
  workflow: 'Ledger-এ এমন একটি ঘটনা আছে যা অনুমোদিত প্রক্রিয়া মেনে হয়নি।',
  state: 'জমির রেকর্ড Ledger-এর সাথে মিলছে না: অনুমোদিত নামজারি ছাড়াই তথ্য বদলানো হয়েছে।',
};

// Walks the whole chain. kind tells which protection caught the problem.
function verify() {
  const { ledger } = db.get();
  const fail = (kind, brokenAt, reason) => ({ valid: false, kind, brokenAt, reason, bn: BN[kind] });

  if (!ledger.length && trusted) {
    return fail('truncation', null, `Ledger is empty but the trusted checkpoint expects ${trusted.length} entries: the ledger was wiped`);
  }
  if (!ledger.length || ledger[0].event_type !== 'GENESIS') {
    return fail('genesis', ledger.length ? ledger[0].id : null,
      'Ledger does not start with a GENESIS entry (created by an older version, or the start was removed). Use Reset (demo) to start a new verified ledger.');
  }
  let prev = GENESIS;
  for (let i = 0; i < ledger.length; i++) {
    const e = ledger[i];
    if (e.id !== i + 1) {
      return fail('sequence', e.id, `Entry at position ${i + 1} has id #${e.id}: entries were deleted, inserted or reordered`);
    }
    if (e.prev_hash !== prev) {
      return fail('link', e.id, `Entry #${e.id}: link to previous entry is broken (entry deleted, reordered or altered)`);
    }
    if (computeHash(e.prev_hash, e) !== e.hash) {
      return fail('hash', e.id, `Entry #${e.id}: content was altered (hash mismatch)`);
    }
    if (!keys.verify(e.hash, e.signature)) {
      return fail('signature', e.id, `Entry #${e.id}: hashes look fine, but the registrar's digital signature is invalid (forged or re-written entry)`);
    }
    prev = e.hash;
  }
  if (stable(ledger[0].data) !== stable(genesisData())) {
    return fail('genesis', 1, 'GENESIS entry does not match the expected starting register');
  }

  if (!trusted) {
    return fail('checkpoint', null, checkpointProblem === 'bad'
      ? 'Trusted checkpoint signature is invalid. Ledger truncation cannot be ruled out.'
      : 'Trusted checkpoint is missing. Ledger truncation cannot be ruled out.');
  }
  if (ledger.length < trusted.length) {
    return fail('truncation', ledger.length, `Ledger has ${ledger.length} entries but the trusted checkpoint expects ${trusted.length}: the tail was deleted`);
  }
  if (ledger[0].hash !== trusted.genesis_hash || ledger[trusted.length - 1].hash !== trusted.head_hash) {
    return fail('checkpoint', trusted.length, `Entry #${trusted.length} does not match the trusted checkpoint: history was rewritten`);
  }
  if (ledger.length > trusted.length) {
    return fail('checkpoint', trusted.length + 1, `Entries after #${trusted.length} were not written by the application (not covered by the trusted checkpoint)`);
  }
  const onDisk = readCheckpointFile();
  if (!onDisk.cp || cpPayload(onDisk.cp) !== cpPayload(trusted)) {
    return fail('checkpoint', null, 'Checkpoint file was changed or removed while the server was running');
  }

  const stateProblem = checkState(ledger);
  if (stateProblem) return { valid: false, ...stateProblem, bn: BN[stateProblem.kind] };

  return {
    valid: true, kind: null, brokenAt: null, length: ledger.length,
    reason: 'Ledger is intact, every entry is signed by the registry, matches the trusted checkpoint, and the land records match the ledger',
  };
}

function forPlot(plot_id) {
  return db.get().ledger.filter((e) => e.plot_id === plot_id);
}

// ---- Start-up ----
(function init() {
  const { ledger } = db.get();
  const file = readCheckpointFile();
  if (file.cp) trusted = file.cp;
  else if (file.bad) checkpointProblem = 'bad';
  else if (ledger.length === 0) append(null, 'GENESIS', genesisData()); // brand-new database
  else checkpointProblem = 'missing';
})();

module.exports = { append, verify, forPlot, computeHash, reset };
