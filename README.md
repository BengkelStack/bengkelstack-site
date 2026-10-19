# bengkelstack-site

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Core: bengkelstack-core](https://img.shields.io/badge/Core-bengkelstack--core-0284c7)](https://github.com/BengkelStack/bengkelstack-core)

Public landing gateway, interactive invoice OCR simulator, and technical specifications portal for [bengkelstack.com](https://bengkelstack.com).

---

## Features

- **Interactive Invoice OCR Simulator:** Simulates real-time extraction across distributor receipts (Astra Otoparts, Yamaha Genuine Parts, Denso) with visual bounding boxes and mathematical line-item determinism verification.
- **Dynamic Pricing Calculator:** Demonstrates real-time parts retail versus model-specific installation labor fee calculations.
- **Pure Static Architecture:** Zero build step, vanilla HTML5 / Tailwind CSS via CDN, zero client-side dependencies. Ready for instant deployment to Cloudflare Pages.

---

## Quickstart

```bash
# Run the verification suite (32 checks: source contracts, auth behaviour, POS engine)
npm test

# Local preview server
python -m http.server 8080
```

Open `http://localhost:8080` in any web browser.

### Auth pages offline

`login.html` and `register.html` call the same-origin `/api/v1/auth/*` endpoints of
`bengkelstack-core`. Without the core engine they stay honest and show an error.
Append `?demo=1` to opt into the offline mock session (`bk_at_mock_*` token);
`admin.html` and `owner.html` refuse mock tokens unless that flag is present.

### API-backed pages

CSP allows only same-origin calls plus `https://api.bengkelstack.com`, so
`/api/v1/*` must be served from the same origin as these pages:

- **Local:** serve the folder from `bengkelstack-core` (it mounts statics + API),
  or add a proxy in front (`/api/` → core engine, port 8089).
- **Cloudflare Pages:** Pages `_redirects` cannot proxy to an origin — use a
  Worker route (`/api/*` → core engine) or serve both from one origin.

Degrade behaviour is labelled, never silent: the SuperAdmin table shows
`LIVE · /api/v1/admin/tenants`, `DEMO DATA · API unavailable`, or
`LOCAL ONLY · PATCH failed`. Workshop settings fall back to
`Saved locally (no API)` via `bk_owner_settings`.

---

## Related Repositories

- **Core Engine:** [`BengkelStack/bengkelstack-core`](https://github.com/BengkelStack/bengkelstack-core) - Self-hosted edge POS and dual-tier pricing engine.

---

## License

MIT License. Copyright (c) 2026 BengkelStack / Rahmad Riyadi.
