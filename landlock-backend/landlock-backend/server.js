const express = require('express');
const cors = require('cors');
const db = require('./db');
const ledger = require('./ledger');
const keys = require('./keys');
const { checkSale, checkMortgage, assessPlot } = require('./rules');

const app = express();
app.use(cors());
app.use(express.json());

const findPlot = (id) => db.get().plots.find((p) => p.id === id);
const findTx = (id) => db.get().transactions.find((t) => t.id === Number(id));
const activeTxFor = (plot_id) =>
  db.get().transactions.find((t) => t.plot_id === plot_id && t.state === 'active');

// ---- Read ----
app.get('/api/plots', (req, res) => res.json(db.get().plots));

app.get('/api/plots/:id', (req, res) => {
  const plot = findPlot(req.params.id);
  if (!plot) return res.status(404).json({ error: 'Plot not found' });
  const risk = assessPlot(plot, activeTxFor(plot.id), ledger.verify());
  res.json({ plot, risk, history: ledger.forPlot(plot.id), active_transaction: activeTxFor(plot.id) || null });
});

app.get('/api/transactions', (req, res) => res.json(db.get().transactions));
app.get('/api/ledger', (req, res) => res.json(db.get().ledger));
app.get('/api/ledger/verify', (req, res) => res.json(ledger.verify()));
app.get('/api/ledger/public-key', (req, res) => res.json({ signer: keys.SIGNER, publicKey: keys.publicKey }));

// ---- Sale workflow ----
// 1) Initiate: run checks; if OK, lock the plot (Pending)
app.post('/api/sale/initiate', (req, res) => {
  const { plot_id, seller, buyer, deed_no, deed_area } = req.body;
  const plot = findPlot(plot_id);
  if (!plot) return res.status(404).json({ error: 'Plot not found' });
  if (!seller || !buyer || !deed_no || !deed_area) {
    return res.status(400).json({ error: 'plot_id, seller, buyer, deed_no, deed_area are required' });
  }

  const result = checkSale(plot, seller, deed_area);
  if (!result.allowed) {
    ledger.append(plot.id, 'SALE_BLOCKED', { seller, buyer, deed_no, reasons: result.reasons.map((r) => r.code) });
    return res.status(409).json({ blocked: true, ...result });
  }

  const tx = {
    id: db.get().transactions.length + 1,
    plot_id: plot.id, seller, buyer, deed_no, deed_area: Number(deed_area),
    reg_status: 'pending', mutation_status: 'pending', state: 'active',
    created_at: new Date().toISOString(),
  };
  db.get().transactions.push(tx);
  plot.status = 'Pending';
  db.save();
  ledger.append(plot.id, 'SALE_INITIATED', { tx_id: tx.id, seller, buyer, deed_no, deed_area: tx.deed_area });
  res.status(201).json({ blocked: false, ...result, transaction: tx });
});

// 2) Registration done (deed registered, khatian not yet updated)
app.post('/api/sale/:id/register', (req, res) => {
  const tx = findTx(req.params.id);
  if (!tx || tx.state !== 'active') return res.status(404).json({ error: 'Active transaction not found' });
  tx.reg_status = 'done';
  tx.reg_date = new Date().toISOString();
  db.save();
  ledger.append(tx.plot_id, 'REGISTRATION_DONE', { tx_id: tx.id });
  res.json(tx);
});

// 3) Mutation done: owner changes, plot unlocks, buyer is the new owner
app.post('/api/sale/:id/mutate', (req, res) => {
  const tx = findTx(req.params.id);
  if (!tx || tx.state !== 'active') return res.status(404).json({ error: 'Active transaction not found' });
  if (tx.reg_status !== 'done') return res.status(400).json({ error: 'Registration must be completed before mutation' });
  const plot = findPlot(tx.plot_id);
  plot.current_owner = tx.buyer;
  plot.status = 'Free';
  tx.mutation_status = 'done';
  tx.mutation_date = new Date().toISOString();
  tx.state = 'completed';
  db.save();
  ledger.append(plot.id, 'MUTATION_DONE', { tx_id: tx.id, new_owner: tx.buyer });
  res.json({ transaction: tx, plot });
});

// 4) Cancel: unlock, owner unchanged
app.post('/api/sale/:id/cancel', (req, res) => {
  const tx = findTx(req.params.id);
  if (!tx || tx.state !== 'active') return res.status(404).json({ error: 'Active transaction not found' });
  const plot = findPlot(tx.plot_id);
  plot.status = 'Free';
  tx.state = 'cancelled';
  db.save();
  ledger.append(plot.id, 'SALE_CANCELLED', { tx_id: tx.id });
  res.json({ transaction: tx, plot });
});

// ---- Bank mortgage ----
app.post('/api/mortgage/create', (req, res) => {
  const { plot_id, owner, bank, loan_ref } = req.body;
  const plot = findPlot(plot_id);
  if (!plot) return res.status(404).json({ error: 'Plot not found' });
  if (!owner || !bank || !loan_ref) return res.status(400).json({ error: 'owner, bank, loan_ref are required' });

  const result = checkMortgage(plot, owner, bank);
  if (!result.allowed) {
    ledger.append(plot.id, 'MORTGAGE_BLOCKED', { owner, bank, loan_ref, reasons: result.reasons.map((x) => x.code) });
    return res.status(409).json({ blocked: true, ...result });
  }
  plot.mortgage = { bank, loan_ref };
  db.save();
  ledger.append(plot.id, 'MORTGAGE_CREATED', { owner, bank, loan_ref });
  res.status(201).json({ blocked: false, ...result, mortgage: plot.mortgage });
});

app.post('/api/mortgage/release', (req, res) => {
  const plot = findPlot(req.body.plot_id);
  if (!plot) return res.status(404).json({ error: 'Plot not found' });
  if (!plot.mortgage) return res.status(400).json({ error: 'No mortgage on this plot' });
  const released = plot.mortgage;
  plot.mortgage = null;
  db.save();
  ledger.append(plot.id, 'MORTGAGE_RELEASED', released);
  res.json({ released });
});

// ---- Dashboard: registered deeds waiting for mutation ----
app.get('/api/gap', (req, res) => {
  const now = Date.now();
  const rows = db.get().transactions
    .filter((t) => t.state === 'active' && t.reg_status === 'done' && t.mutation_status !== 'done')
    .map((t) => ({ ...t, days_waiting: Math.floor((now - new Date(t.reg_date).getTime()) / 86400000) }));
  res.json(rows);
});

// ---- Demo helpers (for the video/demo only) ----
app.post('/api/dev/reset', (req, res) => { db.reset(); res.json({ ok: true }); });

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`LandLock API running on http://localhost:${PORT}`));