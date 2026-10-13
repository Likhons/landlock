// Runs the full demo story plus role and ledger-integrity tests: node test.js
// It starts its own server on a spare port with temporary data, key and checkpoint files,
// so your real data.json / keys.json are never touched and no second terminal is needed.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = process.env.TEST_PORT || 4100;
const base = `http://localhost:${PORT}/api`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'landlock-test-'));
const ENV = {
  LANDLOCK_DATA_DIR: path.join(TMP, 'data'),
  LANDLOCK_TRUST_DIR: path.join(TMP, 'trusted'),
  LANDLOCK_KEY_FILE: path.join(TMP, 'keys.json'),
};
fs.mkdirSync(ENV.LANDLOCK_DATA_DIR);
const DATA_FILE = path.join(ENV.LANDLOCK_DATA_DIR, 'data.json');
const CP_FILE = path.join(ENV.LANDLOCK_TRUST_DIR, 'checkpoint.json');

const BUYER = 'buyer', SR = 'sub_registrar', AC = 'ac_land';
const post = (p, b, role) => fetch(base + p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(role ? { 'X-Demo-Role': role } : {}) },
  body: JSON.stringify(b || {}),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (p) => fetch(base + p).then((r) => r.json());
const getText = (p) => fetch(base + p).then((r) => r.text());
let fails = 0;
const ok = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };
const info = (msg) => console.log('INFO ' + msg);
const section = (t) => console.log(`\n---- ${t} ----`);

let server;
async function start(extraEnv = {}) {
  server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT, ...ENV, ...extraEnv }, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await get('/roles'); return; } catch (e) { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error('Test server did not start');
}
async function stop() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise((r) => server.once('exit', r));
  server.kill();
  await exited;
}
const readData = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeData = (d) => fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

