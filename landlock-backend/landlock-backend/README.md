# LandLock backend (Node.js + Express)

Technical reference for the LandLock API. For the project overview, setup and demo guide see the [root README](../../README.md).

> **DEMO / SAMPLE DATA.** All plots, owners, khatian/dag numbers, loans and CS → SA → RS → BS survey history are invented for this prototype. They are not official land records, and this is not a legal verification system.

## Commands
| Command | What it does |
|---|---|
| `npm install` | Install dependencies (express, cors) |
| `npm start` | Start the API on http://localhost:4000. **Demo endpoints are off.** |
| `npm run demo` | Start with demo endpoints on (`--demo`): reset and tamper buttons work. Local demo only. |
| `npm run dev` / `npm run dev:demo` | Same as above, restarting automatically when a file changes |
| `npm test` | Run the automated test suite. It starts its own servers on ports 4100/4101 with temporary data, key and checkpoint files, so your `data.json` and `keys.json` are never touched. |

Requires Node.js **20.12 or newer** (uses the built-in `.env` loader). Tested with Node 24.

## Configuration
Copy `.env.example` to `.env` (git-ignored) to change settings; shell variables take priority. All settings default to the safe choice.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | API port |
| `NODE_ENV` | (unset) | `production` disables demo endpoints and automatic key generation |
| `LANDLOCK_DEMO_MODE` | off | Exactly `true` enables `/api/dev/*` (or use `npm run demo`). Ignored when `NODE_ENV=production`. |
| `LANDLOCK_DATA_DIR` | this folder | Folder holding `data.json` |
| `LANDLOCK_TRUST_DIR` | `./trusted` | Folder for the signed ledger checkpoint |
| `LANDLOCK_KEY_FILE` | `./keys.json` | Ed25519 key file |
| `LANDLOCK_REQUIRE_KEY` | off | `true` = never generate a key automatically |
| `LANDLOCK_EXTRA_GRANTS` | empty | Extra role permissions, e.g. `sub_registrar:sale.mutate` |

## Files
| File | Role |
|---|---|
| `server.js` | Routes, input validation, role + integrity guard, rollback on failure, demo guard |
| `rules.js` | Sale / mortgage / survey rules and the explainable Green / Yellow / Red result |
| `ledger.js` | Hash-chained, signed ledger; checkpoint; full verification by replay |
| `keys.js` | Loads and validates the Ed25519 key (generates one only for a brand-new database) |
| `db.js` | JSON storage: sample data (`seed()`), atomic saves, snapshot / restore |
| `fsutil.js` | Atomic file replace and the data-folder lock |
| `config.js` | Environment settings with safe defaults |
| `rbac.js` | Demo roles and permissions |
| `test.js` | Automated tests |

## Input validation
Every write request is validated on the server before any rule runs. Invalid input is rejected with **400 VALIDATION_ERROR** (listing the bad `fields`, with Bangla and English text) and changes nothing.

| Field | Accepted |
|---|---|
| `plot_id` | text matching `^[A-Za-z0-9_-]{1,32}$`, must exist (else **404 PLOT_NOT_FOUND**) |
| `seller`, `buyer`, `owner`, `bank` | names in any script (Bangla included), digits, spaces and `. ' - & ( ) ,`; max 100 characters |
| `deed_no`, `loan_ref` | e.g. `D-1001`, `4521/1998`: letters, digits, `/ . _ -` and spaces; max 40 |
| `deed_area` | a finite number > 0, or plain decimal text (`"10"`, `"10.5"`). Rejected: `NaN`, `Infinity`, `"1e3"`, `"0x10"`, negative, zero, empty, arrays, objects |
| `:id` (transaction) | positive integer |
| `reason` | non-empty text, max 300 characters, no control characters |

Unknown extra fields are ignored and never stored. Values are trimmed before they are checked and stored.

