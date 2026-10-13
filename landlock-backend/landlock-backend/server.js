// Optional local settings: backend/.env (see .env.example). Variables already set in the shell win.
const fs = require('fs');
const path = require('path');
const ENV_FILE = path.join(__dirname, '.env');
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const express = require('express');
const cors = require('cors');
const config = require('./config');
const db = require('./db');
const ledger = require('./ledger');
const keys = require('./keys');
const rbac = require('./rbac');
const { checkSale, checkMortgage, assessPlot, partialSale, RESULT_NOTICE, NOT_CHECKED } = require('./rules');

const app = express();
app.use(cors());
app.use(express.json());

const findPlot = (id) => db.get().plots.find((p) => p.id === id);
const findTx = (id) => db.get().transactions.find((t) => t.id === Number(id));
const activeTxFor = (plot_id) =>
  db.get().transactions.find((t) => t.plot_id === plot_id && t.state === 'active');
const disputedTxFor = (plot_id) =>
  db.get().transactions.find((t) => t.plot_id === plot_id && t.state === 'disputed');

// Finds the active transaction for a workflow step, or sends a clear error and returns null.
function activeTxOrError(req, res) {
  if (!/^[1-9]\d{0,8}$/.test(req.params.id)) {
    invalid(res, ['id']);
    return null;
  }
  const tx = findTx(req.params.id);
  if (tx && tx.state === 'disputed') {
    res.status(409).json({
      error: 'This transaction is disputed (mutation was rejected). No further workflow step is allowed.',
      code: 'TX_DISPUTED',
      bn: 'এই লেনদেনটি বিরোধপূর্ণ (নামজারি বাতিল হয়েছে)। আর কোনো ধাপ করা যাবে না।',
      en: 'This transaction is disputed (mutation was rejected). No further workflow step is allowed.',
    });
    return null;
  }
  if (!tx || tx.state !== 'active') {
    res.status(404).json({ error: 'Active transaction not found' });
    return null;
  }
  return tx;
}

// Every write goes through this: 1) the role must hold the permission (checked here on the server,
// never only in the UI), 2) the ledger and land records must verify, so nothing is written on top of
// tampered data. DEMO: the role is taken from the X-Demo-Role header, which is not authentication.
const guard = (perm) => (req, res, next) => {
  const { role, error } = rbac.resolveRole(req);
  if (error) return res.status(400).json({ error, code: 'UNKNOWN_ROLE' });
  if (!rbac.can(role, perm)) {
    const label = rbac.ROLES[role];
    const allowed = rbac.rolesWith(perm).map((r) => rbac.ROLES[r]);
    return res.status(403).json({
      error: `Permission denied: ${label.en} cannot perform ${perm}`,
      code: 'PERMISSION_DENIED', role, required: perm,
      bn: `অনুমতি নেই: ${label.bn} এই কাজটি করতে পারবেন না। প্রয়োজন: ${allowed.map((r) => r.bn).join(' / ') || '—'}।`,
      en: `Permission denied: ${label.en} cannot do this. Required role: ${allowed.map((r) => r.en).join(' / ') || 'none'}.`,
    });
  }
  const integrity = ledger.verify();
  if (!integrity.valid) {
    return res.status(423).json({
      error: `Ledger integrity check failed, write refused. ${integrity.reason}`,
      code: 'INTEGRITY_FAILED', ledger: integrity,
      bn: `Ledger যাচাই ব্যর্থ, তাই কোনো পরিবর্তন করা হবে না। ${integrity.bn}`,
      en: `Ledger integrity check failed, so no change is allowed. ${integrity.reason}`,
    });
  }
  req.role = role;
  // From here the request may change data. If it fails midway, the error handler restores this copy.
  res.locals.rollback = db.snapshot();
  next();
};

