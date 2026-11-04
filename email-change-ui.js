import { trustedBrowserKey } from './account-security-ui.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);

export function emailChangePage({ email = '', pending = null, available = true }) {
  const codes = Boolean(pending?.request_id);
  return `<main class="email-security-screen email-change-screen"><section class="email-security-card" aria-labelledby="email-change-title"><a class="email-security-brand" href="./" aria-label="Seomtorch home"><img src="assets/seomtorch_logo.png" alt="" width="46" height="46"><span>Seomtorch<small>Prepare with purpose</small></span></a><p class="eyebrow">Account security · ${codes ? '2 / Verify new email' : '1 / Your new address'}</p><h1 id="email-change-title">${codes ? 'Verify your<br>new email.' : 'A new email.<br>The same progress.'}</h1><p class="email-security-intro">${codes ? 'We sent one six-digit code to your new email. Enter it within five minutes. No code is needed from your previous inbox.' : `Your current sign-in email is <strong>${escape(email)}</strong>. Your progress, Student ID and subscription won’t change.`}</p><div class="email-security-policy"><strong>${codes ? 'Your email hasn’t changed yet.' : 'Your new inbox is all you need.'}</strong><p>${codes ? 'Confirm the code below to make this your new verified sign-in email.' : 'Confirm your current password, then verify the new email address. You don’t need access to the previous inbox, but you must already be signed in.'}</p></div>${!available ? '<p class="auth-error" role="alert">Email changes are not available for this account right now. Please contact support.</p>' : codes ? `<form id="email-change-confirm-form"><div class="email-change-codes"><div class="field"><label for="new-email-code">New email verification code</label><small>${escape(pending.new_email)}</small><input id="new-email-code" name="new_code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" required></div></div><label class="email-transfer-consent"><input type="checkbox" name="confirm_change" required><span>Use my new verified email to sign in and sign out other browsers.</span></label><button type="submit" class="button">Confirm email change →</button></form><button type="button" class="email-security-text" id="resend-email-change" disabled>Resend code in 60s</button>` : '<form id="email-change-request-form"><div class="field"><label for="change-current-password">Current password</label><input id="change-current-password" name="current_password" type="password" autocomplete="current-password" required></div><div class="field"><label for="change-new-email">New email address</label><input id="change-new-email" name="new_email" type="email" maxlength="254" autocomplete="email" required></div><div class="field"><label for="change-confirm-email">Confirm new email address</label><input id="change-confirm-email" name="confirm_email" type="email" maxlength="254" autocomplete="off" required></div><button type="submit" class="button">Send verification code →</button></form>'}<p class="auth-error" id="email-change-error" role="alert"></p><p class="email-security-status" id="email-change-status" role="status" aria-live="polite"></p><button type="button" class="email-security-text" id="cancel-email-change">${codes ? 'Cancel · keep my current email' : 'Back to my account'}</button></section></main>`;
}

export function mountEmailChange({ root, api, token, pending, onPending, onComplete, onCancel, onBusy = () => {}, isCurrent = () => true }) {
  let busy = false, timer;
  const error = root.querySelector('#email-change-error'), status = root.querySelector('#email-change-status');
  const resend = root.querySelector('#resend-email-change');
  const until = Date.now() + (Number(pending?.resend_after) || 60) * 1000;
  function tick() {
    if (!root.isConnected || !isCurrent()) { clearInterval(timer); return; }
    const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    if (resend) { resend.disabled = busy || left > 0; resend.textContent = left ? `Resend code in ${left}s` : 'Resend code'; }
    if (!left) clearInterval(timer);
  }
  if (resend) { tick(); timer = setInterval(tick, 1000); }
  async function run(action) {
    if (busy || !isCurrent()) return;
    busy = true; onBusy(true); error.textContent = ''; status.textContent = 'Please wait…';
    root.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { await action(); }
    catch (caught) { if (root.isConnected && isCurrent()) error.textContent = caught?.message || 'We couldn’t complete this request. Your current email is unchanged.'; }
    finally {
      busy = false; onBusy(false);
      if (root.isConnected && isCurrent()) { status.textContent = ''; root.querySelectorAll('button').forEach(button => { button.disabled = false; }); tick(); }
    }
  }
  root.querySelector('#email-change-request-form')?.addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const target = form.elements.new_email.value.trim().toLowerCase();
    if (target !== form.elements.confirm_email.value.trim().toLowerCase()) { error.textContent = 'The new email addresses do not match.'; return; }
    run(async () => {
      const result = await api.requestEmailChange(token, { current_password: form.elements.current_password.value, new_email: target, browser_key: trustedBrowserKey() });
      form.elements.current_password.value = '';
      if (isCurrent()) onPending(result);
    });
  });
  root.querySelector('#email-change-confirm-form')?.addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    if (!form.reportValidity() || !form.elements.confirm_change.checked) return;
    const new_code = form.elements.new_code.value.trim();
    if (!/^[0-9]{6}$/.test(new_code)) return;
    run(async () => {
      const result = await api.confirmEmailChange(token, { request_id: pending.request_id, new_code, confirm_change: true, browser_key: trustedBrowserKey() });
      if (isCurrent()) await onComplete(result);
    });
  });
  resend?.addEventListener('click', () => run(async () => {
    const result = await api.resendEmailChange(token, { request_id: pending.request_id, browser_key: trustedBrowserKey() });
    if (isCurrent()) onPending(result);
  }));
  root.querySelector('#cancel-email-change')?.addEventListener('click', () => {
    if (busy) return;
    if (!pending) { onCancel(); return; }
    run(async () => {
      await api.cancelEmailChange(token, { request_id: pending.request_id, browser_key: trustedBrowserKey() });
      if (isCurrent()) onCancel();
    });
  });
  return () => { clearInterval(timer); onBusy(false); };
}