async function storyTests() {
  section('Existing demo story (sale, mortgage, survey, tamper)');
  await post('/dev/reset');

  let r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-1001', deed_area: 10 }, SR);
  ok('1. Valid sale accepted, plot locked', r.status === 201 && !r.body.blocked);
  const txId = r.body.transaction.id;

  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Salam', deed_no: 'D-1002', deed_area: 10 }, SR);
  ok('2. Double-sell blocked (PLOT_LOCKED)', r.status === 409 && r.body.reasons.some((x) => x.code === 'PLOT_LOCKED'));

  await post(`/sale/${txId}/register`, {}, SR);
  let p = await get('/plots/P1');
  ok('3. Registered but not mutated -> Yellow', p.risk.level === 'yellow' && p.risk.reasons[0].code === 'REG_NOT_MUTATED');
  ok('4. Gap dashboard lists the deed', (await get('/gap')).length === 1);

  await post(`/sale/${txId}/mutate`, {}, AC);
  p = await get('/plots/P1');
  ok('5. After mutation: Karim owns, plot Free, Green', p.plot.current_owner === 'Karim' && p.plot.status === 'Free' && p.risk.level === 'green');

  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Salam', deed_no: 'D-1003', deed_area: 10 }, SR);
  ok('6. Old owner can no longer sell (NOT_OWNER)', r.status === 409 && r.body.reasons.some((x) => x.code === 'NOT_OWNER'));

  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Karim', buyer: 'Salam', deed_no: 'D-1004', deed_area: 10 }, SR);
  ok('7. New owner can sell normally', r.status === 201);
  await post(`/sale/${r.body.transaction.id}/cancel`, {}, SR);

  r = await post('/sale/initiate', { plot_id: 'P2', seller: 'Karim', buyer: 'Jamal', deed_no: 'D-2001', deed_area: 50 }, SR);
  ok('8. Deed area > khatian area blocked', r.status === 409 && r.body.reasons.some((x) => x.code === 'AREA_EXCEEDS'));

  ok('9. Ledger intact before tampering', (await get('/ledger/verify')).valid === true);
  await post('/dev/tamper');
  const v = await get('/ledger/verify');
  ok('10. Tampering detected', v.valid === false);
  p = await get('/plots/P1');
  ok('11. Plot page shows Red when ledger tampered', p.risk.level === 'red');

  // Smart attacker: recomputes hashes, but cannot forge the registrar's signature
  await post('/dev/reset');
  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-1', deed_area: 10 }, SR);
  await post(`/sale/${r.body.transaction.id}/register`, {}, SR);
  ok('12. Fresh ledger is valid and signed', (await get('/ledger/verify')).valid === true);
  await post('/dev/tamper-smart');
  const v2 = await get('/ledger/verify');
  ok('13. Hash-recompute attack caught by SIGNATURE', v2.valid === false && v2.kind === 'signature');

  await post('/dev/reset');
  // ---- Bank mortgage ----
  r = await post('/mortgage/create', { plot_id: 'P2', owner: 'Karim', bank: 'Sonali Bank', loan_ref: 'LN-1' }, SR);
  ok('14. Mortgage registered on a free plot', r.status === 201);
  r = await post('/mortgage/create', { plot_id: 'P2', owner: 'Karim', bank: 'Rupali Bank', loan_ref: 'LN-2' }, SR);
  ok('15. Double mortgage blocked', r.status === 409 && r.body.reasons.some((x) => x.code === 'DOUBLE_MORTGAGE'));
  r = await post('/sale/initiate', { plot_id: 'P2', seller: 'Karim', buyer: 'Salam', deed_no: 'D-9', deed_area: 8 }, SR);
  ok('16. Sale on mortgaged plot blocked', r.status === 409 && r.body.reasons.some((x) => x.code === 'PLOT_MORTGAGED'));
  p = await get('/plots/P2');
  ok('17. Mortgaged plot shows Yellow', p.risk.level === 'yellow' && p.risk.reasons.some((x) => x.code === 'MORTGAGED'));
  await post('/sale/initiate', { plot_id: 'P3', seller: 'Salma', buyer: 'Hasan', deed_no: 'D-10', deed_area: 15 }, SR);
  r = await post('/mortgage/create', { plot_id: 'P3', owner: 'Salma', bank: 'Sonali Bank', loan_ref: 'LN-3' }, SR);
  ok('18. Mortgage blocked while a sale is in progress', r.status === 409 && r.body.reasons.some((x) => x.code === 'SALE_IN_PROGRESS'));
  r = await post('/mortgage/create', { plot_id: 'P5', owner: 'Someone Else', bank: 'Sonali Bank', loan_ref: 'LN-4' }, SR);
  ok('19. Mortgage by a non-owner blocked', r.status === 409 && r.body.reasons.some((x) => x.code === 'NOT_OWNER'));
  await post('/mortgage/release', { plot_id: 'P2' }, SR);
  r = await post('/sale/initiate', { plot_id: 'P2', seller: 'Karim', buyer: 'Salam', deed_no: 'D-11', deed_area: 8 }, SR);
  ok('20. After release the plot can be sold', r.status === 201);
  ok('21. Ledger still valid after all events', (await get('/ledger/verify')).valid === true);
  await post('/dev/reset');

  // ---- Survey chain ----
  p = await get('/plots/P2');
  ok('22. Unexplained survey ownership change flagged (P2)', p.risk.reasons.some((x) => x.code === 'UNEXPLAINED_CHANGE'));
  p = await get('/plots/P3');
  ok('23. Area increase between surveys flagged (P3)', p.risk.reasons.some((x) => x.code === 'AREA_INCREASED'));
  p = await get('/plots/P1');
  ok('24. Clean survey chain not flagged (P1 stays Green)', p.risk.level === 'green');
  r = await post('/sale/initiate', { plot_id: 'P2', seller: 'Karim', buyer: 'Jamal', deed_no: 'D-20', deed_area: 8 }, SR);
  ok('25. Survey warnings do not block a valid sale', r.status === 201);
  await post('/dev/reset');
}