// ---- Input validation (server side; never trust the form) ----
// Every value is trimmed and must match its expected format; anything else is rejected with 400
// before any rule runs, so malformed values never reach data.json or the signed ledger.
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
// Person / bank names: letters in any script (Bangla too), digits, spaces and . ' - & ( ) , ; max 100
const NAME_RE = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'&(),-]*$/u;
// Deed / loan numbers: e.g. D-1001, 4521/1998, LN-2024-77; max 40
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9/._ -]*$/;
const PLOT_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
// Area as text: plain decimal digits only ("10", "10.5"). Rejects "0x10", "1e3", "Infinity", "-5".
const AREA_TEXT_RE = /^\d+(\.\d+)?$/;
const name = (v) => { const t = text(v); return t && t.length <= 100 && NAME_RE.test(t) ? t : null; };
const ref = (v) => { const t = text(v); return t && t.length <= 40 && REF_RE.test(t) ? t : null; };
const note = (v) => { const t = text(v); return t && t.length <= 300 && !CONTROL_CHARS.test(t) ? t : null; };
const plotId = (v) => (typeof v === 'string' && PLOT_ID_RE.test(v) ? v : null);
// Area: a finite number greater than 0 (JSON number, or plain decimal text like "10").
const area = (v) => {
  let n;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && AREA_TEXT_RE.test(v.trim())) n = Number(v.trim());
  else return null;
  return Number.isFinite(n) && n > 0 ? n : null;
};
// Returns the names of fields whose value failed validation (null).
const badFields = (values) => Object.entries(values).filter(([, v]) => v === null).map(([k]) => k);

const FIELD_LABEL = {
  plot_id: { bn: 'জমির আইডি', en: 'plot id' },
  id: { bn: 'লেনদেন নং', en: 'transaction id' },
  seller: { bn: 'বিক্রেতা', en: 'seller' },
  buyer: { bn: 'ক্রেতা', en: 'buyer' },
  deed_no: { bn: 'দলিল নং', en: 'deed no.' },
  deed_area: { bn: 'দলিলের পরিমাণ (শূন্যের বেশি সংখ্যা)', en: 'deed area (a number greater than 0)' },
  reason: { bn: 'বাতিলের কারণ', en: 'rejection reason' },
  owner: { bn: 'বন্ধকদাতা', en: 'mortgagor' },
  bank: { bn: 'ব্যাংক', en: 'bank' },
  loan_ref: { bn: 'ঋণ নং', en: 'loan no.' },
};
function plotNotFound(res) {
  return res.status(404).json({ error: 'Plot not found', code: 'PLOT_NOT_FOUND', bn: 'জমিটি পাওয়া যায়নি।', en: 'Plot not found.' });
}

// Rejects bad input with 400 before any rule runs. Bad input is not written to the ledger.
function invalid(res, fields) {
  return res.status(400).json({
    error: `Invalid or missing: ${fields.join(', ')}`,
    code: 'VALIDATION_ERROR', fields,
    bn: `তথ্য সঠিক নয় বা দেওয়া হয়নি: ${fields.map((f) => FIELD_LABEL[f].bn).join(', ')}।`,
    en: `Invalid or missing: ${fields.map((f) => FIELD_LABEL[f].en).join(', ')}.`,
  });
}

// The full list of checks behind an accepted sale. Besides checkSale's own checks it adds the two
// that ran elsewhere in this request: ledger verification (in guard) and "not smaller" (partialSale).
// "Not larger" + "not smaller" are shown together as one full-plot check.
function acceptedChecks(checks, plot, deedArea) {
  return [
    {
      code: 'LEDGER_VERIFIED', passed: true,
      bn: 'বিক্রয়ের আগে লেনদেনের ইতিহাস যাচাই হয়েছে (hash chain, ডিজিটাল স্বাক্ষর, checkpoint, রেকর্ড Ledger-এর সাথে মিলেছে)',
      en: 'Transaction history verified before this sale (hash chain, signatures, checkpoint, records match the ledger)',
    },
    ...checks.map((c) => (c.code !== 'AREA_NOT_EXCEEDED' ? c : {
      code: 'FULL_PLOT_AREA', passed: true,
      bn: `দলিলের পরিমাণ (${deedArea} শতক) খতিয়ানের পুরো পরিমাণের (${plot.area} শতক) সমান`,
      en: `Deed area (${deedArea}) equals the full recorded plot area (${plot.area})`,
    })),
  ];
}

