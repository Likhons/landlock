# LandLock (backend prototype)

Plot-level locking, double-sell blocking and a tamper-evident hash-linked ledger for land records (Track: Digital Land Records, Verification & Digitization, Problem P3).

> **DEMO / SAMPLE DATA.** All plots, owners and CS → SA → RS → BS survey history are invented for the prototype. They are not verified official khatian records.

## Run (Windows / VS Code)
```
npm install
npm start        # API on http://localhost:4000
npm test         # starts its own isolated test server (port 4100, temp files); your data.json/keys.json are not touched
```
UI: in `../../landlock-ui` run `npm install` then `npm run dev` (http://localhost:5173).

## What it does
- Plot Lock: starting a sale sets the plot to Pending; any second sale is blocked.
- Ownership check: seller must be the recorded owner.
- Area check: deed area cannot exceed khatian area.
- Bank mortgage: double mortgage, mortgage during a sale and mortgage by a non-owner are blocked.
- Survey chain: unexplained owner changes / area increases between CS, SA, RS, BS are flagged Yellow.
- Registration vs mutation gap: registered-but-not-mutated deeds are flagged Yellow and listed at /api/gap.
- Registered deed lock: once a deed is registered the sale **cannot be cancelled**. Only the AC Land Officer can complete the mutation (owner changes, plot unlocks) or **reject** it with a reason. A rejected mutation makes the transaction `disputed` and the plot `Disputed` (Red, still locked, owner unchanged): no sale or mortgage until the dispute is resolved outside the prototype.
- Hash chain + digital signature: every event is SHA-256 linked to the previous one and signed (Ed25519).
- Role-based access control (prototype) and strengthened ledger verification (see below).

## Roles (DEMO ROLE SWITCH)
| Role | Can do (enforced by the API) |
|---|---|
| Buyer (default) | Read only: plots, owners, mortgage status, survey history, ledger |
| Sub-Registrar | Start / register a sale (deed), cancel it **before registration**, register / release a mortgage |
| AC Land Officer | Mutation (namjari): complete it (owner changes) or reject it (plot becomes Disputed) |

- The UI sends the chosen role in the `X-Demo-Role` header. No header = Buyer. Every write route checks the permission on the server (`guard()` in server.js) and returns **403 PERMISSION_DENIED** otherwise. The UI only hides/disables buttons for convenience.
- Extra permissions can only be granted on the server, e.g. `LANDLOCK_EXTRA_GRANTS="sub_registrar:sale.mutate"`.
- **This is not authentication.** Any client can send any role header. Production requires real authentication (e.g. government SSO / smart card), secure sessions or signed tokens, and server-side authorization based on verified user identities, plus audit of who acted.

## Ledger integrity checks (`GET /api/ledger/verify`)
| Check | Catches | `kind` |
|---|---|---|
| Entry #1 is a signed GENESIS entry equal to the starting register (`db.seed()`) | removed/replaced start | `genesis` |
| ids run 1, 2, 3 … | reordered / inserted entries | `sequence` |
| prev_hash = previous entry's hash | deleted or reordered entries | `link` |
| SHA-256 of each entry | edited entries | `hash` |
| Ed25519 signature of each hash | edits where the attacker recomputed all hashes | `signature` |
| Signed checkpoint {length, head hash} | deleted tail / wiped ledger | `truncation`, `checkpoint` |
| Replay of all events vs. plots + transactions | owner, mortgage, status or survey changed without an authorized workflow event; illegal transitions (e.g. mutation without registration) | `state`, `workflow` |

- The checkpoint is held **in server memory** (only `append()` changes it) and in `trusted/checkpoint.json`, a separate folder from data.json (`LANDLOCK_TRUST_DIR` can move it to another disk/machine).
- While verification fails, **all writes are refused (423 INTEGRITY_FAILED)**, so nothing is built on tampered data. `POST /api/dev/reset` starts a fresh verified ledger.
- The only code path that changes `current_owner` is `POST /api/sale/:id/mutate` (AC Land Officer, after a registered deed).

## Signing key (keys.json)
`keys.json` holds the Ed25519 **private key in plain text**. It is git-ignored, never returned by the API (only `/api/ledger/public-key`), and never logged. `LANDLOCK_KEY_FILE` can place it outside the project. For production use a hardware security module (HSM) or a managed key service (cloud KMS) with strict access control, key rotation and audit logs, so the application can request signatures but can never read the key.

## Remaining limitations (not tamper-proof)
- Anyone who obtains `keys.json` can forge entries, signatures and checkpoints.
- Rolling back **both** data.json and the checkpoint file to an older consistent copy while the server is stopped is not detectable locally (the test suite shows this as INFO). Fix: publish checkpoints to an external witness (another office, transparency log, timestamping service).
- If the checkpoint file is deleted, the ledger is reported unverifiable, but its original length cannot be recovered.
- The JSON file database has no locking or transactions; a crash between writing data.json and the checkpoint is reported as a checkpoint mismatch.
- `/api/dev/*` endpoints simulate attacks and reset data. They are disabled when `NODE_ENV=production`.
- The role header is not authentication (see above).

## API
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /api/plots, /api/plots/:id | any | Plot, risk (green/yellow/red + Bangla reason), history |
| GET | /api/roles | any | Demo roles and their permissions |
| POST | /api/sale/initiate | Sub-Registrar | Run checks, lock plot or block |
| POST | /api/sale/:id/register | Sub-Registrar | Mark deed registered |
| POST | /api/sale/:id/mutate | AC Land Officer | Mutation done, owner changes, unlock |
| POST | /api/sale/:id/reject-mutation | AC Land Officer | Reject mutation (`{reason}`): transaction disputed, plot Disputed (Red, locked) |
| POST | /api/sale/:id/cancel | Sub-Registrar | Cancel and unlock, only before registration (otherwise 409 REGISTERED_DEED_CANNOT_CANCEL) |
| POST | /api/mortgage/create, /api/mortgage/release | Sub-Registrar | Bank mortgage |
| GET | /api/gap | any | Registered deeds waiting for mutation, including disputed ones |
| GET | /api/ledger, /api/ledger/verify, /api/ledger/public-key | any | Ledger, full integrity check, public key |
| POST | /api/dev/reset, /api/dev/tamper, /api/dev/tamper-smart, /api/dev/attack | demo only | Reset and attacker simulations (`attack` types: owner_change, bad_signature, break_link, delete_middle, truncate_tail, reorder) |

In real use LandLock would sit at the Sub-Registry Office and connect with AC Land records.
