import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { load } from 'cheerio';
import { emailChangePage, mountEmailChange } from '../email-change-ui.js';
import { emailApprovalPage } from '../account-security-ui.js';

test('email change requires only the new inbox code and explicit consent', () => {
  const html = emailChangePage({ email: '<img src=x onerror=1>' });
  assert.ok(!html.includes('<img src=x'));
  let $ = load(html);
  assert.equal($('#change-current-password').attr('autocomplete'), 'current-password');
  assert.equal($('#change-new-email').attr('type'), 'email');
  assert.equal($('#change-confirm-email').length, 1);
  const codes = emailChangePage({ pending: { request_id:'ID', current_email:'a***@old.example', new_email:'b***@new.example' } });
  $ = load(codes);
  assert.equal($('input[inputmode=numeric]').length, 1);
  assert.equal($('[name=confirm_change][required]').length, 1);
  assert.equal($('#old-email-code').length, 0);
  assert.match(codes, /New email verification code/);
  assert.match(codes, /No code is needed from your previous inbox/);
  assert.match(codes, /email hasn’t changed yet/);
  assert.ok(!emailChangePage({ available:false }).includes('<form'));
});

test('signed-in verification screen exposes safe email change, not a login bypass', () => {
  assert.match(emailApprovalPage({ signedIn:true, security:{ email_change_available:true } }), /id="change-approval-email"/);
  assert.ok(!emailApprovalPage({ signedIn:false, security:{ email_change_available:true } }).includes('id="change-approval-email"'));
});

function fixture(codes = false) {
  const ids = ['email-change-error','email-change-status','cancel-email-change', codes ? 'email-change-confirm-form' : 'email-change-request-form'];
  const nodes = Object.fromEntries(ids.map(id => [id, { textContent:'', disabled:false, addEventListener(type, fn) { this[type] = fn; } }]));
  const form = nodes[codes ? 'email-change-confirm-form' : 'email-change-request-form'];
  form.reportValidity = () => true;
  form.elements = codes ? { new_code:{value:'654321'}, confirm_change:{checked:false} } : { current_password:{value:'test-only'}, new_email:{value:'NEW@example.com'}, confirm_email:{value:'new@example.com'} };
  const root = { isConnected:true, querySelector: selector => nodes[selector.slice(1)] || null, querySelectorAll: () => [nodes['cancel-email-change']] };
  return { root, nodes, form, submit() { form.submit({ preventDefault() {}, currentTarget:form }); } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function storage() { const old = globalThis.localStorage; globalThis.localStorage = { getItem: () => 'a'.repeat(64) }; return () => { globalThis.localStorage = old; }; }

test('request checks repeated email, sends once, clears password and retains no plaintext pending credentials', async () => {
  const restore = storage(), view = fixture(); let calls = 0, payload, pending, resolve;
  const cleanup = mountEmailChange({ ...view, api:{requestEmailChange:(_token,body)=>{calls++;payload=body;return new Promise(done=>{resolve=done;});}}, token:'token', onPending:value=>{pending=value;}, onCancel(){}, onComplete(){} });
  try {
    view.form.elements.confirm_email.value = 'different@example.com'; view.submit(); assert.equal(calls, 0);
    view.form.elements.confirm_email.value = 'new@example.com'; view.submit(); view.submit(); assert.equal(calls, 1);
    assert.equal(payload.new_email, 'new@example.com');
    resolve({request_id:'ID'}); await flush();
    assert.equal(view.form.elements.current_password.value, '');
    assert.deepEqual(pending, {request_id:'ID'});
  } finally { cleanup(); restore(); }
});

test('confirmation sends only the new code with server confirmation', async () => {
  const restore = storage(), view = fixture(true); let calls = 0, payload, completed = 0;
  const cleanup = mountEmailChange({ ...view, pending:{request_id:'ID'}, api:{confirmEmailChange:async(_token,body)=>{calls++;payload=body;return {token:'fresh'};}}, token:'old', onComplete:()=>completed++, onPending(){}, onCancel(){} });
  try {
    view.submit(); assert.equal(calls, 0);
    view.form.elements.confirm_change.checked = true; view.submit(); await flush();
    assert.equal(calls, 1); assert.equal(payload.confirm_change, true);
    assert.ok(!('old_code' in payload)); assert.equal(payload.new_code, '654321');
    assert.equal(completed, 1);
  } finally { cleanup(); restore(); }
});

test('cancel invalidates pending request on the server before leaving', async () => {
  const restore = storage(), view = fixture(true); let cancelled = 0, resolve;
  const cleanup = mountEmailChange({ ...view, pending:{request_id:'ID'}, api:{cancelEmailChange:()=>new Promise(done=>{resolve=done;})}, token:'token', onCancel:()=>cancelled++, onPending(){}, onComplete(){} });
  try {
    view.nodes['cancel-email-change'].click(); assert.equal(cancelled, 0);
    resolve(); await flush(); assert.equal(cancelled, 1);
  } finally { cleanup(); restore(); }
});

test('late responses cannot update the account after navigating away', async () => {
  const restore = storage(), view = fixture(true); let resolve, completed = 0;
  view.form.elements.confirm_change.checked = true;
  const cleanup = mountEmailChange({ ...view, pending:{request_id:'ID'}, isCurrent:()=>view.root.isConnected, api:{confirmEmailChange:()=>new Promise(done=>{resolve=done;})}, token:'token', onComplete:()=>completed++, onPending(){}, onCancel(){} });
  try { view.submit(); view.root.isConnected=false; resolve({token:'new'}); await flush(); assert.equal(completed, 0); }
  finally { cleanup(); restore(); }
});

test('Profile integration preserves account id and handles token rotation without logging out mid-change', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url),'utf8');
  assert.match(app, /id="change-account-email"/);
  assert.match(app, /route === "change-email"/);
  assert.match(app, /deferredEmailAuthExpiry/);
  assert.match(app, /await finishSignIn\(data\); route = "profile"/);
  assert.doesNotMatch(readFileSync(new URL('../email-change-ui.js', import.meta.url),'utf8'), /localStorage\.setItem|sessionStorage\.setItem/);
});