// ---- Read ----
// Optional lookup by the official identifiers: /api/plots?mouza=Rampura&khatian_no=101&dag_no=124
// (any combination; case and extra spaces ignored). Without filters it returns all plots, as before.
const LOOKUP_FIELDS = ['mouza', 'khatian_no', 'dag_no'];
const norm = (v) => String(v).trim().toLowerCase();
app.get('/api/plots', (req, res) => {
  const filters = LOOKUP_FIELDS.filter((f) => typeof req.query[f] === 'string' && req.query[f].trim());
  res.json(db.get().plots.filter((p) => filters.every((f) => norm(p[f]) === norm(req.query[f]))));
});

app.get('/api/plots/:id', (req, res) => {
  const plot = findPlot(req.params.id);
  if (!plot) return plotNotFound(res);
  const disputed = disputedTxFor(plot.id);
  const risk = assessPlot(plot, activeTxFor(plot.id), ledger.verify(), disputed);
  res.json({
    plot, risk, history: ledger.forPlot(plot.id), active_transaction: activeTxFor(plot.id) || null,
    disputed_transaction: disputed || null,
    data_notice: 'DEMO/SAMPLE DATA - not verified official khatian records',
  });
});

app.get('/api/transactions', (req, res) => res.json(db.get().transactions));
app.get('/api/ledger', (req, res) => res.json(db.get().ledger));
app.get('/api/ledger/verify', (req, res) => res.json(ledger.verify()));
app.get('/api/ledger/public-key', (req, res) => res.json({ signer: keys.SIGNER, publicKey: keys.publicKey }));
app.get('/api/roles', (req, res) => res.json(rbac.describe()));
// Lets the UI show or hide the demo tools. Nothing secret is returned.
app.get('/api/config', (req, res) => res.json({ demo_mode: config.demoMode }));

// ---- Sale workflow ----
// 1) Initiate: run checks; if OK, lock the plot (Pending)
app.post('/api/sale/initiate', guard('sale.initiate'), (req, res) => {
  const plot_id = plotId(req.body.plot_id);
  const seller = name(req.body.seller);
  const buyer = name(req.body.buyer);
  const deed_no = ref(req.body.deed_no);
  const deed_area = area(req.body.deed_area);
  const bad = badFields({ plot_id, seller, buyer, deed_no, deed_area });
  if (bad.length) return invalid(res, bad);
  const plot = findPlot(plot_id);
  if (!plot) return plotNotFound(res);
  // Full-plot sales only (prototype). Unsupported request -> 400, nothing written to the ledger.
  const partial = partialSale(plot, deed_area);
  if (partial) return res.status(400).json({ error: partial.en, ...partial, plot_area: plot.area, deed_area });

  const usedDeedNos = db.get().transactions.map((t) => t.deed_no);
  const result = checkSale(plot, seller, deed_area, { buyer, deedNo: deed_no, usedDeedNos });
  if (!result.allowed) {
    ledger.append(plot.id, 'SALE_BLOCKED', { seller, buyer, deed_no, reasons: result.reasons.map((r) => r.code), by_role: req.role });
    return res.status(409).json({ blocked: true, ...result });
  }

  const tx = {
    id: db.get().transactions.length + 1,
    plot_id: plot.id, seller, buyer, deed_no, deed_area,
    reg_status: 'pending', mutation_status: 'pending', state: 'active',
    created_at: new Date().toISOString(),
  };
  db.get().transactions.push(tx);
  plot.status = 'Pending';
  db.save();
  ledger.append(plot.id, 'SALE_INITIATED', { tx_id: tx.id, seller, buyer, deed_no, deed_area: tx.deed_area, by_role: req.role });
  res.status(201).json({ blocked: false, ...result, checks: acceptedChecks(result.checks, plot, deed_area), not_checked: NOT_CHECKED, notice: RESULT_NOTICE, transaction: tx });
});

