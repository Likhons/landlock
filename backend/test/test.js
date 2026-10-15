// Runs the full demo story plus role and ledger-integrity tests: node test.js
// It starts its own server on a spare port with temporary data, key and checkpoint files,
// so your real data.json / keys.json are never touched and no second terminal is needed.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SERVER = path.join(__dirname, '..', 'src', 'server.js');
const PORT = process.env.TEST_PORT || 4100;
const base = `http://localhost:${PORT}/api`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'landlock-test-'));
// Every setting is explicit, so a local backend/.env cannot change what the tests see.
// Demo mode is switched on deliberately: the tests use /api/dev/reset and the attack endpoints.
const ENV = {
  LANDLOCK_DATA_DIR: path.join(TMP, 'data'),
  LANDLOCK_TRUST_DIR: path.join(TMP, 'trusted'),
  LANDLOCK_KEY_FILE: path.join(TMP, 'keys.json'),
  LANDLOCK_DEMO_MODE: 'true',
  NODE_ENV: 'development',
  LANDLOCK_REQUIRE_KEY: 'false',
  LANDLOCK_EXTRA_GRANTS: '',
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
let serverLog = ''; // everything the test servers print, checked for leaked secrets/paths
async function start(extraEnv = {}, args = []) {
  server = spawn(process.execPath, [SERVER, ...args], {
    env: { ...process.env, PORT, ...ENV, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (c) => { serverLog += c; });
  server.stderr.on('data', (c) => { serverLog += c; });
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
  ok('4. Gap dashboard lists the deed', (await get('/gap')).filter((g) => !g.source).length === 1);

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
  await post('/mortgage/release', { plot_id: 'P2', loan_ref: 'LN-1' }, SR);
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

  r = await post('/sale/initiate', { ...sale, seller: 'Karim', buyer: 'Salam', deed_no: 'D-R2' }, SR);
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

async function validationTests() {
  section('Input validation and clear errors');
  await post('/dev/reset');
  const sale = { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-V1', deed_area: 10 };
  const ledgerLen = async () => (await get('/ledger')).length;
  const invalid = (r, field) => r.status === 400 && r.body.code === 'VALIDATION_ERROR' && r.body.fields.includes(field) && r.body.bn && r.body.en;
  const before = await ledgerLen();

  ok('V1. Deed area "abc" rejected (400)', invalid(await post('/sale/initiate', { ...sale, deed_area: 'abc' }, SR), 'deed_area'));
  ok('V2. Negative deed area rejected (400)', invalid(await post('/sale/initiate', { ...sale, deed_area: -5 }, SR), 'deed_area'));
  ok('V3. Zero / empty / boolean deed area rejected', invalid(await post('/sale/initiate', { ...sale, deed_area: 0 }, SR), 'deed_area')
    && invalid(await post('/sale/initiate', { ...sale, deed_area: '' }, SR), 'deed_area')
    && invalid(await post('/sale/initiate', { ...sale, deed_area: true }, SR), 'deed_area'));
  ok('V4. Missing or blank buyer rejected', invalid(await post('/sale/initiate', { ...sale, buyer: undefined }, SR), 'buyer')
    && invalid(await post('/sale/initiate', { ...sale, buyer: '   ' }, SR), 'buyer'));
  ok('V5. Invalid input writes nothing (plot Free, ledger unchanged)', (await ledgerLen()) === before && (await get('/plots/P1')).plot.status === 'Free');

  let r = await post('/sale/initiate', { ...sale, buyer: 'Rahim' }, SR);
  ok('V6. Buyer same as seller blocked (SAME_PARTY)', r.status === 409 && r.body.reasons.some((x) => x.code === 'SAME_PARTY'));

  r = await post('/sale/initiate', { ...sale, seller: '  Rahim ', buyer: ' Karim', deed_area: '10' }, SR);
  ok('V7. Extra spaces trimmed, numeric text area accepted', r.status === 201 && r.body.transaction.seller === 'Rahim'
    && r.body.transaction.buyer === 'Karim' && r.body.transaction.deed_area === 10);

  r = await post('/sale/initiate', { plot_id: 'P5', seller: 'Nasrin', buyer: 'Hasan', deed_no: ' d-v1 ', deed_area: 20 }, SR);
  ok('V8. Same deed number on another plot blocked (DUPLICATE_DEED)', r.status === 409 && r.body.reasons.some((x) => x.code === 'DUPLICATE_DEED'));

  const raw = await fetch(`${base}/sale/initiate`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-Role': SR }, body: '{bad' });
  const rawText = await raw.text();
  ok('V9. Malformed JSON gives a clean JSON 400 (no stack trace)', raw.status === 400 && JSON.parse(rawText).code === 'INVALID_JSON' && !/\bat /.test(rawText));
  const nf = await fetch(`${base}/no-such-endpoint`);
  ok('V10. Unknown API route gives JSON 404', nf.status === 404 && (await nf.json()).code === 'NOT_FOUND');

  ok('V11. Mortgage with blank bank rejected (400)', invalid(await post('/mortgage/create', { plot_id: 'P5', owner: 'Nasrin', bank: ' ', loan_ref: 'LN-V' }, SR), 'bank'));
  ok('V12. Ledger valid after blocked/invalid attempts (replay uses the same rules)', (await get('/ledger/verify')).valid === true);
  await post('/dev/reset');
}

async function disputeTests() {
  section('Registered deed: no cancel, AC Land completes or rejects (Disputed)');
  await post('/dev/reset');
  const plot = async (id) => get(`/plots/${id}`);

  // Regression: the old bug let a registered deed be cancelled and the seller sell again
  let r = await post('/sale/initiate', { plot_id: 'P5', seller: 'Nasrin', buyer: 'Buyer1', deed_no: 'D-X1', deed_area: 20 }, SR);
  const tx1 = r.body.transaction.id;
  await post(`/sale/${tx1}/register`, {}, SR);
  r = await post(`/sale/${tx1}/cancel`, {}, SR);
  ok('X1. Sub-Registrar cannot cancel a registered deed (409)', r.status === 409 && r.body.code === 'REGISTERED_DEED_CANNOT_CANCEL' && r.body.bn && r.body.en);
  let p = await plot('P5');
  ok('X2. After the refused cancel: plot still Pending, sale still active, owner unchanged',
    p.plot.status === 'Pending' && p.active_transaction && p.active_transaction.id === tx1 && p.plot.current_owner === 'Nasrin');
  r = await post('/sale/initiate', { plot_id: 'P5', seller: 'Nasrin', buyer: 'Buyer2', deed_no: 'D-X2', deed_area: 20 }, SR);
  ok('X3. Seller cannot sell the registered plot again (old double-sell bug)', r.status === 409 && r.body.reasons.some((x) => x.code === 'PLOT_LOCKED'));
  ok('X4. AC Land / Buyer cannot use cancel either (403)',
    (await post(`/sale/${tx1}/cancel`, {}, AC)).status === 403 && (await post(`/sale/${tx1}/cancel`, {}, BUYER)).status === 403);

  r = await post(`/sale/${tx1}/reject-mutation`, { reason: 'Seller signature disputed' }, SR);
  ok('X5. Sub-Registrar cannot reject a mutation (403)', r.status === 403 && r.body.code === 'PERMISSION_DENIED');
  ok('X6. Buyer cannot reject a mutation (403)', (await post(`/sale/${tx1}/reject-mutation`, { reason: 'x' }, BUYER)).status === 403);
  r = await post(`/sale/${tx1}/reject-mutation`, { reason: '   ' }, AC);
  ok('X7. Rejection needs a reason (400)', r.status === 400 && r.body.fields.includes('reason'));

  const u = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-X3', deed_area: 10 }, SR);
  r = await post(`/sale/${u.body.transaction.id}/reject-mutation`, { reason: 'x' }, AC);
  ok('X8. Cannot reject the mutation of an unregistered deed (400)', r.status === 400);
  ok('X9. Unregistered sale can still be cancelled normally', (await post(`/sale/${u.body.transaction.id}/cancel`, {}, SR)).status === 200
    && (await plot('P1')).plot.status === 'Free');

  r = await post(`/sale/${tx1}/reject-mutation`, { reason: 'Seller signature disputed' }, AC);
  ok('X10. AC Land Officer rejects the mutation (200), transaction disputed',
    r.status === 200 && r.body.transaction.state === 'disputed' && r.body.transaction.mutation_status === 'rejected');
  p = await plot('P5');
  ok('X11. Plot Disputed, owner unchanged, NOT unlocked', p.plot.status === 'Disputed' && p.plot.current_owner === 'Nasrin');
  const dr = p.risk.reasons.find((x) => x.code === 'PLOT_DISPUTED');
  ok('X12. Risk is Red with the reason in Bangla and English', p.risk.level === 'red' && dr && /Seller signature disputed/.test(dr.en) && /Seller signature disputed/.test(dr.bn));
  ok('X13. Plot API returns the disputed transaction', p.disputed_transaction && p.disputed_transaction.id === tx1 && p.active_transaction === null);

  r = await post('/sale/initiate', { plot_id: 'P5', seller: 'Nasrin', buyer: 'Buyer3', deed_no: 'D-X4', deed_area: 20 }, SR);
  ok('X14. Previous seller cannot sell the disputed plot (PLOT_DISPUTED)', r.status === 409 && r.body.reasons.some((x) => x.code === 'PLOT_DISPUTED'));
  r = await post('/sale/initiate', { plot_id: 'P5', seller: 'Buyer1', buyer: 'Buyer3', deed_no: 'D-X5', deed_area: 20 }, SR);
  ok('X15. Deed buyer cannot sell it either', r.status === 409 && r.body.reasons.some((x) => x.code === 'PLOT_DISPUTED'));
  r = await post('/mortgage/create', { plot_id: 'P5', owner: 'Nasrin', bank: 'Sonali Bank', loan_ref: 'LN-X' }, SR);
  ok('X16. Mortgage on the disputed plot blocked', r.status === 409 && r.body.reasons.some((x) => x.code === 'PLOT_DISPUTED'));
  const tryStep = (step, role) => post(`/sale/${tx1}/${step}`, step === 'reject-mutation' ? { reason: 'again' } : {}, role);
  const steps = await Promise.all([tryStep('mutate', AC), tryStep('cancel', SR), tryStep('register', SR), tryStep('reject-mutation', AC)]);
  ok('X17. No further step on a disputed transaction (409 TX_DISPUTED)', steps.every((s) => s.status === 409 && s.body.code === 'TX_DISPUTED'));
  ok('X18. Gap dashboard still lists the disputed deed', (await get('/gap')).some((g) => g.id === tx1 && g.state === 'disputed'));
  const hist = p.history.find((h) => h.event_type === 'MUTATION_REJECTED');
  ok('X19. Signed MUTATION_REJECTED event records role and reason', hist && hist.signature && hist.data.by_role === AC && hist.data.reason === 'Seller signature disputed');
  ok('X20. Ledger valid (replay agrees with the disputed state)', (await get('/ledger/verify')).valid === true);

  // Restart: disputed state survives, and a silent unlock edited into data.json is caught
  await stop(); await start();
  p = await plot('P5');
  ok('X21. After restart: still Disputed and ledger valid', p.plot.status === 'Disputed' && (await get('/ledger/verify')).valid === true);
  await stop();
  const d = readData();
  d.plots.find((x) => x.id === 'P5').status = 'Free';
  d.transactions.find((t) => t.id === tx1).state = 'cancelled';
  writeData(d);
  await start();
  const v = await get('/ledger/verify');
  ok('X22. Silently unlocking the disputed plot in data.json is detected', !v.valid && v.kind === 'state');
  r = await post('/sale/initiate', { plot_id: 'P5', seller: 'Nasrin', buyer: 'Buyer4', deed_no: 'D-X6', deed_area: 20 }, SR);
  ok('X23. ...and the seller still cannot sell (write refused, 423)', r.status === 423);
  await post('/dev/reset');
}

async function wordingTests() {
  section('Honest Green wording and explained acceptance');
  await post('/dev/reset');
  const p1 = await get('/plots/P1');
  const clear = p1.risk.reasons.find((x) => x.code === 'CLEAR');
  ok('W1. Green reads "No warnings found" / "কোনো সতর্কতা পাওয়া যায়নি"', p1.risk.level === 'green' && clear
    && clear.en.startsWith('No warnings found') && clear.bn.startsWith('কোনো সতর্কতা পাওয়া যায়নি'));
  ok('W2. No "safe" / "free in the records" claims in the Green result', !/safe|free in the records|নিরাপদ|মুক্ত/i.test(clear.en + clear.bn));
  const p2 = await get('/plots/P2');
  ok('W3. Every risk result carries the no-guarantee notice (Green and Yellow)', [p1, p2].every((p) => p.risk.notice
    && /does not guarantee legal ownership/.test(p.risk.notice.en) && /fraud-free/.test(p.risk.notice.en) && p.risk.notice.bn));

  let r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-W1', deed_area: 10 }, SR);
  const codes = (r.body.checks || []).map((c) => c.code);
  const expected = ['LEDGER_VERIFIED', 'NO_PENDING_SALE', 'NOT_DISPUTED', 'NO_MORTGAGE', 'OWNER_MATCH', 'FULL_PLOT_AREA', 'DIFFERENT_PARTIES', 'UNIQUE_DEED'];
  ok('W4. Accepted sale lists exactly the checks that ran (no extra claims)', r.status === 201
    && codes.length === expected.length && expected.every((c) => codes.includes(c)));
  ok('W5. Every listed check passed and is bilingual', r.body.checks.every((c) => c.passed === true && c.bn && c.en));
  const owner = r.body.checks.find((c) => c.code === 'OWNER_MATCH');
  const area = r.body.checks.find((c) => c.code === 'FULL_PLOT_AREA');
  ok('W6. Check texts name the real values (seller, owner, areas)', /Rahim/.test(owner.en) && /Rahim/.test(owner.bn) && /\(10\).*\(10\)/.test(area.en));
  const nc = (r.body.not_checked || []).map((c) => c.code);
  ok('W7. Acceptance says what is NOT checked (identity, legal title) + notice', nc.includes('SELLER_IDENTITY') && nc.includes('LEGAL_TITLE')
    && /does not guarantee/.test(r.body.notice.en));

  r = await post('/sale/initiate', { plot_id: 'P2', seller: 'Wrong Person', buyer: 'Jamal', deed_no: 'D-W2', deed_area: 8 }, SR);
  const failedChecks = r.body.checks.filter((c) => !c.passed).map((c) => c.code);
  ok('W8. Blocked sale: failed checks match the blocking reasons (only OWNER_MATCH)', r.status === 409
    && failedChecks.length === 1 && failedChecks[0] === 'OWNER_MATCH' && r.body.reasons.length === 1 && r.body.reasons[0].code === 'NOT_OWNER');
  ok('W9. Ledger still valid', (await get('/ledger/verify')).valid === true);
  await post('/dev/reset');
}

// Appends a correctly hashed AND signed entry plus a matching signed checkpoint, the way someone
// holding the private key could. Used to prove that ledger replay itself enforces the workflow rules.
function forgeSignedEvent(plot_id, event_type, data) {
  const crypto = require('crypto');
  const { privateKey } = JSON.parse(fs.readFileSync(ENV.LANDLOCK_KEY_FILE, 'utf8'));
  const d = readData();
  const prev = d.ledger[d.ledger.length - 1];
  const e = { id: d.ledger.length + 1, plot_id, event_type, data, timestamp: new Date().toISOString(), prev_hash: prev.hash };
  e.hash = crypto.createHash('sha256').update(e.prev_hash + JSON.stringify({ plot_id, event_type, data, timestamp: e.timestamp })).digest('hex');
  e.signature = crypto.sign(null, Buffer.from(e.hash), privateKey).toString('base64');
  e.signer = prev.signer;
  d.ledger.push(e);
  writeData(d);
  const cp = { length: d.ledger.length, head_hash: e.hash, genesis_hash: d.ledger[0].hash, updated_at: new Date().toISOString() };
  cp.signature = crypto.sign(null, Buffer.from(JSON.stringify(cp)), privateKey).toString('base64');
  fs.writeFileSync(CP_FILE, JSON.stringify(cp, null, 2));
}

async function fullPlotTests() {
  section('Full-plot sales only (no partial sales in this prototype)');
  await post('/dev/reset');
  const ledgerLen = async () => (await get('/ledger')).length;
  const partialErr = (r) => r.status === 400 && r.body.code === 'PARTIAL_SALE_NOT_SUPPORTED' && r.body.bn && r.body.en;
  const before = await ledgerLen();

  let r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-F1', deed_area: 3 }, SR);
  ok('F1. Partial sale (3 of 10) rejected: 400 PARTIAL_SALE_NOT_SUPPORTED, bilingual', partialErr(r) && r.body.plot_area === 10 && r.body.deed_area === 3);
  ok('F2. Nearly-full sale (9.99 of 10) also rejected', partialErr(await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-F2', deed_area: 9.99 }, SR)));
  ok('F3. Rejected partial sale creates no transaction, no lock, no ledger entry',
    (await get('/transactions')).length === 0 && (await get('/plots/P1')).plot.status === 'Free' && (await ledgerLen()) === before);
  const reg = await post('/sale/1/register', {}, SR);
  const mut = await post('/sale/1/mutate', {}, AC);
  ok('F4. Partial sale cannot be registered or mutated (no transaction exists, 404)', reg.status === 404 && mut.status === 404);
  ok('F5. Owner unchanged after the partial attempts', (await get('/plots/P1')).plot.current_owner === 'Rahim');

  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-F3', deed_area: 11 }, SR);
  ok('F6. Larger-than-plot area still blocked as AREA_EXCEEDS (409)', r.status === 409 && r.body.reasons.some((x) => x.code === 'AREA_EXCEEDS'));

  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-F4', deed_area: '10' }, SR);
  const txId = r.body.transaction && r.body.transaction.id;
  ok('F7. Full-area sale accepted (201)', r.status === 201 && r.body.transaction.deed_area === 10);
  ok('F8. Full-area sale registers (200)', (await post(`/sale/${txId}/register`, {}, SR)).status === 200);
  r = await post(`/sale/${txId}/mutate`, {}, AC);
  const p = await get('/plots/P1');
  ok('F9. Full-area sale completes: Karim owns all 10, plot Free, Green',
    r.status === 200 && p.plot.current_owner === 'Karim' && p.plot.area === 10 && p.plot.status === 'Free' && p.risk.level === 'green');

  // Step 2 protections still hold together with the new rule
  r = await post('/sale/initiate', { plot_id: 'P5', seller: 'Nasrin', buyer: 'Hasan', deed_no: 'D-F5', deed_area: 20 }, SR);
  const tx5 = r.body.transaction.id;
  await post(`/sale/${tx5}/register`, {}, SR);
  ok('F10. Partial sale on a locked plot is rejected and the lock stays', partialErr(await post('/sale/initiate', { plot_id: 'P5', seller: 'Nasrin', buyer: 'X', deed_no: 'D-F6', deed_area: 5 }, SR))
    && (await get('/plots/P5')).plot.status === 'Pending');
  ok('F11. Registered deed still cannot be cancelled (Step 2)', (await post(`/sale/${tx5}/cancel`, {}, SR)).body.code === 'REGISTERED_DEED_CANNOT_CANCEL');
  ok('F12. Ledger valid after the full-plot workflow', (await get('/ledger/verify')).valid === true);

  // Even a correctly signed partial-sale event (someone holding the key) fails ledger replay
  await post('/dev/reset');
  await stop();
  forgeSignedEvent('P2', 'SALE_INITIATED', { tx_id: 1, seller: 'Karim', buyer: 'Jamal', deed_no: 'D-F7', deed_area: 4, by_role: SR });
  await start();
  const v = await get('/ledger/verify');
  ok('F13. Signed partial-sale event in the ledger is rejected by replay', !v.valid && v.kind === 'workflow' && /partial sale/.test(v.reason));
  await post('/dev/reset');
}

// Starts the server expecting it to refuse; returns its exit code and error output.
function startExpectFail(extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT, ...ENV, ...extraEnv }, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c; serverLog += c; });
    const timer = setTimeout(() => { child.kill(); resolve({ code: 'still running', stderr }); }, 10000);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, stderr }); });
  });
}

