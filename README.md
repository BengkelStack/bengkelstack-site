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
# Run the verification suite (23 checks, real-source assertions)
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

---

## Related Repositories

- **Core Engine:** [`BengkelStack/bengkelstack-core`](https://github.com/BengkelStack/bengkelstack-core) - Self-hosted edge POS and dual-tier pricing engine.

---

## License

MIT License. Copyright (c) 2026 BengkelStack / Rahmad Riyadi.
