/**
 * Dev fixture: one-origin static server + the /api/v1 surface the pages expect.
 *
 * Lets the real pages be exercised end-to-end without bengkelstack-core:
 *   node tests/mock_core_api.js [port]     (default 8091)
 *
 * Login accepts exactly one pair per role, so auth failures stay testable:
 *   owner:      dimas@bengkeljaya.com / BengkelJaya2026!
 *   superadmin: admin@bengkelstack.com / SuperSecretAdminPass123!
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.argv[2] || 8091);
const ROOT = path.resolve(__dirname, '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8'
};

let tenants = [
  { id: 1, slug: 'jaya-abadi', name: 'Jaya Abadi Motor', country: 'ID', plan: 'PRO', sync: '12s ago', status: 'ACTIVE' },
  { id: 2, slug: 'sentosa-speed', name: 'Sentosa Speed Workshop', country: 'ID', plan: 'PRO', sync: '45s ago', status: 'ACTIVE' },
  { id: 3, slug: 'motospeed-vn', name: 'MotoSpeed Saigon', country: 'VN', plan: 'TRIAL', sync: '2m ago', status: 'TRIAL' },
  { id: 4, slug: 'bangkok-tuning', name: 'Bangkok Motor Care', country: 'TH', plan: 'FREE', sync: 'Offline', status: 'SUSPENDED' }
];

const users = [
  { email: 'dimas@bengkeljaya.com', password: 'BengkelJaya2026!', id: 2, role: 'OWNER', full_name: 'Dimas Prasetyo' },
  { email: 'admin@bengkelstack.com', password: 'SuperSecretAdminPass123!', id: 1, role: 'SUPERADMIN', full_name: 'Master System Admin' }
];

let workshopSettings = null;
const sessions = new Map();

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const body = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
});

const authed = (req) => {
  const m = /^Bearer\s+(.+)$/.exec(req.headers.authorization || '');
  return !!(m && sessions.get(m[1]));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;

  // ---- API ------------------------------------------------------------
  if (p.startsWith('/api/')) {
    if (p === '/api/v1/auth/login' && req.method === 'POST') {
      const b = await body(req);
      const u = users.find((x) => x.email === b.email && x.password === b.password);
      if (!u) return json(res, 401, { error: 'Invalid credentials' });
      const token = 'sess_' + crypto.randomBytes(16).toString('hex');
      sessions.set(token, u);
      return json(res, 200, {
        data: {
          user: { id: u.id, email: u.email, role: u.role, full_name: u.full_name },
          tenant: u.role === 'OWNER'
            ? { id: 101, name: 'Jaya Abadi Motor', slug: 'jaya-abadi', plan: 'PRO', status: 'ACTIVE' }
            : null,
          tokens: { access_token: token }
        }
      });
    }

    if (p === '/api/v1/admin/tenants') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      if (req.method === 'GET') return json(res, 200, { data: tenants });
      if (req.method === 'POST') {
        const b = await body(req);
        const t = { id: tenants.length + 1, status: 'TRIAL', plan: 'FREE', sync: 'Just now', ...b };
        tenants.push(t);
        return json(res, 201, { data: t });
      }
    }

    const m = /^\/api\/v1\/admin\/tenants\/(\d+)$/.exec(p);
    if (m && req.method === 'PATCH') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const t = tenants.find((x) => x.id === Number(m[1]));
      if (!t) return json(res, 404, { error: 'tenant not found' });
      Object.assign(t, await body(req));
      return json(res, 200, { data: t });
    }

    if (p === '/api/v1/workshop/settings' && req.method === 'PUT') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      workshopSettings = await body(req);
      return json(res, 200, { data: workshopSettings });
    }

    if (p === '/api/v1/workshop/settings' && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      return json(res, 200, { data: workshopSettings });
    }

    return json(res, 404, { error: `no route ${req.method} ${p}` });
  }

  // ---- static ---------------------------------------------------------
  const rel = p === '/' ? 'index.html' : decodeURIComponent(p).replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock core api + static: http://127.0.0.1:${PORT} (root: ${ROOT})`);
});
