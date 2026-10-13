// Runs the full demo story against a running server: node test.js
const base = 'http://localhost:4000/api';
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (p) => fetch(base + p).then((r) => r.json());
let fails = 0;
const ok = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };

(async () => {
  await post('/dev/reset');

  let r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-1001', deed_area: 10 });
  ok('1. Valid sale accepted, plot locked', r.status === 201 && !r.body.blocked);
  const txId = r.body.transaction.id;

  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Salam', deed_no: 'D-1002', deed_area: 10 });
  ok('2. Double-sell blocked (PLOT_LOCKED)', r.status === 409 && r.body.reasons.some((x) => x.code === 'PLOT_LOCKED'));

  await post(`/sale/${txId}/register`);
  let p = await get('/plots/P1');
  ok('3. Registered but not mutated -> Yellow', p.risk.level === 'yellow' && p.risk.reasons[0].code === 'REG_NOT_MUTATED');
  ok('4. Gap dashboard lists the deed', (await get('/gap')).length === 1);

  await post(`/sale/${txId}/mutate`);
  p = await get('/plots/P1');
  ok('5. After mutation: Karim owns, plot Free, Green', p.plot.current_owner === 'Karim' && p.plot.status === 'Free' && p.risk.level === 'green');

  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Salam', deed_no: 'D-1003', deed_area: 10 });
  ok('6. Old owner can no longer sell (NOT_OWNER)', r.status === 409 && r.body.reasons.some((x) => x.code === 'NOT_OWNER'));

  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Karim', buyer: 'Salam', deed_no: 'D-1004', deed_area: 10 });
  ok('7. New owner can sell normally', r.status === 201);
  await post(`/sale/${r.body.transaction.id}/cancel`);

  r = await post('/sale/initiate', { plot_id: 'P2', seller: 'Karim', buyer: 'Jamal', deed_no: 'D-2001', deed_area: 50 });
  ok('8. Deed area > khatian area blocked', r.status === 409 && r.body.reasons.some((x) => x.code === 'AREA_EXCEEDS'));

  ok('9. Ledger intact before tampering', (await get('/ledger/verify')).valid === true);
  await post('/dev/tamper');
  const v = await get('/ledger/verify');
  ok('10. Tampering detected', v.valid === false);
  p = await get('/plots/P1');
  ok('11. Plot page shows Red when ledger tampered', p.risk.level === 'red');

  // Smart attacker: recomputes hashes, but cannot forge the registrar's signature
  await post('/dev/reset');
  r = await post('/sale/initiate', { plot_id: 'P1', seller: 'Rahim', buyer: 'Karim', deed_no: 'D-1', deed_area: 10 });
  await post(`/sale/${r.body.transaction.id}/register`);
  ok('12. Fresh ledger is valid and signed', (await get('/ledger/verify')).valid === true);
  await post('/dev/tamper-smart');
  const v2 = await get('/ledger/verify');
  ok('13. Hash-recompute attack caught by SIGNATURE', v2.valid === false && v2.kind === 'signature');

  await post('/dev/reset');
  // ---- Bank mortgage ----
  r = await post('/mortgage/create', { plot_id: 'P2', owner: 'Karim', bank: 'Sonali Bank', loan_ref: 'LN-1' });
  ok('14. Mortgage registered on a free plot', r.status === 201);
  r = await post('/mortgage/create', { plot_id: 'P2', owner: 'Karim', bank: 'Rupali Bank', loan_ref: 'LN-2' });
  ok('15. Double mortgage blocked', r.status === 409 && r.body.reasons.some((x) => x.code === 'DOUBLE_MORTGAGE'));
  r = await post('/sale/initiate', { plot_id: 'P2', seller: 'Karim', buyer: 'Salam', deed_no: 'D-9', deed_area: 8 });
  ok('16. Sale on mortgaged plot blocked', r.status === 409 && r.body.reasons.some((x) => x.code === 'PLOT_MORTGAGED'));
  p = await get('/plots/P2');
  ok('17. Mortgaged plot shows Yellow', p.risk.level === 'yellow' && p.risk.reasons.some((x) => x.code === 'MORTGAGED'));
  await post('/sale/initiate', { plot_id: 'P3', seller: 'Salma', buyer: 'Hasan', deed_no: 'D-10', deed_area: 15 });
  r = await post('/mortgage/create', { plot_id: 'P3', owner: 'Salma', bank: 'Sonali Bank', loan_ref: 'LN-3' });
  ok('18. Mortgage blocked while a sale is in progress', r.status === 409 && r.body.reasons.some((x) => x.code === 'SALE_IN_PROGRESS'));
  r = await post('/mortgage/create', { plot_id: 'P5', owner: 'Someone Else', bank: 'Sonali Bank', loan_ref: 'LN-4' });
  ok('19. Mortgage by a non-owner blocked', r.status === 409 && r.body.reasons.some((x) => x.code === 'NOT_OWNER'));
  await post('/mortgage/release', { plot_id: 'P2' });
  r = await post('/sale/initiate', { plot_id: 'P2', seller: 'Karim', buyer: 'Salam', deed_no: 'D-11', deed_area: 8 });
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
  r = await post('/sale/initiate', { plot_id: 'P2', seller: 'Karim', buyer: 'Jamal', deed_no: 'D-20', deed_area: 8 });
  ok('25. Survey warnings do not block a valid sale', r.status === 201);
  await post('/dev/reset');

  console.log(fails ? `\n${fails} test(s) FAILED` : '\nAll tests passed');
  process.exitCode = fails ? 1 : 0;
})();