// 2) Registration done (deed registered, khatian not yet updated)
app.post('/api/sale/:id/register', guard('sale.register'), (req, res) => {
  const tx = activeTxOrError(req, res);
  if (!tx) return;
  if (tx.reg_status === 'done') return res.status(400).json({ error: 'Deed is already registered' });
  tx.reg_status = 'done';
  tx.reg_date = new Date().toISOString();
  db.save();
  ledger.append(tx.plot_id, 'REGISTRATION_DONE', { tx_id: tx.id, by_role: req.role });
  res.json(tx);
});

// 3) Mutation done: owner changes, plot unlocks, buyer is the new owner.
// This is the ONLY code path that changes current_owner (AC Land Officer only).
app.post('/api/sale/:id/mutate', guard('sale.mutate'), (req, res) => {
  const tx = activeTxOrError(req, res);
  if (!tx) return;
  if (tx.reg_status !== 'done') return res.status(400).json({ error: 'Registration must be completed before mutation' });
  const plot = findPlot(tx.plot_id);
  plot.current_owner = tx.buyer;
  plot.status = 'Free';
  tx.mutation_status = 'done';
  tx.mutation_date = new Date().toISOString();
  tx.state = 'completed';
  db.save();
  ledger.append(plot.id, 'MUTATION_DONE', { tx_id: tx.id, new_owner: tx.buyer, by_role: req.role });
  res.json({ transaction: tx, plot });
});

// 3b) Mutation rejected (AC Land Officer only): the deed stays registered, the owner does NOT change,
// and the plot is NOT unlocked. Transaction -> 'disputed', plot -> 'Disputed' (Red). Resolving a dispute
// (court order etc.) is outside this prototype.
app.post('/api/sale/:id/reject-mutation', guard('sale.reject_mutation'), (req, res) => {
  const tx = activeTxOrError(req, res);
  if (!tx) return;
  if (tx.reg_status !== 'done') return res.status(400).json({ error: 'Only a registered deed can have its mutation rejected. Cancel the sale instead.' });
  const reason = note(req.body.reason);
  if (!reason) return invalid(res, ['reason']);
  const plot = findPlot(tx.plot_id);
  plot.status = 'Disputed';
  tx.mutation_status = 'rejected';
  tx.state = 'disputed';
  tx.dispute_reason = reason;
  tx.mutation_date = new Date().toISOString();
  db.save();
  ledger.append(plot.id, 'MUTATION_REJECTED', { tx_id: tx.id, reason, by_role: req.role });
  res.json({ transaction: tx, plot });
});

// 4) Cancel: only BEFORE the deed is registered. Unlocks, owner unchanged.
// A registered deed cannot be cancelled here: otherwise the seller could sell the same plot again.
app.post('/api/sale/:id/cancel', guard('sale.cancel'), (req, res) => {
  const tx = activeTxOrError(req, res);
  if (!tx) return;
  if (tx.reg_status === 'done') {
    return res.status(409).json({
      error: 'A registered deed cannot be cancelled. Only the AC Land Officer can complete or reject the mutation.',
      code: 'REGISTERED_DEED_CANNOT_CANCEL',
      bn: 'দলিল ইতিমধ্যে নিবন্ধিত হয়েছে, তাই সাধারণভাবে বাতিল করা যাবে না। শুধু এসি ল্যান্ড অফিসার নামজারি সম্পন্ন বা বাতিল করতে পারবেন। জমিটি লক থাকবে।',
      en: 'The deed is already registered, so it cannot be cancelled here. Only the AC Land Officer can complete or reject the mutation. The plot stays locked.',
    });
  }
  const plot = findPlot(tx.plot_id);
  plot.status = 'Free';
  tx.state = 'cancelled';
  db.save();
  ledger.append(plot.id, 'SALE_CANCELLED', { tx_id: tx.id, by_role: req.role });
  res.json({ transaction: tx, plot });
});

