import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { load } from 'cheerio';
import { trustedBrowserKey, securityNotice, emailApprovalPage, mountEmailApproval } from '../account-security-ui.js';

test('browser keys are random, persistent, and regenerated when malformed', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const first = trustedBrowserKey(storage);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(trustedBrowserKey(storage), first);
  storage.setItem('seomtorch-browser-key', 'malformed');
  assert.notEqual(trustedBrowserKey(storage), first);
});

test('verification UI escapes email, requires explicit consent and supports autofill', () => {
  const html = emailApprovalPage({ challenge: { challenge_id: 'test', masked_email: '<img src=x onerror=1>', is_transfer: true } });
  assert.ok(!html.includes('<img src=x'));
  const $ = load(html);
  assert.equal($('#email-code').attr('autocomplete'), 'one-time-code');
  assert.equal($('#email-code').attr('inputmode'), 'numeric');
  assert.equal($('[name=approve_transfer][required]').length, 1);
  assert.equal($('#resend-email-code[disabled]').length, 1);
  assert.match(html, /signs out other browsers/);
  assert.doesNotMatch(html, /password["']?\s*value=/);
  assert.match(emailApprovalPage({}), /id="request-email-code"/);
  assert.match(emailApprovalPage({ signedIn: true }), /Back to my account/);
});

test('rollout notice is hidden when disabled or already verified', () => {
  assert.equal(securityNotice({}), '');
  assert.equal(securityNotice({ enabled: true, email_verified: true }), '');
  assert.match(securityNotice({ enabled: true, grace_until: '2099-01-01T00:00:00Z' }), /data-verify-account/);
});

function fixture() {
  const nodes = Object.fromEntries(['email-security-error', 'email-security-status', 'resend-email-code', 'email-code-form', 'cancel-email-approval'].map(id => [id, { textContent: '', disabled: false, addEventListener(type, fn) { this[type] = fn; } }]));
  nodes['email-code-form'].elements = { code: { value: '123456' }, approve_transfer: { checked: false } };
  nodes['email-code-form'].reportValidity = () => true;
  const root = { isConnected: true, querySelector: selector => nodes[selector.slice(1)] || null, querySelectorAll: () => [nodes['resend-email-code'], nodes['cancel-email-approval']] };
  return { root, nodes };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('no approval is sent without consent; duplicate submits cannot create concurrent requests', async () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => 'a'.repeat(64) };
  const { root, nodes } = fixture();
  let sends = 0, finish, verified = 0;
  const cleanup = mountEmailApproval({ root, challenge: { challenge_id: 'ID', resend_after: 60 }, api: { verifyEmailCode: () => { sends++; return new Promise(resolve => { finish = resolve; }); } }, onVerified: () => { verified++; }, onChallenge() {}, onCancel() {} });
  try {
    nodes['email-code-form'].submit({ preventDefault() {}, currentTarget: nodes['email-code-form'] });
    assert.equal(sends, 0);
    nodes['email-code-form'].elements.approve_transfer.checked = true;
    nodes['email-code-form'].submit({ preventDefault() {}, currentTarget: nodes['email-code-form'] });
    nodes['email-code-form'].submit({ preventDefault() {}, currentTarget: nodes['email-code-form'] });
    assert.equal(sends, 1);
    finish({ token: 'new' }); await flush();
    assert.equal(verified, 1);
  } finally { cleanup(); globalThis.localStorage = originalStorage; }
});

test('late responses cannot sign in after navigation; failed checks remain actionable', async () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => 'a'.repeat(64) };
  const { root, nodes } = fixture();
  nodes['email-code-form'].elements.approve_transfer.checked = true;
  let finish, verified = 0;
  const cleanup = mountEmailApproval({ root, challenge: { challenge_id: 'ID' }, api: { verifyEmailCode: () => new Promise(resolve => { finish = resolve; }) }, isCurrent: () => root.isConnected, onVerified: () => verified++, onCancel() {}, onChallenge() {} });
  try {
    nodes['email-code-form'].submit({ preventDefault() {}, currentTarget: nodes['email-code-form'] });
    root.isConnected = false; finish({ token: 'new' }); await flush();
    assert.equal(verified, 0);
  } finally { cleanup(); globalThis.localStorage = originalStorage; }
});

test('integration keeps passwords out of pending registration and handles revocation server-side', () => {
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.equal((source.match(/async function submitAuth\(/g) || []).length, 1);
  assert.match(source, /const \{ password, \.\.\.registration \} = body/);
  assert.match(source, /seomtorch-auth-expired/);
  assert.match(source, /setInterval\(refreshAccountSecurity, 60000\)/);
  assert.match(source, /window.addEventListener\("storage"/);
  assert.match(source, /currentUser\?\.account_security\?\.verification_required/);
  assert.match(source, /error.fields\?\.code !== "email_verification_required"/);
});
