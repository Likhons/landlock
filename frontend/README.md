# LandLock frontend (React + Vite)

The web interface for LandLock: check a plot before buying, follow a sale through registration and mutation, register mortgages, and watch the ledger integrity check catch tampering. Bangla and English. For the full project guide see the [root README](../README.md).

> All data shown comes from the backend's **synthetic sample records**. Nothing here is an official land record.

## Run
```powershell
npm install
npm run dev        # http://localhost:5173  (start the backend first)
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload on http://localhost:5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |

## Backend address
The UI calls `http://localhost:4000/api` by default. To use another address, copy `.env.example` to `.env` and set:

```
VITE_API_URL=http://localhost:4000/api
```

There is no Vite proxy: the browser calls the backend directly (the backend allows cross-origin requests). Restart `npm run dev` after changing `.env`. Only `VITE_*` values reach the browser, so never put secrets in this file.

## What is on the page
- **DEMO ROLE SWITCH** (top): Buyer (read-only, default), Sub-Registrar, AC Land Officer. Buttons a role cannot use are disabled; tick "Enable blocked buttons" to watch the **server** refuse them. This is not a login.
- **Plot details and risk card:** owner, area, lock status, mortgage, and the Green / Yellow / Red result with every reason. Green means "No warnings found", not a legal guarantee.
- **Survey history** CS → SA → RS → BS with unexplained changes highlighted (sample data).
- **Sale in progress / Disputed** cards, **Start a new sale**, **Bank mortgage** and **Sale agreement (bainapatra)** forms. An accepted sale lists the checks that passed and what is not checked.
- **Signed receipt** (`Receipt.jsx`, opened from each history entry or after a sale / agreement / mortgage) with a QR code (`QrCode.jsx`, MIT `qrcode-generator`) to the public **verify page** (`VerifyPage.jsx`, `?verify=<hash>`).
- **History (Ledger)** with hashes, signatures and the acting role, plus the **Registered but not mutated** list.
- **Forgery test bench** (`DemoLab.jsx`): four attacks (edit an old entry, smart forger, delete the newest entry, change an owner directly), each with the protection that should catch it; after a run it shows which check caught it and at which entry, plus Reset. Shown only when the backend runs with `npm run demo`.

## Structure
`src/App.jsx` holds the page and most components; `PlotMap.jsx` (mouza map), `LedgerChain.jsx` (ledger vault), `SideNav.jsx` (sidebar) and `Logo.jsx` are split out; `index.css` is the design system; `src/main.jsx` mounts it.
