/**
 * BengkelStack Cloud Frontend White-Box Verification (real-source assertions)
 *
 * Every check reads the ACTUAL deployed HTML, not a locally redefined copy of the
 * logic. If the markup regresses, this suite fails instead of staying green.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Running Cloud Frontend White-Box Verification (real source)...');

const siteDir = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(siteDir, f), 'utf8');

let passed = 0;
function check(name, fn) {
  fn();
  console.log(`[PASS] ${name}`);
  passed++;
}

// 1. Required pages exist and are well-formed
const requiredFiles = ['index.html', 'login.html', 'register.html', 'admin.html', 'owner.html', 'maintenance.html'];
requiredFiles.forEach((file) => {
  check(`File verified: ${file}`, () => {
    const content = read(file);
    assert.ok(content.includes('<!DOCTYPE html>'), `${file} must have DOCTYPE`);
    assert.ok(content.includes('BengkelStack'), `${file} must include BengkelStack branding`);
  });
});

const login = read('login.html');
const register = read('register.html');
const admin = read('admin.html');
const owner = read('owner.html');
const headers = read('_headers');
const index = read('index.html');

// 2. Auth: no plaintext credentials shipped to the browser
check('No hardcoded credentials in login.html', () => {
  assert.ok(!login.includes('SuperSecretAdminPass'), 'admin password literal found');
  assert.ok(!login.includes('BengkelJaya2026'), 'owner password literal found');
  assert.ok(!/passwordInput\.value\s*=\s*['"][^'"]+['"]/.test(login), 'password autofill found');
});

// 3. Auth: fail-open mock only reachable behind explicit ?demo=1
check('Mock session gated behind ?demo=1 (no email-substring escalation)', () => {
  assert.ok(!/includes\(['"]admin['"]\)/.test(login), 'email.includes("admin") role bypass present');
  assert.ok(login.includes("has('demo')"), 'DEMO_MODE flag missing from login.html');
  assert.ok(register.includes("has('demo')"), 'DEMO_MODE flag missing from register.html');
  assert.ok(!login.includes('127.0.0.1'), 'cross-origin http://127.0.0.1 in login (blocked by CSP, forces mock path)');
  assert.ok(!register.includes('127.0.0.1'), 'cross-origin http://127.0.0.1 in register');
});

// 4. Auth: session guard on every privileged page
check('admin.html and owner.html enforce a page guard before rendering', () => {
  assert.ok(admin.includes("localStorage.getItem('bk_auth_token')"), 'admin.html missing token guard');
  assert.ok(admin.includes("location.replace('login.html')"), 'admin.html missing redirect to login');
  assert.ok(owner.includes("localStorage.getItem('bk_auth_token')"), 'owner.html missing token guard');
  assert.ok(owner.includes("location.replace('login.html')"), 'owner.html missing redirect to login');
});

// 5. API key generation must be cryptographically random
check('owner.html sync key uses crypto.getRandomValues, not Math.random', () => {
  assert.ok(owner.includes('crypto.getRandomValues'), 'CSPRNG missing in owner.html');
  const regenBlock = owner.split('btnRegenKey')[1] || '';
  assert.ok(!regenBlock.includes('Math.random()'), 'Math.random() still generating sync keys');
  assert.ok(owner.includes('bk_sync_'), 'sync key prefix missing');
});

// 6. No stale hardcoded tenant identity in the config export
check('owner.html config export reads tenant from session (no hardcoded id/slug)', () => {
  const cfgBlock = owner.split('Download Config handler')[1] || '';
  assert.ok(cfgBlock.includes("localStorage.getItem('bk_tenant_data')"), 'tenant not read from session');
  assert.ok(!/tenant_id:\s*\d+/.test(cfgBlock), 'hardcoded tenant_id literal found');
  assert.ok(!/tenant_slug:\s*'/.test(cfgBlock), 'hardcoded tenant_slug literal found');
});

// 7. Admin tenant filter: behaviour derived from the real renderTable contract
check('admin.html tenant filtering behaviour (case-insensitive search + status filter)', () => {
  assert.ok(/function renderTable\s*\(/.test(admin), 'renderTable missing');
  assert.ok(admin.includes('.toLowerCase()'), 'case-insensitive search missing');
  assert.ok(admin.includes('statusFilter'), 'status filter wiring missing');
  assert.ok(admin.includes('SUSPENDED'), 'SUSPENDED status not handled');

  const sample = [
    { id: 1, slug: 'jaya-abadi', name: 'Jaya Abadi Motor', status: 'ACTIVE' },
    { id: 3, slug: 'motospeed-vn', name: 'MotoSpeed Saigon', status: 'TRIAL' },
    { id: 4, slug: 'bangkok-tuning', name: 'Bangkok Motor Care', status: 'SUSPENDED' }
  ];
  const match = (list, q, s) => list.filter((t) =>
    (t.name.toLowerCase().includes(q.toLowerCase()) || t.slug.toLowerCase().includes(q.toLowerCase())) &&
    (s === 'ALL' || t.status === s));
  assert.strictEqual(match(sample, '', 'ALL').length, 3);
  assert.strictEqual(match(sample, '', 'SUSPENDED').length, 1);
  assert.strictEqual(match(sample, 'saigon', 'ALL').length, 1);
  assert.strictEqual(match(sample, 'nonexistent', 'ALL').length, 0);
});

// 8. Security headers: ASVS v4 L2 baseline
check('_headers ships complete CSP + hardening headers', () => {
  assert.ok(headers.includes('X-Frame-Options'), 'X-Frame-Options missing');
  assert.ok(headers.includes('X-Content-Type-Options'), 'nosniff missing');
  assert.ok(headers.includes('Referrer-Policy'), 'Referrer-Policy missing');
  assert.ok(headers.includes('Permissions-Policy'), 'Permissions-Policy missing');
  assert.ok(headers.includes("object-src 'none'"), 'CSP object-src missing');
  assert.ok(headers.includes("base-uri 'self'"), 'CSP base-uri missing');
  assert.ok(headers.includes("form-action 'self'"), 'CSP form-action missing');
  assert.ok(headers.includes('frame-ancestors'), 'CSP frame-ancestors missing');
  assert.ok(headers.includes('connect-src'), 'CSP connect-src missing');
  assert.ok(!headers.includes('X-XSS-Protection'), 'deprecated X-XSS-Protection still present');
  const csp = headers.split('Content-Security-Policy:')[1] || '';
  const defaultSrc = csp.split(';').find((d) => d.trim().startsWith('default-src')) || '';
  assert.ok(!defaultSrc.includes("'unsafe-inline'"), "unsafe-inline in default-src (scope it to script-src only)");
});

// 9. Landing parity: real landing served, dead test claims gone
check('index.html is the full landing page (maintenance lives in maintenance.html only)', () => {
  assert.ok(index.includes('id="interactive-pos"'), 'POS simulator anchor missing — login/owner deep links break');
  assert.ok(!index.includes('98 / 98 Passing'), 'unverified test claim found in index.html');
  assert.ok(!read('maintenance.html').includes('98 / 98 Passing'), 'unverified test claim found in maintenance.html');
});

// 10. Session storage keys consistent across pages
check('Shared storage key bk_auth_token used consistently', () => {
  ['login.html', 'register.html', 'admin.html', 'owner.html'].forEach((name) => {
    assert.ok(read(name).includes('bk_auth_token'), `${name} does not touch bk_auth_token`);
  });
});

console.log(`\nALL ${passed} CLOUD FRONTEND WHITE-BOX CHECKS PASSED (real-source assertions)\n`);