## Status codes
| Code | Meaning |
|---|---|
| 200 / 201 | Done / created |
| 400 | Invalid input (`VALIDATION_ERROR`, `INVALID_JSON`, `PARTIAL_SALE_NOT_SUPPORTED`, `UNKNOWN_ROLE`) |
| 403 | Role not allowed (`PERMISSION_DENIED`) |
| 404 | Not found (`PLOT_NOT_FOUND`, `NOT_FOUND`, `DEMO_DISABLED`) |
| 409 | Business rule blocked it (sale/mortgage `reasons`, `REGISTERED_DEED_CANNOT_CANCEL`, `TX_DISPUTED`, `LOAN_MISMATCH`) |
| 423 | Ledger integrity check failed, so no writes are allowed (`INTEGRITY_FAILED`) |
| 500 | Server error; the change was rolled back and not saved (`SERVER_ERROR`) |

A **409-blocked** sale or mortgage attempt changes no plot or transaction, but is recorded in the ledger as a signed `SALE_BLOCKED` / `MORTGAGE_BLOCKED` audit entry (that is intentional: blocked fraud attempts are evidence). 400/403/404 requests write nothing at all.

## Workflow rules
- **Plot lock:** starting a sale sets the plot to `Pending`; any second sale or a mortgage is blocked.
- **Ownership:** the seller must be the recorded owner; after a transfer the old owner can no longer sell.
- **Full-plot sales only:** a smaller deed area gives 400 `PARTIAL_SALE_NOT_SUPPORTED`; a larger one is blocked as `AREA_EXCEEDS`.
- **Other blocks:** buyer = seller (`SAME_PARTY`), reused deed number (`DUPLICATE_DEED`), mortgaged plot (`PLOT_MORTGAGED`), disputed plot (`PLOT_DISPUTED`).
- **Registered deeds cannot be cancelled.** Only the AC Land Officer can complete the mutation (owner changes, plot unlocks) or reject it with a reason (transaction `disputed`, plot `Disputed`: Red, still locked, owner unchanged).
- **Mortgage:** double mortgage, mortgage during a sale and mortgage by a non-owner are blocked; release needs the matching loan number (`LOAN_MISMATCH`).
- **Plot identity:** mouza + khatian no. + dag no. must be unique (the server refuses to start otherwise); `GET /api/plots?mouza=&khatian_no=&dag_no=` looks plots up.
- **Explainable result:** Green means "No warnings found", never "safe". Accepted sales return `checks` (every check that ran) and `not_checked` (seller identity, legal title).
- **Deed vs khatian (registration–mutation mismatch):** `plot.registry` is the plot's latest registered deed (a sample Sub-Registry record for P6/P7; a deed registered through LandLock replaces it). On a Free plot, a deed buyer different from the khatian owner gives `REGISTRY_OWNER_MISMATCH` (Red; sales and mortgages blocked) and a different area gives `REGISTRY_AREA_MISMATCH` (Yellow). `POST /api/plots/:id/reconcile` (AC Land Officer) completes the missing mutation and records a signed `REGISTRY_MUTATION_DONE` event. Ledgers created before P6/P7 existed (5-plot GENESIS) still verify.

## Roles (DEMO ROLE SWITCH: not authentication)
| Role | Allowed (checked by the API on every write) |
|---|---|
| Buyer (default when no header) | Read only |
| Sub-Registrar | Start / register a sale, cancel it **before registration**, register / release a mortgage |
| AC Land Officer | Complete or reject a mutation (namjari) |

The UI sends the role in the `X-Demo-Role` header. Any client can send any header, so this only demonstrates server-side permission checks. Production needs real authentication (e.g. government SSO / smart card), secure sessions and authorization based on verified identities.

