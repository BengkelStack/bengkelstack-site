/**
 * Auth behaviour verification — executes the REAL inline script from login.html
 * inside a Node VM with mocked DOM / fetch / localStorage. Proves the login path
 * is fail-closed: no verified backend response means no session, ever.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log('Running Auth Behaviour Verification (real login.html script)...');

const src = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8');
const blocks = src.split('<script>').slice(1);
const authJs = blocks[blocks.length - 1].split('</script>')[0];

let passed = 0;
const ok = (name, fn) => { fn(); console.log(`[PASS] ${name}`); passed++; };

function makeEnv(fetchImpl, search = '') {
  const store = {};
  const els = {};
  const el = (id) => (els[id] ||= {
    id, value: '', textContent: '', innerHTML: '', disabled: false, className: '',
    classList: { add() {}, remove() {} },
    addEventListener(ev, fn) { this[`on_${ev}`] = fn; }
  });

  const loc = { search, href: '', port: '' };
  loc.replace = function (h) { this.href = h; };

  const sandbox = {
    document: { getElementById: el, addEventListener() {} },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    window: { location: loc },
    location: loc,
    URLSearchParams,
    fetch: fetchImpl,
    console
  };

  vm.createContext(sandbox);
  vm.runInContext(authJs, sandbox);

  return {
    store, els, loc,
    fill: (email, password) => { el('email').value = email; el('password').value = password; },
    submit: async () => { await el('loginForm').on_submit({ preventDefault() {} }); }
  };
}

const res401 = async () => ({ ok: false, status: 401, json: async () => ({ error: 'Invalid credentials' }) });
const resDown = async () => { throw new Error('ECONNREFUSED'); };

(async () => {
  // 1. Backend 401 -> no token, no redirect, error surfaced
  {
    const env = makeEnv(res401);
    env.fill('admin@bengkelstack.com', 'wrong');
    await env.submit();
    ok('401 from backend issues no session', () => {
      assert.strictEqual(env.store.bk_auth_token, undefined, 'token issued despite 401');
      assert.strictEqual(env.els['alertMessage'].textContent, 'Invalid credentials');
      assert.strictEqual(env.loc.href, '', 'redirect happened after 401');
    });
  }

  // 2. API unreachable -> no token, honest error
  {
    const env = makeEnv(resDown);
    env.fill('admin@bengkelstack.com', 'x');
    await env.submit();
    ok('unreachable API fails closed with an honest message', () => {
      assert.strictEqual(env.store.bk_auth_token, undefined, 'token issued with API unreachable');
      assert.ok(env.els['alertMessage'].textContent.includes('unreachable'), 'missing honest unreachable error');
    });
  }

  // 3. Backend grants SUPERADMIN while the switcher says OWNER -> rejected
  {
    const env = makeEnv(async () => ({
      ok: true,
      json: async () => ({ data: { user: { id: 1, email: 'a@b.c', role: 'SUPERADMIN' }, tokens: { access_token: 'real.jwt' } } })
    }));
    env.fill('x@y.z', 'x');
    await env.submit();
    ok('role mismatch is rejected (no email-substring escalation)', () => {
      assert.strictEqual(env.store.bk_auth_token, undefined, 'SUPERADMIN accepted while OWNER selected');
      assert.ok(env.els['alertMessage'].textContent.includes('Role mismatch'), 'no mismatch error');
    });
  }

  // 4. Verified grant matching the requested role -> token + redirect
  {
    const env = makeEnv(async () => ({
      ok: true,
      json: async () => ({
        data: { user: { id: 2, email: 'o@w.id', role: 'OWNER', full_name: 'Owner' }, tenant: { id: 9, slug: 'w' }, tokens: { access_token: 'real.jwt' } }
      })
    }));
    env.fill('o@w.id', 'x');
    await env.submit();
    ok('valid grant stores the real token and routes to owner.html', () => {
      assert.strictEqual(env.store.bk_auth_token, 'real.jwt');
      assert.ok(env.store.bk_user_data.includes('OWNER'));
      assert.ok(env.loc.href.endsWith('owner.html'), `redirect was ${env.loc.href}`);
    });
  }

  // 5. ?demo=1 + API down -> namespaced mock session (explicit opt-in only)
  {
    const env = makeEnv(resDown, '?demo=1');
    env.fill('demo@d.id', 'x');
    await env.submit();
    ok('demo mode issues a namespaced mock token', () => {
      assert.ok(env.store.bk_auth_token.startsWith('bk_at_mock_'), 'demo token not namespaced');
      assert.ok(env.loc.href.endsWith('owner.html'), 'demo redirect missing');
    });
  }

  // 6. Email containing "admin" no longer escalates
  {
    const env = makeEnv(resDown);
    env.fill('evil-admin@attacker.tld', 'x');
    await env.submit();
    ok('email-substring escalation is dead', () => {
      assert.strictEqual(env.store.bk_auth_token, undefined, 'email containing "admin" still escalates');
      assert.strictEqual(env.loc.href, '', 'escalation redirect happened');
    });
  }

  console.log(`\nALL ${passed} AUTH BEHAVIOUR CHECKS PASSED (real login.html script)\n`);
})().catch((err) => {
  console.error(`\n[FAIL] ${err.message}\n${err.stack.split('\n').slice(0, 4).join('\n')}\n`);
  process.exit(1);
});