// ---- Bank mortgage ----
app.post('/api/mortgage/create', guard('mortgage.create'), (req, res) => {
  const plot_id = plotId(req.body.plot_id);
  const owner = name(req.body.owner);
  const bank = name(req.body.bank);
  const loan_ref = ref(req.body.loan_ref);
  const bad = badFields({ plot_id, owner, bank, loan_ref });
  if (bad.length) return invalid(res, bad);
  const plot = findPlot(plot_id);
  if (!plot) return plotNotFound(res);

  const result = checkMortgage(plot, owner, bank);
  if (!result.allowed) {
    ledger.append(plot.id, 'MORTGAGE_BLOCKED', { owner, bank, loan_ref, reasons: result.reasons.map((x) => x.code), by_role: req.role });
    return res.status(409).json({ blocked: true, ...result });
  }
  plot.mortgage = { bank, loan_ref };
  db.save();
  ledger.append(plot.id, 'MORTGAGE_CREATED', { owner, bank, loan_ref, by_role: req.role });
  res.status(201).json({ blocked: false, ...result, mortgage: plot.mortgage });
});

// Release needs the loan number being released, so the wrong mortgage cannot be cleared by mistake.
app.post('/api/mortgage/release', guard('mortgage.release'), (req, res) => {
  const plot_id = plotId(req.body.plot_id);
  const loan_ref = ref(req.body.loan_ref);
  const bad = badFields({ plot_id, loan_ref });
  if (bad.length) return invalid(res, bad);
  const plot = findPlot(plot_id);
  if (!plot) return plotNotFound(res);
  if (!plot.mortgage) return res.status(400).json({ error: 'No mortgage on this plot' });
  if (norm(loan_ref) !== norm(plot.mortgage.loan_ref)) {
    return res.status(409).json({
      error: 'Loan number does not match the mortgage on this plot', code: 'LOAN_MISMATCH',
      bn: `ঋণ নং (${loan_ref}) এই জমির বন্ধকের সাথে মিলছে না। বন্ধক মুক্ত করা হয়নি।`,
      en: `Loan no. (${loan_ref}) does not match the mortgage on this plot. The mortgage was not released.`,
    });
  }
  const released = plot.mortgage;
  plot.mortgage = null;
  db.save();
  ledger.append(plot.id, 'MORTGAGE_RELEASED', { ...released, by_role: req.role });
  res.json({ released });
});

// ---- Dashboard: registered deeds waiting for mutation (including disputed ones) ----
app.get('/api/gap', (req, res) => {
  const now = Date.now();
  const rows = db.get().transactions
    .filter((t) => ['active', 'disputed'].includes(t.state) && t.reg_status === 'done' && t.mutation_status !== 'done')
    .map((t) => ({ ...t, days_waiting: Math.floor((now - new Date(t.reg_date).getTime()) / 86400000) }));
  res.json(rows);
});