async function mortgageLookupConcurrencyTests() {
  section('Mortgage release match, plot lookup, concurrent requests');
  await post('/dev/reset');
  const ledgerLen = async () => (await get('/ledger')).length;

  // ---- Mortgage release must name the right loan (P4: Janata Bank, LN-2024-77) ----
  let r = await post('/mortgage/release', { plot_id: 'P4' }, SR);
  ok('M1. Release without a loan number rejected (400)', r.status === 400 && r.body.code === 'VALIDATION_ERROR' && r.body.fields.includes('loan_ref'));
  const before = await ledgerLen();
  r = await post('/mortgage/release', { plot_id: 'P4', loan_ref: 'LN-WRONG' }, SR);
  ok('M2. Wrong loan number rejected (409 LOAN_MISMATCH, bilingual)', r.status === 409 && r.body.code === 'LOAN_MISMATCH' && r.body.bn && r.body.en);
  ok('M3. Mortgage still in place, nothing written', (await get('/plots/P4')).plot.mortgage.loan_ref === 'LN-2024-77' && (await ledgerLen()) === before);
  r = await post('/mortgage/release', { plot_id: 'P4', loan_ref: ' ln-2024-77 ' }, SR);
  ok('M4. Matching loan number (any case/spaces) releases it', r.status === 200 && (await get('/plots/P4')).plot.mortgage === null);
  const ev = (await get('/ledger')).find((e) => e.event_type === 'MORTGAGE_RELEASED');
  ok('M5. Ledger records which loan was released; ledger valid', ev && ev.data.loan_ref === 'LN-2024-77' && (await get('/ledger/verify')).valid === true);

  await post('/dev/reset');
  await stop();
  forgeSignedEvent('P4', 'MORTGAGE_RELEASED', { bank: 'Janata Bank', loan_ref: 'SOME-OTHER-LOAN', by_role: SR });
  await start();
  let v = await get('/ledger/verify');
  ok('M6. Signed release of the wrong loan is rejected by ledger replay', !v.valid && v.kind === 'workflow' && /released loan/.test(v.reason));
  await post('/dev/reset');

  // ---- Plot lookup by mouza / khatian / dag ----
  const ids = (list) => list.map((p) => p.id).sort().join(',');
  ok('L1. Lookup by mouza + khatian + dag finds exactly one plot', ids(await get('/plots?mouza=Rampura&khatian_no=101&dag_no=124')) === 'P2');
  ok('L2. Lookup ignores case and extra spaces', ids(await get('/plots?mouza=%20rampura%20&dag_no=123')) === 'P1');
  ok('L3. Partial lookup (mouza only) returns all matches', ids(await get('/plots?mouza=Rampura')) === 'P1,P2');
  ok('L4. No match returns an empty list', (await get('/plots?mouza=Rampura&dag_no=999')).length === 0);
  ok('L5. No filters returns all plots (unchanged)', (await get('/plots')).length === 7);

  await stop();
  const original = fs.readFileSync(DATA_FILE);
  const d = readData();
  d.plots.find((p) => p.id === 'P2').dag_no = ' 123 '; // same mouza/khatian/dag as P1
  writeData(d);
  const fail = await startExpectFail();
  ok('L6. Duplicate mouza/khatian/dag in data.json: server refuses to start with a clear error',
    fail.code !== 0 && fail.code !== 'still running' && /duplicate plot identifiers/i.test(fail.stderr) && /P1 and P2/.test(fail.stderr));
  fs.writeFileSync(DATA_FILE, original);
  await start();

  // ---- Concurrent requests cannot bypass the lock ----
  await post('/dev/reset');
  const burst = (n, fn) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
  const count = (rs, status) => rs.filter((x) => x.status === status).length;

  let rs = await burst(20, (i) => post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: `Buyer${i}`, deed_no: `D-C${i}`, deed_area: 10 }, SR));
  ok('C1. 20 simultaneous sales on one plot: exactly 1 accepted, 19 blocked (PLOT_LOCKED)', count(rs, 201) === 1 && count(rs, 409) === 19
    && rs.filter((x) => x.status === 409).every((x) => x.body.reasons.some((y) => y.code === 'PLOT_LOCKED')) && (await get('/transactions')).length === 1);
  const winner = rs.find((x) => x.status === 201).body.transaction;

  rs = await burst(10, () => post(`/sale/${winner.id}/register`, {}, SR));
  ok('C2. 10 simultaneous registrations: exactly 1 succeeds', count(rs, 200) === 1 && count(rs, 400) === 9);

  rs = await burst(10, (i) => (i % 2 ? post(`/sale/${winner.id}/cancel`, {}, SR) : post(`/sale/${winner.id}/mutate`, {}, AC)));
  const mutated = rs.filter((x, i) => i % 2 === 0 && x.status === 200).length;
  const cancelled = rs.filter((x, i) => i % 2 === 1 && x.status === 200).length;
  const p1 = await get('/plots/P1');
  ok('C3. Simultaneous mutate + cancel: exactly 1 mutation, 0 cancels, owner = that buyer',
    mutated === 1 && cancelled === 0 && p1.plot.current_owner === winner.buyer && p1.plot.status === 'Free'
    && p1.history.filter((h) => h.event_type === 'MUTATION_DONE').length === 1);

  rs = await burst(10, (i) => post('/mortgage/create', { plot_id: 'P2', owner: 'Karim', bank: `Bank${i}`, loan_ref: `LN-C${i}` }, SR));
  ok('C4. 10 simultaneous mortgages: exactly 1 registered, 9 DOUBLE_MORTGAGE', count(rs, 201) === 1 && count(rs, 409) === 9
    && rs.filter((x) => x.status === 409).every((x) => x.body.reasons.some((y) => y.code === 'DOUBLE_MORTGAGE')));

  rs = await Promise.all([
    post('/sale/initiate', { plot_id: 'P5', seller: 'Nasrin', buyer: 'Hasan', deed_no: 'D-C99', deed_area: 20 }, SR),
    post('/mortgage/create', { plot_id: 'P5', owner: 'Nasrin', bank: 'Sonali Bank', loan_ref: 'LN-C99' }, SR),
  ]);
  const p5 = (await get('/plots/P5')).plot;
  ok('C5. Simultaneous sale + mortgage: only one wins (never locked AND mortgaged)', count(rs, 201) === 1
    && !(p5.status === 'Pending' && p5.mortgage));
  ok('C6. Ledger valid after all bursts', (await get('/ledger/verify')).valid === true);
  await post('/dev/reset');
}