async function roleTests() {
  section('Role-based access control (enforced by the API)');
  await post('/dev/reset');
  const sale = { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-R1', deed_area: 10 };
  const ledgerLen = async () => (await get('/ledger')).length;
  const denied = (r) => r.status === 403 && r.body.code === 'PERMISSION_DENIED' && r.body.bn && r.body.en;

  const before = await ledgerLen();
  let r = await post('/sale/initiate', sale, BUYER);
  ok('R1. Buyer cannot start a sale (403)', denied(r));
  r = await post('/sale/initiate', sale);
  ok('R2. No role header = Buyer (least privilege), sale denied', denied(r) && r.body.role === 'buyer');
  r = await post('/sale/initiate', sale, 'admin');
  ok('R3. Unknown role rejected (400)', r.status === 400 && r.body.code === 'UNKNOWN_ROLE');
  r = await post('/sale/initiate', sale, AC);
  ok('R4. AC Land Officer cannot start a sale (403)', denied(r));
  ok('R5. Denied attempts write nothing to the ledger', (await ledgerLen()) === before && (await get('/plots/P1')).plot.status === 'Free');

  r = await post('/sale/initiate', sale, SR);
  ok('R6. Sub-Registrar starts a valid sale (201)', r.status === 201);
  const txId = r.body.transaction.id;

  r = await post(`/sale/${txId}/register`, {}, BUYER);
  ok('R7. Buyer cannot register the deed (403)', denied(r));
  r = await post(`/sale/${txId}/register`, {}, AC);
  ok('R8. AC Land Officer cannot register the deed (403)', denied(r));
  r = await post(`/sale/${txId}/register`, {}, SR);
  ok('R9. Sub-Registrar registers the deed (200)', r.status === 200 && r.body.reg_status === 'done');

  r = await post(`/sale/${txId}/mutate`, {}, BUYER);
  ok('R10. Buyer cannot perform mutation (403)', denied(r));
  r = await post(`/sale/${txId}/mutate`, {}, SR);
  ok('R11. Sub-Registrar cannot perform mutation (403)', denied(r));
  ok('R12. Owner unchanged after denied mutations', (await get('/plots/P1')).plot.current_owner === 'Rahim');
  r = await post(`/sale/${txId}/mutate`, {}, AC);
  ok('R13. AC Land Officer performs a valid mutation (200)', r.status === 200 && r.body.plot.current_owner === 'Karim');
  const hist = (await get('/plots/P1')).history;
  ok('R14. Ledger records who acted', hist.find((h) => h.event_type === 'MUTATION_DONE').data.by_role === AC
    && hist.find((h) => h.event_type === 'REGISTRATION_DONE').data.by_role === SR);

  r = await post('/sale/initiate', { ...sale, seller: 'Karim', deed_no: 'D-R2' }, SR);
  const tx2 = r.body.transaction.id;
  ok('R15. Buyer / AC Land cannot cancel a sale (403)', denied(await post(`/sale/${tx2}/cancel`, {}, BUYER)) && denied(await post(`/sale/${tx2}/cancel`, {}, AC)));
  ok('R16. Sub-Registrar can cancel a sale', (await post(`/sale/${tx2}/cancel`, {}, SR)).status === 200);

  const mort = { plot_id: 'P5', owner: 'Nasrin', bank: 'Sonali Bank', loan_ref: 'LN-R' };
  ok('R17. Buyer / AC Land cannot register a mortgage (403)', denied(await post('/mortgage/create', mort, BUYER)) && denied(await post('/mortgage/create', mort, AC)));
  ok('R18. Sub-Registrar registers a mortgage', (await post('/mortgage/create', mort, SR)).status === 201);
  ok('R19. Buyer cannot release a mortgage (403)', denied(await post('/mortgage/release', { plot_id: 'P5' }, BUYER)));

  const reads = await Promise.all(['/plots', '/plots/P4', '/ledger', '/ledger/verify', '/gap', '/transactions', '/roles'].map(get));
  ok('R20. Buyer can read plots, mortgage, survey history, ledger', reads.every(Boolean)
    && reads[1].plot.mortgage && reads[1].plot.survey.length === 4 && reads[3].valid === true);
  ok('R21. Plot API labels survey data as DEMO/SAMPLE', /DEMO\/SAMPLE/.test(reads[1].data_notice));
  ok('R22. Ledger valid after the whole role workflow', reads[3].valid === true);
}

async function integrityTests() {
  section('Ledger integrity (live server, attacker edits the stored data)');
  // Build a ledger with a few events: GENESIS, SALE_INITIATED, REGISTRATION_DONE, MUTATION_DONE, MORTGAGE_CREATED
  const setup = async () => {
    await post('/dev/reset');
    const r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-I1', deed_area: 10 }, SR);
    await post(`/sale/${r.body.transaction.id}/register`, {}, SR);
    await post(`/sale/${r.body.transaction.id}/mutate`, {}, AC);
    await post('/mortgage/create', { plot_id: 'P5', owner: 'Nasrin', bank: 'Sonali Bank', loan_ref: 'LN-I' }, SR);
  };
  const attackThenVerify = async (type) => { await setup(); await post('/dev/attack', { type }); return get('/ledger/verify'); };

  await setup();
  const snap = await get('/ledger');
  ok('I1. Ledger starts with a signed GENESIS entry', snap[0].event_type === 'GENESIS' && snap[0].id === 1 && Boolean(snap[0].signature));
  await post('/mortgage/release', { plot_id: 'P5' }, SR);
  const after = await get('/ledger');
  ok('I2. Normal operations only append (old entries unchanged)', after.length === snap.length + 1
    && JSON.stringify(after.slice(0, snap.length)) === JSON.stringify(snap));

  await setup(); await post('/dev/tamper');
  let v = await get('/ledger/verify');
  ok('I3. Modified record detected (hash)', !v.valid && v.kind === 'hash');
  v = await attackThenVerify('bad_signature');
  ok('I4. Invalid signature detected', !v.valid && v.kind === 'signature');
  v = await attackThenVerify('break_link');
  ok('I5. Broken previous-hash link detected', !v.valid && v.kind === 'link');
  v = await attackThenVerify('delete_middle');
  ok('I6. Deleted middle entry detected', !v.valid && v.kind === 'link');
  v = await attackThenVerify('reorder');
  ok('I7. Reordered entries detected', !v.valid && ['sequence', 'link'].includes(v.kind));
  v = await attackThenVerify('truncate_tail');
  ok('I8. Deleted ledger tail detected (trusted checkpoint)', !v.valid && v.kind === 'truncation');
  ok('I9. Writes refused while the ledger is broken (423)', (await post('/mortgage/release', { plot_id: 'P5' }, SR)).status === 423);

  v = await attackThenVerify('owner_change');
  ok('I10. Direct current_owner change detected (state replay)', !v.valid && v.kind === 'state' && /P1/.test(v.reason));
  ok('I11. Plot page turns Red after direct owner change', (await get('/plots/P1')).risk.level === 'red');
  const r = await post('/sale/initiate', { plot_id: 'P1', seller: 'FORGED_OWNER', buyer: 'X', deed_no: 'D-F', deed_area: 10 }, SR);
  ok('I12. Forged owner cannot sell: write refused (423)', r.status === 423 && r.body.code === 'INTEGRITY_FAILED');

  await post('/dev/reset');
  ok('I13. Reset gives a valid ledger again', (await get('/ledger/verify')).valid === true);

  const texts = await Promise.all(['/plots', '/plots/P1', '/ledger', '/ledger/verify', '/ledger/public-key', '/roles', '/transactions', '/gap'].map(getText));
  ok('I14. No API response contains a private key', texts.every((t) => !/PRIVATE KEY/.test(t)) && /PUBLIC KEY/.test(texts[4]));
}

async function restartTests() {
  section('Integrity across restarts (data.json edited while the server is stopped)');
  const prepare = async () => {
    await post('/dev/reset');
    const r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-S1', deed_area: 10 }, SR);
    await post(`/sale/${r.body.transaction.id}/register`, {}, SR);
    await stop();
  };

  await prepare();
  let d = readData(); d.ledger.pop(); writeData(d);
  await start();
  let v = await get('/ledger/verify');
  ok('S1. Tail deleted on disk while stopped -> truncation detected after restart', !v.valid && v.kind === 'truncation');

  await prepare();
  d = readData(); d.plots.find((p) => p.id === 'P2').current_owner = 'FORGED_OWNER'; writeData(d);
  await start();
  v = await get('/ledger/verify');
  ok('S2. Owner edited on disk -> detected after restart', !v.valid && v.kind === 'state' && /P2/.test(v.reason));

  await prepare();
  d = readData(); d.plots.find((p) => p.id === 'P2').survey[2].source = 'sale'; writeData(d);
  await start();
  v = await get('/ledger/verify');
  ok('S3. Survey history edited on disk -> detected', !v.valid && v.kind === 'state');

  await prepare();
  d = readData(); d.ledger.shift(); d.ledger.forEach((e, i) => { e.id = i + 1; }); writeData(d);
  await start();
  v = await get('/ledger/verify');
  ok('S4. GENESIS entry removed -> detected', !v.valid && v.kind === 'genesis');

  await prepare();
  fs.unlinkSync(CP_FILE);
  await start();
  v = await get('/ledger/verify');
  ok('S5. Checkpoint deleted -> ledger reported as unverifiable', !v.valid && v.kind === 'checkpoint');
  await post('/dev/reset');
  ok('S6. Reset recovers with a new checkpoint', (await get('/ledger/verify')).valid === true);

  // Known limitation: rolling BOTH files back to an older consistent copy is not detectable locally.
  await post('/dev/reset');
  await stop();
  const oldData = fs.readFileSync(DATA_FILE), oldCp = fs.readFileSync(CP_FILE);
  await start();
  const r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-S2', deed_area: 10 }, SR);
  await stop();
  fs.writeFileSync(DATA_FILE, oldData); fs.writeFileSync(CP_FILE, oldCp);
  await start();
  v = await get('/ledger/verify');
  info(`Known limitation: rollback of data.json AND checkpoint.json together ${v.valid ? 'is NOT detected' : 'was detected'} (sale ${r.status}). Needs an external witness.`);

  await stop();
  await start({ LANDLOCK_EXTRA_GRANTS: 'sub_registrar:sale.mutate' });
  await post('/dev/reset');
  const s = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-S3', deed_area: 10 }, SR);
  await post(`/sale/${s.body.transaction.id}/register`, {}, SR);
  const m = await post(`/sale/${s.body.transaction.id}/mutate`, {}, SR);
  ok('S7. Explicit server-side grant lets Sub-Registrar mutate', m.status === 200 && (await get('/ledger/verify')).valid === true);
  await stop();
}

(async () => {
  try {
    await start();
    await storyTests();
    await roleTests();
    await integrityTests();
    await restartTests();
  } catch (e) {
    fails++;
    console.log('FAIL test run crashed:', e.message);
  } finally {
    await stop();
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  console.log(fails ? `\n${fails} test(s) FAILED` : '\nAll tests passed');
  process.exitCode = fails ? 1 : 0;
})();
