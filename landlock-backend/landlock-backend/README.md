# LandLock (backend prototype)

Plot-level locking, double-sell blocking and a tamper-evident hash-linked ledger for land records (Track: Digital Land Records, Verification & Digitization, Problem P3).

## Run (Windows / VS Code)
```
npm install
npm start        # API on http://localhost:4000
npm test         # in a second terminal: runs the full demo story
```

## What it does
- Plot Lock: starting a sale sets the plot to Pending; any second sale is blocked.
- Ownership check: seller must be the recorded owner.
- Area check: deed area cannot exceed khatian area.
- Registration vs mutation gap: registered-but-not-mutated deeds are flagged Yellow and listed at /api/gap.
- Hash chain: every event is SHA-256 linked to the previous one; /api/ledger/verify detects any edit.

## API
| Method | Path | Purpose |
|---|---|---|
| GET | /api/plots, /api/plots/:id | Plot, risk (green/yellow/red + Bangla reason), history |
| POST | /api/sale/initiate | Run checks, lock plot or block |
| POST | /api/sale/:id/register | Mark deed registered |
| POST | /api/sale/:id/mutate | Mutation done, owner changes, unlock |
| POST | /api/sale/:id/cancel | Cancel, unlock |
| GET | /api/gap | Registered deeds waiting for mutation |
| GET | /api/ledger/verify | Check the hash chain |
| POST | /api/dev/tamper, /api/dev/reset | Demo helpers |

Sample data only. In real use LandLock would sit at the Sub-Registry Office and connect with AC Land records.