async function strictValidationTests() {
  section('Strict input formats; rejected requests change nothing');
  await post('/dev/reset');
  const sale = { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-S1', deed_area: 10 };
  const bad = (r, field) => r.status === 400 && r.body.code === 'VALIDATION_ERROR' && r.body.fields.includes(field);
  const state = async () => JSON.stringify([await get('/plots'), await get('/transactions'), await get('/ledger')]);
  const before = await state();

  let all = true;
  for (const v of ['0x10', '1e3', 'Infinity', '-Infinity', 'NaN', '-5', '10abc', ' ', '1,5', null, [], {}]) {
    all = all && bad(await post('/sale/initiate', { ...sale, deed_area: v }, SR), 'deed_area');
  }
  ok('Z1. Malformed / non-finite / negative areas rejected ("0x10", "1e3", "Infinity", "NaN", "-5", null, [] ...)', all);
  const inf = await fetch(`${base}/sale/initiate`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-Role': SR }, body: '{"plot_id":"P1","seller":"Rahim","buyer":"Karim","deed_no":"D-S2","deed_area":1e999}' });
  ok('Z2. JSON number that overflows to Infinity (1e999) rejected', inf.status === 400 && (await inf.json()).fields.includes('deed_area'));

  ok('Z3. Malformed plot ids rejected (number, path, object, missing)', bad(await post('/sale/initiate', { ...sale, plot_id: 1 }, SR), 'plot_id')
    && bad(await post('/sale/initiate', { ...sale, plot_id: '../P1' }, SR), 'plot_id')
    && bad(await post('/sale/initiate', { ...sale, plot_id: { id: 'P1' } }, SR), 'plot_id')
    && bad(await post('/sale/initiate', { ...sale, plot_id: undefined }, SR), 'plot_id'));
  const nf = await post('/sale/initiate', { ...sale, plot_id: 'P99' }, SR);
  ok('Z4. Unknown plot id gives 404 PLOT_NOT_FOUND (bilingual)', nf.status === 404 && nf.body.code === 'PLOT_NOT_FOUND' && nf.body.bn);
  ok('Z5. Malformed names rejected (control char, HTML, 101 chars, number, array)',
    bad(await post('/sale/initiate', { ...sale, seller: 'Ra\u0000him' }, SR), 'seller')
    && bad(await post('/sale/initiate', { ...sale, buyer: '<script>x</script>' }, SR), 'buyer')
    && bad(await post('/sale/initiate', { ...sale, buyer: 'K'.repeat(101) }, SR), 'buyer')
    && bad(await post('/sale/initiate', { ...sale, buyer: 42 }, SR), 'buyer')
    && bad(await post('/sale/initiate', { ...sale, buyer: ['Karim'] }, SR), 'buyer'));
  ok('Z6. Malformed deed numbers rejected (path, HTML, 41 chars)', bad(await post('/sale/initiate', { ...sale, deed_no: '../../etc' }, SR), 'deed_no')
    && bad(await post('/sale/initiate', { ...sale, deed_no: '<D1>' }, SR), 'deed_no')
    && bad(await post('/sale/initiate', { ...sale, deed_no: 'D'.repeat(41) }, SR), 'deed_no'));
  ok('Z7. Malformed transaction ids rejected (abc, 0, 1.5, -1)', bad(await post('/sale/abc/register', {}, SR), 'id')
    && bad(await post('/sale/0/register', {}, SR), 'id') && bad(await post('/sale/1.5/register', {}, SR), 'id')
    && bad(await post('/sale/-1/register', {}, SR), 'id'));
  ok('Z8. Every rejected (400/404) request left plots, transactions and ledger unchanged', (await state()) === before);

  const ledgerBefore = (await get('/ledger')).length;
  let r = await post('/sale/initiate', { ...sale, seller: 'Karim' }, SR);
  const p1 = (await get('/plots/P1')).plot;
  ok('Z9. Unauthorized seller blocked (409 NOT_OWNER): only an audit SALE_BLOCKED entry, no plot/transaction change',
    r.status === 409 && r.body.reasons.some((x) => x.code === 'NOT_OWNER') && (await get('/transactions')).length === 0
    && p1.status === 'Free' && p1.current_owner === 'Rahim' && (await get('/ledger')).length === ledgerBefore + 1);
  r = await post('/sale/initiate', { ...sale, deed_area: 10.5 }, SR);
  ok('Z10. Area larger than the plot blocked (409 AREA_EXCEEDS)', r.status === 409 && r.body.reasons.some((x) => x.code === 'AREA_EXCEEDS'));

  r = await post('/sale/initiate', { ...sale, buyer: 'করিম উদ্দিন', current_owner: 'Hacker', status: 'Free', deed_area: '10', extra: { a: 1 } }, SR);
  const tx = r.body.transaction;
  ok('Z11. Bangla names accepted; unknown extra fields are ignored, not stored', r.status === 201 && tx.buyer === 'করিম উদ্দিন'
    && !('extra' in tx) && !('current_owner' in tx) && (await get('/plots/P1')).plot.current_owner === 'Rahim');
  ok('Z12. Stored deed area is a real number', typeof tx.deed_area === 'number' && tx.deed_area === 10);
  ok('Z13. Ledger valid after all rejected attempts', (await get('/ledger/verify')).valid === true);
  await post('/dev/reset');
}

async function registryMismatchTests() {
  section('Registration vs mutation mismatch: Sub-Registry deed vs khatian (P6, P7)');
  await post('/dev/reset');
  const codes = (p) => p.risk.reasons.map((r) => r.code);
  let p6 = await get('/plots/P6');
  const om = p6.risk.reasons.find((r) => r.code === 'REGISTRY_OWNER_MISMATCH');
  ok('RM1. P6: deed says Shapla bought, khatian says Monir -> Red, explained in both languages',
    p6.risk.level === 'red' && om && /1450\/2019/.test(om.en) && /Shapla/.test(om.en) && /Monir/.test(om.en)
    && /not proof of fraud/.test(om.en) && /প্রতারণার প্রমাণ নয়/.test(om.bn));
  const p7 = await get('/plots/P7');
  const am = p7.risk.reasons.find((r) => r.code === 'REGISTRY_AREA_MISMATCH');
  ok('RM2. P7: deed 14 vs khatian 18 decimal -> Yellow area warning (owner agrees)',
    p7.risk.level === 'yellow' && am && /14/.test(am.en) && /18/.test(am.en) && !codes(p7).includes('REGISTRY_OWNER_MISMATCH'));
  ok('RM3. Plots without a Sub-Registry record are unaffected (P1 stays Green)', (await get('/plots/P1')).risk.level === 'green');

  let r = await post('/sale/initiate', { plot_id: 'P6', seller: 'Monir', buyer: 'Kamrul', deed_no: 'D-RM1', deed_area: 12 }, SR);
  ok('RM4. Khatian owner Monir cannot sell P6 again (double-sell blocked: REGISTRY_OWNER_MISMATCH)',
    r.status === 409 && r.body.reasons.some((x) => x.code === 'REGISTRY_OWNER_MISMATCH') && !r.body.reasons.some((x) => x.code === 'NOT_OWNER'));
  r = await post('/sale/initiate', { plot_id: 'P6', seller: 'Shapla', buyer: 'Kamrul', deed_no: 'D-RM2', deed_area: 12 }, SR);
  ok('RM5. Deed buyer Shapla cannot sell either until the khatian is updated', r.status === 409 && r.body.reasons.some((x) => x.code === 'NOT_OWNER'));
  r = await post('/mortgage/create', { plot_id: 'P6', owner: 'Monir', bank: 'Sonali Bank', loan_ref: 'LN-RM' }, SR);
  ok('RM6. Mortgage on P6 blocked too', r.status === 409 && r.body.reasons.some((x) => x.code === 'REGISTRY_OWNER_MISMATCH'));
  const gapRow = (await get('/gap')).find((g) => g.plot_id === 'P6');
  ok('RM7. Gap dashboard lists the unmutated 2019 deed (source: Sub-Registry, years waiting)',
    gapRow && gapRow.source === 'sub_registry' && gapRow.deed_no === '1450/2019' && gapRow.days_waiting > 1000);

  ok('RM8. Buyer / Sub-Registrar cannot reconcile (403)', (await post('/plots/P6/reconcile', {}, BUYER)).status === 403
    && (await post('/plots/P6/reconcile', {}, SR)).status === 403);
  ok('RM9. Nothing to reconcile when deed and khatian agree on the owner (P7: 409)',
    (await post('/plots/P7/reconcile', {}, AC)).body.code === 'NOTHING_TO_RECONCILE');
  r = await post('/plots/P6/reconcile', {}, AC);
  p6 = await get('/plots/P6');
  const ev = p6.history.find((h) => h.event_type === 'REGISTRY_MUTATION_DONE');
  ok('RM10. AC Land Officer completes the mutation of deed 1450/2019: owner Shapla, signed event, mismatch gone',
    r.status === 200 && p6.plot.current_owner === 'Shapla' && ev && ev.signature && ev.data.deed_no === '1450/2019'
    && ev.data.previous_owner === 'Monir' && ev.data.by_role === AC && !codes(p6).includes('REGISTRY_OWNER_MISMATCH') && p6.risk.level === 'green');
  ok('RM11. Reconciling twice is refused (409)', (await post('/plots/P6/reconcile', {}, AC)).status === 409);
  ok('RM12. Gap dashboard no longer lists P6', !(await get('/gap')).some((g) => g.plot_id === 'P6'));
  r = await post('/sale/initiate', { plot_id: 'P6', seller: 'Shapla', buyer: 'Kamrul', deed_no: 'D-RM3', deed_area: 12 }, SR);
  ok('RM13. Now Shapla can sell, with "deed and khatian agree" in the passed checks', r.status === 201
    && r.body.checks.some((c) => c.code === 'REGISTRY_OWNER_MATCH' && c.passed));
  ok('RM14. ...and Monir no longer can (NOT_OWNER)', (await post('/sale/initiate', { plot_id: 'P6', seller: 'Monir', buyer: 'X', deed_no: 'D-RM4', deed_area: 12 }, SR))
    .body.reasons.some((x) => x.code === 'NOT_OWNER'));

  r = await post('/sale/initiate', { plot_id: 'P7', seller: 'Rafiq', buyer: 'Tania', deed_no: 'D-RM5', deed_area: 18 }, SR);
  ok('RM15. Area mismatch is a warning, not a block: Rafiq can sell P7', r.status === 201);
  const tx7 = r.body.transaction.id;
  await post(`/sale/${tx7}/register`, {}, SR);
  let p = await get('/plots/P7');
  ok('RM16. A deed registered in LandLock becomes the plot\'s Sub-Registry record (no duplicate warning while pending)',
    p.plot.registry.deed_no === 'D-RM5' && p.plot.registry.buyer === 'Tania' && !codes(p).includes('REGISTRY_OWNER_MISMATCH'));
  await post(`/sale/${tx7}/mutate`, {}, AC);
  p = await get('/plots/P7');
  ok('RM17. After mutation deed and khatian agree on owner and area', p.plot.current_owner === 'Tania'
    && !codes(p).includes('REGISTRY_OWNER_MISMATCH') && !codes(p).includes('REGISTRY_AREA_MISMATCH'));
  ok('RM18. Ledger valid (replay rebuilds Sub-Registry records and reconciliations)', (await get('/ledger/verify')).valid === true);

  await stop(); await start();
  ok('RM19. After restart: still valid, P6 owned by Shapla', (await get('/ledger/verify')).valid === true
    && (await get('/plots/P6')).plot.current_owner === 'Shapla');

  // Someone edits the Sub-Registry record in data.json to hide the mismatch
  await post('/dev/reset');
  await stop();
  let d = readData();
  d.plots.find((x) => x.id === 'P6').registry.buyer = 'Monir';
  writeData(d);
  await start();
  const v = await get('/ledger/verify');
  ok('RM20. Editing the Sub-Registry record on disk to hide the mismatch is detected', !v.valid && v.kind === 'state' && /P6/.test(v.reason));

  // A ledger created before P6/P7 existed (5-plot GENESIS) must still verify
  await post('/dev/reset');
  const genesis = (await get('/ledger'))[0];
  await stop();
  const crypto = require('crypto');
  const { privateKey } = JSON.parse(fs.readFileSync(ENV.LANDLOCK_KEY_FILE, 'utf8'));
  const legacyPlots = genesis.data.plots.filter((x) => ['P1', 'P2', 'P3', 'P4', 'P5'].includes(x.id));
  const g = { id: 1, plot_id: null, event_type: 'GENESIS', data: { ...genesis.data, plots: legacyPlots }, timestamp: new Date().toISOString(), prev_hash: '0'.repeat(64) };
  g.hash = crypto.createHash('sha256').update(g.prev_hash + JSON.stringify({ plot_id: g.plot_id, event_type: g.event_type, data: g.data, timestamp: g.timestamp })).digest('hex');
  g.signature = crypto.sign(null, Buffer.from(g.hash), privateKey).toString('base64');
  g.signer = genesis.signer;
  writeData({ plots: JSON.parse(JSON.stringify(legacyPlots)), transactions: [], ledger: [g] });
  const cp = { length: 1, head_hash: g.hash, genesis_hash: g.hash, updated_at: new Date().toISOString() };
  cp.signature = crypto.sign(null, Buffer.from(JSON.stringify(cp)), privateKey).toString('base64');
  fs.writeFileSync(CP_FILE, JSON.stringify(cp, null, 2));
  await start();
  ok('RM21. Older 5-plot ledger (before P6/P7) still verifies', (await get('/ledger/verify')).valid === true && (await get('/plots')).length === 5);
  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-RM6', deed_area: 10 }, SR);
  ok('RM22. ...and keeps working (sale accepted, ledger valid)', r.status === 201 && (await get('/ledger/verify')).valid === true);
  await post('/dev/reset');
  ok('RM23. Reset brings in the 7 sample plots', (await get('/plots')).length === 7 && (await get('/ledger/verify')).valid === true);
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
  await post('/mortgage/release', { plot_id: 'P5', loan_ref: 'LN-I' }, SR);
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

async function demoGuardTests() {
  section('Demo-only endpoints are off unless explicitly enabled');
  const devCalls = async () => Promise.all([
    post('/dev/reset'), post('/dev/tamper'), post('/dev/tamper-smart'), post('/dev/attack', { type: 'owner_change' }),
  ]);
  const allDisabled = (rs) => rs.every((r) => r.status === 404 && r.body.code === 'DEMO_DISABLED');

  // Settings missing entirely (no NODE_ENV, no LANDLOCK_DEMO_MODE) -> safe default: off
  await start({ LANDLOCK_DEMO_MODE: '', NODE_ENV: '' });
  const before = JSON.stringify(await get('/ledger'));
  ok('G1. No demo setting: /api/config says demo_mode false', (await get('/config')).demo_mode === false);
  ok('G2. No demo setting: reset / tamper / tamper-smart / attack all 404 DEMO_DISABLED', allDisabled(await devCalls()));
  ok('G3. ...and they changed nothing', JSON.stringify(await get('/ledger')) === before && (await get('/plots/P1')).plot.current_owner !== 'FORGED_OWNER');
  ok('G4. Normal API still works with demo mode off', (await get('/plots')).length === 7 && (await get('/ledger/verify')).valid === true);
  await stop();

  await start({ LANDLOCK_DEMO_MODE: 'true', NODE_ENV: 'production' });
  ok('G5. NODE_ENV=production blocks demo endpoints even with LANDLOCK_DEMO_MODE=true', allDisabled(await devCalls())
    && (await get('/config')).demo_mode === false);
  await stop();
  ok('G6. Production start logs a warning that demo mode stays disabled', /demo endpoints stay disabled/.test(serverLog));

  await start({ LANDLOCK_DEMO_MODE: 'yes' });
  ok('G7. Only the exact value "true" enables demo mode ("yes" does not)', allDisabled(await devCalls()));
  await stop();

  await start({ LANDLOCK_DEMO_MODE: '' }, ['--demo']);
  ok('G8. "--demo" flag (npm run demo) enables the demo endpoints', (await get('/config')).demo_mode === true && (await post('/dev/reset')).status === 200);
  await stop();

  await start();
  ok('G9. LANDLOCK_DEMO_MODE=true enables them', (await get('/config')).demo_mode === true && (await post('/dev/reset')).status === 200);
  await stop();
}

async function keyAndPersistenceTests() {
  section('Signing key handling, persistence across restarts, safe writes');
  await start();
  await post('/dev/reset');
  const s = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-K1', deed_area: 10 }, SR);
  await post(`/sale/${s.body.transaction.id}/register`, {}, SR);
  const key1 = (await get('/ledger/public-key')).publicKey;
  await stop();
  await start();
  ok('K1. After restart: same public key, transaction still there, ledger verifies',
    (await get('/ledger/public-key')).publicKey === key1 && (await get('/transactions')).length === 1 && (await get('/ledger/verify')).valid === true);
  await stop();

  const keyBytes = fs.readFileSync(ENV.LANDLOCK_KEY_FILE);
  const dataBytes = fs.readFileSync(DATA_FILE);
  const unchanged = () => fs.readFileSync(DATA_FILE).equals(dataBytes);

  fs.renameSync(ENV.LANDLOCK_KEY_FILE, `${ENV.LANDLOCK_KEY_FILE}.aside`);
  let f = await startExpectFail();
  ok('K2. Key file missing while signed data exists: refuses to start, no new key made, data untouched',
    f.code === 1 && /signing key file keys\.json is missing/.test(f.stderr) && !fs.existsSync(ENV.LANDLOCK_KEY_FILE) && unchanged());
  fs.renameSync(`${ENV.LANDLOCK_KEY_FILE}.aside`, ENV.LANDLOCK_KEY_FILE);

  fs.writeFileSync(ENV.LANDLOCK_KEY_FILE, '{ not json');
  f = await startExpectFail();
  ok('K3. Unreadable key file: refuses to start, file not overwritten', f.code === 1 && /not valid JSON/.test(f.stderr)
    && fs.readFileSync(ENV.LANDLOCK_KEY_FILE, 'utf8') === '{ not json');

  const crypto = require('crypto');
  const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  fs.writeFileSync(ENV.LANDLOCK_KEY_FILE, JSON.stringify({ ...JSON.parse(keyBytes), publicKey: other }));
  f = await startExpectFail();
  ok('K4. Public and private key that do not match: refuses to start', f.code === 1 && /do not belong together/.test(f.stderr));

  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
  fs.writeFileSync(ENV.LANDLOCK_KEY_FILE, JSON.stringify({
    publicKey: rsa.publicKey.export({ type: 'spki', format: 'pem' }), privateKey: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }));
  f = await startExpectFail();
  ok('K5. Non-Ed25519 key: refuses to start', f.code === 1 && /must hold an Ed25519 key pair/.test(f.stderr));
  fs.writeFileSync(ENV.LANDLOCK_KEY_FILE, keyBytes);
  ok('K6. None of the refused starts changed data.json', unchanged());

  fs.writeFileSync(DATA_FILE, '{"plots": [ broken');
  f = await startExpectFail();
  ok('K7. Corrupted data.json: refuses to start and leaves the file exactly as it was', f.code === 1 && /not valid JSON/.test(f.stderr)
    && fs.readFileSync(DATA_FILE, 'utf8') === '{"plots": [ broken');
  fs.writeFileSync(DATA_FILE, dataBytes);

  const fresh = path.join(TMP, 'fresh');
  fs.mkdirSync(fresh);
  const freshEnv = { LANDLOCK_DATA_DIR: fresh, LANDLOCK_TRUST_DIR: path.join(fresh, 'trusted'), LANDLOCK_KEY_FILE: path.join(fresh, 'keys.json') };
  f = await startExpectFail({ ...freshEnv, NODE_ENV: 'production' });
  ok('K8. Production with no key file: refuses to generate one', f.code === 1 && /automatic key generation is disabled/.test(f.stderr)
    && !fs.existsSync(freshEnv.LANDLOCK_KEY_FILE));
  f = await startExpectFail({ ...freshEnv, LANDLOCK_REQUIRE_KEY: 'true' });
  ok('K9. LANDLOCK_REQUIRE_KEY=true with no key file: refuses to generate one', f.code === 1 && !fs.existsSync(freshEnv.LANDLOCK_KEY_FILE));
  fs.rmSync(fresh, { recursive: true, force: true });
  fs.mkdirSync(fresh);
  await start(freshEnv);
  ok('K10. Brand-new empty database in development: key generated once, ledger valid', fs.existsSync(freshEnv.LANDLOCK_KEY_FILE)
    && (await get('/ledger/verify')).valid === true);
  await stop();

  await start();
  f = await startExpectFail({ PORT: Number(PORT) + 1 });
  ok('K11. A second server on the same data folder is refused (lock file)', f.code === 1 && /already using this data folder/.test(f.stderr));
  ok('K12. The running server is unaffected', (await get('/ledger/verify')).valid === true);

  // Disk failure midway through a write: data.json is temporarily replaced by a folder
  const before = JSON.stringify([await get('/plots'), await get('/transactions'), await get('/ledger')]);
  fs.renameSync(DATA_FILE, `${DATA_FILE}.aside`);
  fs.mkdirSync(DATA_FILE);
  const r = await post('/sale/initiate', { plot_id: 'P2', seller: 'Karim', buyer: 'Jamal', deed_no: 'D-K2', deed_area: 8 }, SR);
  ok('K13. Write fails on disk: clean 500 SERVER_ERROR (bilingual), "not saved"', r.status === 500 && r.body.code === 'SERVER_ERROR' && r.body.bn);
  ok('K14. ...and the half-finished change was rolled back (no lock, no transaction, no ledger entry)',
    JSON.stringify([await get('/plots'), await get('/transactions'), await get('/ledger')]) === before && (await get('/ledger/verify')).valid === true);
  fs.rmdirSync(DATA_FILE);
  fs.renameSync(`${DATA_FILE}.aside`, DATA_FILE);
  ok('K15. After the disk recovers the same sale works', (await post('/sale/initiate', { plot_id: 'P2', seller: 'Karim', buyer: 'Jamal', deed_no: 'D-K2', deed_area: 8 }, SR)).status === 201);
  await stop();
  await start();
  ok('K16. ...and is still there after a restart, ledger valid', (await get('/plots/P2')).plot.status === 'Pending' && (await get('/ledger/verify')).valid === true);
  await stop();

  const leftovers = [ENV.LANDLOCK_DATA_DIR, ENV.LANDLOCK_TRUST_DIR].flatMap((d) => fs.readdirSync(d)).filter((n) => n.endsWith('.tmp'));
  ok('K17. No temporary files left behind by the atomic writes', leftovers.length === 0);
  ok('K18. Server output never contained a private key or the data folder path', !/PRIVATE KEY/.test(serverLog) && !serverLog.includes(TMP));
}

async function agreementTests() {
  section('Sale agreement (bainapatra): one advance per plot');
  await post('/dev/reset');
  const A = { plot_id: 'P5', seller: 'Nasrin', buyer: 'Tania', agreement_no: 'B-501/2026', advance: 500000 };

  let r = await post('/agreement/create', A, BUYER);
  ok('A1. Buyer role cannot register an agreement (403)', r.status === 403);
  r = await post('/agreement/create', { ...A, advance: 'abc' }, SR);
  const r2 = await post('/agreement/create', { ...A, advance: -5, agreement_no: '' }, SR);
  ok('A2. Invalid advance / agreement no. rejected (400)', r.status === 400 && r.body.fields.includes('advance')
    && r2.status === 400 && r2.body.fields.includes('advance') && r2.body.fields.includes('agreement_no'));

  r = await post('/agreement/create', A, SR);
  ok('A3. Agreement registered by the owner', r.status === 201 && r.body.agreement.buyer === 'Tania' && r.body.agreement.advance === 500000);
  let p = await get('/plots/P5');
  ok('A4. Plot shows Yellow AGREEMENT_ACTIVE, bilingual', p.risk.level === 'yellow'
    && p.risk.reasons.some((x) => x.code === 'AGREEMENT_ACTIVE' && /Tania/.test(x.en) && /Tania/.test(x.bn)));

  r = await post('/agreement/create', { ...A, buyer: 'Babul', agreement_no: 'B-502/2026' }, SR);
  ok('A5. Second advance for the same plot blocked (DOUBLE_AGREEMENT)', r.status === 409 && r.body.reasons.some((x) => x.code === 'DOUBLE_AGREEMENT'));
  ok('A6. Blocked agreement is kept as signed audit evidence', (await get('/plots/P5')).history.some((h) => h.event_type === 'AGREEMENT_BLOCKED'));
  r = await post('/sale/initiate', { plot_id: 'P5', seller: 'Nasrin', buyer: 'Babul', deed_no: 'D-A1', deed_area: 20 }, SR);
  ok('A7. Sale to someone else blocked (AGREEMENT_EXISTS)', r.status === 409 && r.body.reasons.some((x) => x.code === 'AGREEMENT_EXISTS')
    && r.body.checks.some((c) => c.code === 'AGREEMENT_BUYER_MATCH' && !c.passed));
  r = await post('/mortgage/create', { plot_id: 'P5', owner: 'Nasrin', bank: 'Sonali Bank', loan_ref: 'LN-A1' }, SR);
  ok('A8. Mortgage blocked while the agreement stands', r.status === 409 && r.body.reasons.some((x) => x.code === 'AGREEMENT_EXISTS'));
  r = await post('/agreement/create', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', agreement_no: 'b-501/2026 ', advance: 1000 }, SR);
  ok('A9. Reused agreement number blocked (DUPLICATE_AGREEMENT_NO)', r.status === 409 && r.body.reasons.some((x) => x.code === 'DUPLICATE_AGREEMENT_NO'));

  r = await post('/agreement/cancel', { plot_id: 'P5', agreement_no: 'B-999', reason: 'test' }, SR);
  const r3 = await post('/agreement/cancel', { plot_id: 'P5', agreement_no: 'B-501/2026' }, SR);
  ok('A10. Cancel needs the matching number and a reason', r.status === 409 && r.body.code === 'AGREEMENT_MISMATCH'
    && r3.status === 400 && r3.body.fields.includes('reason') && (await get('/plots/P5')).plot.agreement);

  r = await post('/sale/initiate', { plot_id: 'P5', seller: 'Nasrin', buyer: 'Tania', deed_no: 'D-A2', deed_area: 20 }, SR);
  ok('A11. Sale to the agreement buyer allowed', r.status === 201 && r.body.checks.some((c) => c.code === 'AGREEMENT_BUYER_MATCH' && c.passed));
  await post(`/sale/${r.body.transaction.id}/register`, {}, SR);
  await post(`/sale/${r.body.transaction.id}/mutate`, {}, AC);
  p = await get('/plots/P5');
  ok('A12. After mutation the agreement is fulfilled (Tania owns, no agreement, Green)', p.plot.current_owner === 'Tania'
    && !p.plot.agreement && p.risk.level === 'green');

  await post('/agreement/create', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', agreement_no: 'B-101', advance: 20000 }, SR);
  r = await post('/agreement/cancel', { plot_id: 'P1', agreement_no: 'B-101', reason: 'Buyer withdrew; advance returned' }, SR);
  ok('A13. Agreement cancelled with a reason', r.status === 200 && !(await get('/plots/P1')).plot.agreement);
  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Salam', deed_no: 'D-A3', deed_area: 10 }, SR);
  ok('A14. After cancellation anyone may buy', r.status === 201);
  ok('A15. Ledger valid after all agreement events', (await get('/ledger/verify')).valid === true);

  await stop(); await start();
  ok('A16. Agreement history replays after a restart', (await get('/ledger/verify')).valid === true);

  await post('/agreement/create', { plot_id: 'P2', seller: 'Karim', buyer: 'Hasan', agreement_no: 'B-201', advance: 300000 }, SR);
  await stop();
  const d = readData();
  delete d.plots.find((x) => x.id === 'P2').agreement;
  writeData(d);
  await start();
  const v = await get('/ledger/verify');
  ok('A17. Agreement deleted directly in data.json is detected', v.valid === false && v.kind === 'state');
  await post('/dev/reset');
}

async function identityAndReceiptTests() {
  section("Party identity (father's name + NID) and signed receipts");
  await post('/dev/reset');
  const rahim = { seller_father: 'Abdul Malek', seller_nid: '9990000101' };
  const karim = { buyer_father: 'Mokbul Hossain', buyer_nid: '9990001234' };

  let r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-ID1', deed_area: 10, seller_nid: '12345' }, SR);
  ok('ID1. NID with a wrong length rejected (400 seller_nid)', r.status === 400 && r.body.fields.includes('seller_nid'));
  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-ID2', deed_area: 10, seller_father: 'Abdul Malek', seller_nid: '9990009999' }, SR);
  ok('ID2. Same name, different NID blocked (OWNER_ID_MISMATCH)', r.status === 409 && r.body.reasons.some((x) => x.code === 'OWNER_ID_MISMATCH')
    && r.body.reasons.every((x) => x.code !== 'NOT_OWNER'));
  ok('ID3. The mismatch message masks the recorded NID', /••••0101/.test(r.body.reasons.find((x) => x.code === 'OWNER_ID_MISMATCH').en)
    && !/9990000101/.test(JSON.stringify(r.body)));
  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-ID3', deed_area: 10, ...rahim, seller_father: 'Someone Else' }, SR);
  ok("ID4. Right NID but different father's name blocked", r.status === 409 && r.body.reasons.some((x) => x.code === 'OWNER_ID_MISMATCH'));

  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-ID4', deed_area: 10, ...rahim, ...karim }, SR);
  ok('ID5. Matching identity accepted, OWNER_ID_MATCH listed as passed', r.status === 201
    && r.body.checks.some((c) => c.code === 'OWNER_ID_MATCH' && c.passed));
  ok('ID6. Not-checked list says the NID was compared with the record only', /national NID server/.test(r.body.not_checked.find((n) => n.code === 'SELLER_IDENTITY').en));
  ok('ID7. Accepted sale returns a receipt (entry id + 64-char hash)', r.body.receipt && /^[0-9a-f]{64}$/.test(r.body.receipt.hash));
  const saleReceipt = r.body.receipt;
  await post(`/sale/${r.body.transaction.id}/register`, {}, SR);
  await post(`/sale/${r.body.transaction.id}/mutate`, {}, AC);
  let p = await get('/plots/P1');
  ok("ID8. Mutation moves the buyer's identity onto the record", p.plot.current_owner === 'Karim' && p.plot.owner_nid === '9990001234' && p.plot.owner_father === 'Mokbul Hossain');
  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Karim', buyer: 'Salam', deed_no: 'D-ID5', deed_area: 10, seller_father: 'Nurul Islam', seller_nid: '9990000202' }, SR);
  ok("ID9. Another Karim (P2's owner) cannot sell P1 using his own identity", r.status === 409 && r.body.reasons.some((x) => x.code === 'OWNER_ID_MISMATCH'));

  r = await post('/mortgage/create', { plot_id: 'P5', owner: 'Nasrin', bank: 'Sample Bank', loan_ref: 'LN-ID1', owner_nid: '9990000999' }, SR);
  ok('ID10. Mortgage by a same-name person with another NID blocked', r.status === 409 && r.body.reasons.some((x) => x.code === 'OWNER_ID_MISMATCH'));
  r = await post('/agreement/create', { plot_id: 'P5', seller: 'Nasrin', buyer: 'Tania', agreement_no: 'B-ID1', advance: 1000, seller_father: 'Wrong Father' }, SR);
  ok('ID11. Agreement by a same-name person with another father blocked', r.status === 409 && r.body.reasons.some((x) => x.code === 'OWNER_ID_MISMATCH'));
  r = await post('/agreement/create', { plot_id: 'P5', seller: 'Nasrin', buyer: 'Tania', agreement_no: 'B-ID2', advance: 1000, seller_father: 'Siddiqur Rahman', seller_nid: '9990000505' }, SR);
  ok('ID12. Agreement with matching identity accepted, with a receipt', r.status === 201 && r.body.receipt && r.body.receipt.hash);

  await post('/plots/P6/reconcile', {}, AC);
  p = await get('/plots/P6');
  ok("ID13. Reconciling P6 records Shapla's identity from the Sub-Registry deed", p.plot.current_owner === 'Shapla' && p.plot.owner_nid === '9990000616');
  ok('ID14. Ledger valid after identity events', (await get('/ledger/verify')).valid === true);
  await stop(); await start();
  ok('ID15. Identity history replays after a restart', (await get('/ledger/verify')).valid === true);

  // ---- receipts ----
  let v = await get(`/verify/${saleReceipt.hash}`);
  ok('RC1. Receipt verifies: hash, signature and ledger all OK', v.found && v.authentic === true && v.checks.hash && v.checks.signature && v.checks.ledger
    && v.entry.id === saleReceipt.entry_id && v.entry.event_type === 'SALE_INITIATED' && v.plot.dag_no === '123');
  ok('RC2. Public answer masks NIDs', v.entry.data.seller_nid === '••••0101' && !JSON.stringify(v).includes('9990000101'));
  ok('RC3. Public key fingerprint included', /^[0-9a-f]{16}$/.test(v.public_key_fingerprint));
  r = await fetch(`${base}/verify/${'a'.repeat(64)}`);
  ok('RC4. Unknown hash -> 404 NOT_IN_LEDGER', r.status === 404 && (await r.json()).code === 'NOT_IN_LEDGER');
  r = await fetch(`${base}/verify/not-a-hash`);
  ok('RC5. Malformed code -> 400 BAD_HASH', r.status === 400 && (await r.json()).code === 'BAD_HASH');
  await post('/dev/tamper');
  const tampered = (await get('/ledger')).find((e) => e.event_type === 'SALE_INITIATED');
  v = await get(`/verify/${tampered.hash}`);
  ok('RC6. After tampering, the receipt is no longer authentic (hash fails, ledger flagged)', v.found && v.authentic === false && v.checks.hash === false && v.checks.ledger === false);
  await post('/dev/reset');
}

(async () => {
  try {
    await start();
    await storyTests();
    await roleTests();
    await validationTests();
    await strictValidationTests();
    await disputeTests();
    await fullPlotTests();
    await wordingTests();
    await mortgageLookupConcurrencyTests();
    await registryMismatchTests();
    await agreementTests();
    await identityAndReceiptTests();
    await integrityTests();
    await restartTests();
    await demoGuardTests();
    await keyAndPersistenceTests();
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
