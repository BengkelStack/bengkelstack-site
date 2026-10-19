/**
 * End-to-end browser workflow: landing -> auth -> owner portal -> superadmin
 * dashboard, plus the fail-closed and page-guard paths.
 *
 *   node tests/e2e_browser.js        (spawns the mock core engine itself)
 *
 * Real Chromium, real fetch, real redirects. No mocked DOM here — that job
 * belongs to tests/test_auth_behavior.js.
 */
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = Number(process.env.E2E_PORT || 8092);
const BASE = `http://127.0.0.1:${PORT}`;

const OWNER = { email: 'dimas@bengkeljaya.com', pass: 'BengkelJaya2026!' };
const ADMIN = { email: 'admin@bengkelstack.com', pass: 'SuperSecretAdminPass123!' };

let passed = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) {
    console.error(`[FAIL] ${name} ${detail}`);
    throw new Error(name);
  }
  console.log(`[PASS] ${name}`);
  passed++;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) { /* retry */ }
    await sleep(150);
  }
  throw new Error(`mock core engine never came up on ${url}`);
}

async function signIn(page, creds) {
  await page.fill('#email', creds.email);
  await page.fill('#password', creds.pass);
  // wait for the navigation that the auth handler triggers via window.location.href
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {}),
    page.click('#btnSubmit')
  ]);
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'mock_core_api.js'), String(PORT)], {
    stdio: 'ignore'
  });

  let browser;
  try {
    await waitForServer(`${BASE}/index.html`);
    browser = await chromium.launch({
      headless: true,
      executablePath: (() => {
        // resolve to whichever headless-shell version is installed
        const fs = require('fs'), path = require('path');
        const base = process.env.LOCALAPPDATA
          ? path.join(process.env.LOCALAPPDATA, 'ms-playwright')
          : path.join(require('os').homedir(), '.cache', 'ms-playwright');
        if (!fs.existsSync(base)) return undefined;
        const pick = fs.readdirSync(base).filter(d => d.startsWith('chromium'));
        // prefer headless-shell if available; fall back to full chromium
        const hs = pick.find(d => d.includes('headless_shell'));
        const cr = pick.find(d => !d.includes('headless_shell') && d.startsWith('chromium-'));
        const dir = hs || cr;
        if (!dir) return undefined;
        const candidates = [
          path.join(base, dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
          path.join(base, dir, 'chrome-win64', 'chrome.exe'),
          path.join(base, dir, 'chrome-win', 'chrome.exe')
        ];
        return candidates.find(p => fs.existsSync(p));
      })()
    });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // 1. Landing: real page, deep anchors alive
    await page.goto(`${BASE}/`);
    ok('landing serves the real index (title)', (await page.title()).includes('BengkelStack'));
    ok('POS simulator anchor exists (login/owner deep links)', await page.locator('#interactive-pos').count() === 1);
    ok('maintenance mode not covering the landing', !(await page.locator('text=Maintenance Active').count()));

    // 2. Fail-closed: API blocked -> honest error, no session
    await page.route('**/api/**', (route) => route.abort());
    await page.goto(`${BASE}/login.html`);
    await page.fill('#email', ADMIN.email);
    await page.fill('#password', ADMIN.pass);
    await page.click('#btnSubmit');
    await page.waitForTimeout(400);
    const msg = await page.textContent('#alertMessage');
    ok('API unreachable -> honest error surfaced', /unreachable/i.test(msg), `got "${msg}"`);
    ok('API unreachable -> no session minted', (await page.evaluate(() => localStorage.getItem('bk_auth_token'))) === null);
    ok('API unreachable -> stayed on login.html', page.url().endsWith('login.html'), page.url());
    await page.unroute('**/api/**');

    // 3. Bad credentials -> 401 surfaces, still no session
    await page.goto(`${BASE}/login.html`);
    await page.fill('#email', OWNER.email);
    await page.fill('#password', 'wrong-password');
    await page.click('#btnSubmit');
    await page.waitForTimeout(400);
    ok('bad credentials -> 401 message shown', (await page.textContent('#alertMessage')).includes('Invalid credentials'));
    ok('bad credentials -> no token', (await page.evaluate(() => localStorage.getItem('bk_auth_token'))) === null);

    // 4. Page guard: privileged page with no session bounces to login
    await page.goto(`${BASE}/admin.html`);
    await page.waitForLoadState('domcontentloaded');
    ok('admin.html without session redirects to login', page.url().endsWith('login.html'), page.url());
    await page.goto(`${BASE}/owner.html`);
    await page.waitForLoadState('domcontentloaded');
    ok('owner.html without session redirects to login', page.url().endsWith('login.html'), page.url());

    // 5. Owner sign-in -> portal, greeting, settings sync
    await page.goto(`${BASE}/login.html`);
    await signIn(page, OWNER);
    ok('owner sign-in routes to owner.html', page.url().endsWith('owner.html'), page.url());
    ok('owner greeting rendered from session', (await page.textContent('#userGreeting')).includes('Dimas'), await page.textContent('#userGreeting'));
    const tokOwner = await page.evaluate(() => localStorage.getItem('bk_auth_token'));
    ok('real backend token stored', tokOwner && tokOwner.startsWith('sess_'), String(tokOwner));

    await page.fill('#setReceiptHeader', 'E2E RECEIPT HEADER');
    await page.click('#btnSaveSettings');
    await page.waitForTimeout(500);
    const saveLabel = await page.textContent('#btnSaveSettings');
    ok('settings save reports cloud sync', /Synced to Cloud/i.test(saveLabel), `button said "${saveLabel}"`);
    ok('no silent local-only fallback on success', !(await page.evaluate(() => localStorage.getItem('bk_owner_settings'))));

    // reload: value still the saved one (server round-trip contract is checked by e2e_api_check.py)
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    ok('owner portal survives reload with session', page.url().endsWith('owner.html'), page.url());

    // 6. Logout -> session cleared
    await page.click('#btnLogout');
    await page.waitForLoadState('domcontentloaded');
    ok('logout clears session and returns to login', page.url().endsWith('login.html') && (await page.evaluate(() => localStorage.getItem('bk_auth_token'))) === null);

    // 7. Superadmin -> LIVE badge, tenant rows, mutation persisted
    await page.goto(`${BASE}/login.html`);
    await page.click('#btnRoleAdmin');   // switch switcher to SUPERADMIN before submit
    await signIn(page, ADMIN);
    ok('superadmin sign-in routes to admin.html', page.url().endsWith('admin.html'), page.url());
    await page.waitForFunction(() => document.querySelector('#dataModeBadge')?.textContent.includes('LIVE'), null, { timeout: 8000 });
    const badge = await page.textContent('#dataModeBadge');
    ok('admin table reads live API (LIVE badge)', badge.includes('LIVE'), `badge "${badge}"`);
    // wait until renderTable() has populated rows after the async loadTenants
    await page.waitForFunction(() => document.querySelectorAll('#tenantTableBody tr').length > 0, null, { timeout: 5000 });
    const rows = await page.locator('#tenantTableBody tr').count();
    ok('4 tenant rows rendered from API', rows === 4, `rows=${rows}`);

    // suspend Bangkok Motor Care (id 4) through the modal -> PATCH must land
    await page.click('#tenantTableBody tr:nth-child(4) button');
    await page.waitForSelector('#actionModal:not(.hidden)');
    await page.selectOption('#modalActionSelect', 'SUSPEND');
    await page.click('#btnModalConfirm');
    await page.waitForTimeout(600);
    const lastRow = await page.textContent('#tenantTableBody tr:nth-child(4)');
    ok('PATCH mutation reflected in table (SUSPENDED)', lastRow.includes('SUSPENDED'), lastRow.replace(/\s+/g, ' ').slice(0, 120));
    const badgeAfter = await page.textContent('#dataModeBadge');
    ok('badge stays LIVE after successful PATCH', badgeAfter.includes('LIVE'), `badge "${badgeAfter}"`);

    // search + status filter still work on live data
    await page.fill('#searchInput', 'saigon');
    await page.waitForTimeout(200);
    ok('search filters live rows', await page.locator('#tenantTableBody tr').count() === 1);
    await page.fill('#searchInput', '');
    await page.selectOption('#statusFilter', 'SUSPENDED');
    await page.waitForTimeout(200);
    const filtered = await page.locator('#tenantTableBody tr').count();
    ok('status filter works on live rows', filtered === 1, `rows=${filtered}`);

    // 8. Demo guard: mock token refused without ?demo=1, accepted with it
    // Navigate to login.html first (same origin) so localStorage writes are visible
    // to subsequent same-origin navigations.
    await page.goto(`${BASE}/login.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      localStorage.setItem('bk_auth_token', 'bk_at_mock_e2e');
      localStorage.setItem('bk_user_data', JSON.stringify({ id: 1, role: 'SUPERADMIN', email: 'x@y.z', full_name: 'Demo Admin' }));
    });
    await page.goto(`${BASE}/admin.html`);
    await page.waitForLoadState('domcontentloaded');
    ok('mock token without ?demo=1 bounced to login', page.url().endsWith('login.html'), page.url());

    // Now navigate to login again to re-set the token (previous guard cleared it)
    await page.goto(`${BASE}/login.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      localStorage.setItem('bk_auth_token', 'bk_at_mock_e2e');
      localStorage.setItem('bk_user_data', JSON.stringify({ id: 1, role: 'SUPERADMIN', email: 'x@y.z', full_name: 'Demo Admin' }));
    });
    await page.goto(`${BASE}/admin.html?demo=1`);
    // Capture guard diagnostic before waitForLoadState intercepts a redirect
    await page.waitForTimeout(200);
    await page.waitForLoadState('domcontentloaded');
    ok('mock token accepted with explicit ?demo=1', page.url().includes('admin.html'), page.url());
    await page.waitForFunction(() => document.querySelector('#dataModeBadge')?.textContent.includes('DEMO'), null, { timeout: 5000 });
    ok('demo fallback is labelled, never silent', (await page.textContent('#dataModeBadge')).includes('DEMO'));

    console.log(`\nALL ${passed} BROWSER E2E WORKFLOW CHECKS PASSED (${BASE})\n`);
    await browser.close();
    server.kill();
    process.exit(0);
  } catch (err) {
    console.error(`\n[FAIL] ${err.message}\n`);
    if (browser) await browser.close().catch(() => {});
    server.kill();
    process.exit(1);
  }
})();