## Ledger integrity (`GET /api/ledger/verify`)
| Check | Catches | `kind` |
|---|---|---|
| Entry #1 is a signed GENESIS entry equal to the starting register | removed / replaced start | `genesis` |
| ids run 1, 2, 3 … | inserted / reordered entries | `sequence` |
| `prev_hash` = previous entry's hash | deleted / reordered entries | `link` |
| SHA-256 of each entry | edited entries | `hash` |
| Ed25519 signature of each hash | edits where all hashes were recomputed | `signature` |
| Signed checkpoint {length, head hash} in memory and in `trusted/` | deleted tail / wiped ledger | `truncation`, `checkpoint` |
| Replay of every event vs. plots and transactions | owner / mortgage / status / survey changed outside the workflow; illegal transitions | `state`, `workflow` |

While verification fails, all writes are refused (423).

## Storage and keys
- **Atomic writes:** `data.json` and the checkpoint are written to a temp file, flushed, then renamed over the old file, so a crash cannot leave a half-written file. Renames are retried briefly when OneDrive or antivirus locks the file.
- **No silent overwrite:** `data.json` is only created from sample data when it does not exist. A corrupted or wrongly shaped file stops the server with a clear message and is left untouched.
- **All-or-nothing requests:** a copy of the data is taken before a write; if the request fails midway (e.g. a disk error), the copy is restored and the client gets 500 "not saved".
- **One server per data folder:** `data.json.lock` holds the server's PID; a second server on the same folder refuses to start. A lock left by a crashed server is taken over automatically.
- **Signing key:** generated once, only for a brand-new empty database, never in production or with `LANDLOCK_REQUIRE_KEY=true`, and never overwritten. If the key file is missing while signed data exists, or is unreadable, not Ed25519, or a mismatched pair, the server refuses to start (a new key could not verify old records). The private key is never returned by the API or logged; only `/api/ledger/public-key` exposes the public key.

## Limitations
- Plain JSON files, one Node process: fine for a demo, not for many users or several servers.
- Anyone holding `keys.json` can forge entries, signatures and checkpoints. Production: HSM or managed key service.
- Rolling back **both** `data.json` and the checkpoint to an older matching copy is not detectable locally (shown as INFO in the tests). Needs an external witness (another office, transparency log, timestamping).
- If the data write succeeds but the checkpoint write fails and the rollback cannot be written either, the next start reports a checkpoint mismatch (detected, not silent).
- CORS allows any origin; there is no HTTPS, rate limiting or real login.

## API
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /api/plots, /api/plots/:id | any | Plots (optional `?mouza=&khatian_no=&dag_no=` filter); one plot with risk, history, active / disputed transaction |
| GET | /api/roles | any | Demo roles and permissions |
| GET | /api/config | any | `{ demo_mode }` so the UI can show or hide demo tools |
| POST | /api/sale/initiate | Sub-Registrar | Validate, run checks, lock the plot or block |
| POST | /api/sale/:id/register | Sub-Registrar | Mark the deed registered |
| POST | /api/sale/:id/mutate | AC Land Officer | Complete mutation: owner changes, plot unlocks |
| POST | /api/sale/:id/reject-mutation | AC Land Officer | Reject mutation (`{reason}`): plot Disputed |
| POST | /api/sale/:id/cancel | Sub-Registrar | Cancel before registration only |
| POST | /api/plots/:id/reconcile | AC Land Officer | Complete the mutation of the plot's unmutated Sub-Registry deed (owner becomes the deed buyer) |
| POST | /api/mortgage/create, /api/mortgage/release | Sub-Registrar | Register / release a mortgage (release needs `loan_ref`) |
| GET | /api/gap | any | Registered deeds waiting for mutation (including disputed ones and unmutated Sub-Registry deeds) |
| GET | /api/transactions, /api/ledger, /api/ledger/verify, /api/ledger/public-key | any | Raw data, full integrity check, public key |
| POST | /api/dev/reset, /api/dev/tamper, /api/dev/tamper-smart, /api/dev/attack | demo mode only | Reset and attack simulations (`attack` types: owner_change, bad_signature, break_link, delete_middle, truncate_tail, reorder). 404 `DEMO_DISABLED` otherwise. |