// ---- Demo helpers (local hackathon demo only) ----
// They reset data and simulate an attacker editing the database directly, so they deliberately skip
// the role check. They exist ONLY when demo mode is explicitly enabled (LANDLOCK_DEMO_MODE=true or
// --demo) and never when NODE_ENV=production; otherwise every /api/dev/* request gets 404.
if (config.demoMode) {
app.post('/api/dev/reset', (req, res) => { ledger.reset(); res.json({ ok: true }); });

// Simulates someone editing an old database record behind the system's back
app.post('/api/dev/tamper', (req, res) => {
  const d = db.get();
  const target = d.ledger.find((e) => e.event_type === 'SALE_INITIATED');
  if (!target) return res.status(400).json({ error: 'Nothing to tamper with yet. Initiate a sale first.' });
  target.data.buyer = 'FORGED_BUYER';
  db.save();
  res.json({ tampered_entry: target.id });
});

// Smart attacker: edits an entry AND recomputes every hash after it, so the hash chain still looks valid.
// Only the digital signature can catch this.
app.post('/api/dev/tamper-smart', (req, res) => {
  const d = db.get();
  const idx = d.ledger.findIndex((e) => e.event_type === 'SALE_INITIATED');
  if (idx === -1) return res.status(400).json({ error: 'Nothing to tamper with yet. Initiate a sale first.' });
  d.ledger[idx].data.buyer = 'FORGED_BUYER';
  for (let i = idx; i < d.ledger.length; i++) {
    d.ledger[i].prev_hash = i === 0 ? '0'.repeat(64) : d.ledger[i - 1].hash;
    d.ledger[i].hash = ledger.computeHash(d.ledger[i].prev_hash, d.ledger[i]);
  }
  db.save();
  res.json({ tampered_entry: d.ledger[idx].id, note: 'hashes recomputed, signatures untouched' });
});

// More attacks for the integrity demo/tests. Each one edits the stored data behind the system's back.
const ATTACKS = {
  // change a plot's owner without any ledger event (bypassing registration + mutation)
  owner_change: (d) => { const p = d.plots.find((x) => x.id === 'P1'); p.current_owner = 'FORGED_OWNER'; return { plot: p.id }; },
  // replace the newest signature with a signature over different data
  bad_signature: (d) => { const e = d.ledger[d.ledger.length - 1]; e.signature = keys.sign('forged'); return { entry: e.id }; },
  // point the newest entry at the wrong previous hash
  break_link: (d) => { const e = d.ledger[d.ledger.length - 1]; e.prev_hash = 'f'.repeat(64); return { entry: e.id }; },
  // delete an entry from the middle and renumber the rest
  delete_middle: (d) => {
    if (d.ledger.length < 3) return null;
    const [gone] = d.ledger.splice(1, 1);
    d.ledger.forEach((e, i) => { e.id = i + 1; });
    return { deleted_entry: gone.id };
  },
  // delete the last entry (e.g. hide the newest sale)
  truncate_tail: (d) => (d.ledger.length < 2 ? null : { deleted_entry: d.ledger.pop().id }),
  // swap the last two entries
  reorder: (d) => {
    const n = d.ledger.length;
    if (n < 3) return null;
    [d.ledger[n - 2], d.ledger[n - 1]] = [d.ledger[n - 1], d.ledger[n - 2]];
    return { swapped: [d.ledger[n - 2].id, d.ledger[n - 1].id] };
  },
};
app.post('/api/dev/attack', (req, res) => {
  const attack = ATTACKS[req.body.type];
  if (!attack) return res.status(400).json({ error: `type must be one of: ${Object.keys(ATTACKS).join(', ')}` });
  const result = attack(db.get());
  if (!result) return res.status(400).json({ error: 'Not enough ledger entries yet. Run a sale first.' });
  db.save();
  res.json({ attack: req.body.type, ...result });
});
} else {
  app.use('/api/dev', (req, res) => res.status(404).json({
    error: 'Demo endpoints are disabled', code: 'DEMO_DISABLED',
    bn: 'ডেমো টুল বন্ধ আছে।', en: 'Demo tools are disabled on this server.',
  }));
}

// ---- Errors: always JSON, never a stack trace ----
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found', code: 'NOT_FOUND' }));
// Express treats a middleware as an error handler only when it takes 4 arguments, so `next` stays.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Request body is not valid JSON', code: 'INVALID_JSON',
      bn: 'অনুরোধের তথ্য সঠিক JSON নয়।', en: 'Request body is not valid JSON.',
    });
  }
  // Undo a write request that failed midway, so no half-finished change stays in memory or on disk.
  if (res.locals.rollback) db.restore(res.locals.rollback);
  // Log only the error kind: messages can contain file paths.
  console.error(`Request failed: ${req.method} ${req.path} (${err.code || err.name})`);
  res.status(500).json({
    error: 'Internal server error. The change was not saved.', code: 'SERVER_ERROR',
    bn: 'সার্ভারে সমস্যা হয়েছে। পরিবর্তনটি সংরক্ষণ করা হয়নি।', en: 'Server error. The change was not saved.',
  });
});

// Ctrl+C / stop: exit normally so the data-folder lock is released
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`LandLock API running on http://localhost:${PORT}`);
  if (config.demoMode) console.log('Demo mode ON: /api/dev/* reset and attack endpoints are enabled (local demo only).');
  else if (config.demoRequested) console.warn('Demo mode was requested but NODE_ENV=production: demo endpoints stay disabled.');
  else console.log('Demo mode OFF: /api/dev/* endpoints are disabled. Use "npm run demo" for the local demo.');
});