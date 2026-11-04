const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);

export function trustedBrowserKey(storage = localStorage, random = crypto) {
  const saved = storage.getItem('seomtorch-browser-key');
  if (/^[a-f0-9]{64}$/.test(saved || '')) return saved;
  const bytes = random.getRandomValues(new Uint8Array(32));
  const key = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  storage.setItem('seomtorch-browser-key', key);
  return key;
}

export function securityNotice(security = {}) {
  if (!security.enabled || security.email_verified) return '';
  const deadline = security.grace_until ? new Date(security.grace_until) : null;
  const date = deadline && !Number.isNaN(deadline.getTime()) ? deadline.toLocaleDateString(undefined, { day:'numeric', month:'short' }) : '';
  return `<aside class="account-security-notice"><div><strong>Keep your account yours.</strong><span>Verify your email${date ? ` by ${escape(date)}` : ''} to protect your sign-in. Your progress and subscription stay with you.</span></div><button type="button" class="button outline small" data-verify-account>Verify email →</button></aside>`;
}

export function emailApprovalPage({ challenge = null, security = {}, signedIn = false }) {
  const hasCode = Boolean(challenge?.challenge_id);
  const masked = challenge?.masked_email || security.masked_email || 'your registered email';
  return `<main class="email-security-screen"><section class="email-security-card" aria-labelledby="email-security-title"><a class="email-security-brand" href="./" aria-label="Seomtorch home"><img src="assets/seomtorch_logo.png" alt="" width="46" height="46"><span>Seomtorch<small>Prepare with purpose</small></span></a><p class="eyebrow">${challenge?.is_transfer ? 'Approve a browser transfer' : 'Your account, protected'}</p><h1 id="email-security-title">${hasCode ? 'Check your inbox.' : 'Keep your account yours.'}</h1><p class="email-security-intro">${hasCode ? `Enter the six-digit code sent to <strong>${escape(masked)}</strong>. It expires in five minutes.` : `We’ll send a verification code to <strong>${escape(masked)}</strong>. No progress or subscription will be lost.`}</p><div class="email-security-policy"><strong>One account. One active sign-in.</strong><p>Confirming this code makes this your active browser and signs out other browsers. Never share your code—even with someone claiming to be our team.</p></div>${hasCode ? '<form id="email-code-form"><label for="email-code">Verification code</label><input id="email-code" name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" minlength="6" autocomplete="one-time-code" required placeholder="000000"><label class="email-transfer-consent"><input type="checkbox" name="approve_transfer" required><span>Make this my active browser and sign out other browsers.</span></label><button type="submit" class="button">Verify &amp; continue →</button></form><button class="email-security-text" id="resend-email-code" type="button" disabled>Resend code in 60s</button>' : '<button class="button" id="request-email-code" type="button">Send verification code →</button>'}<p class="auth-error" id="email-security-error" role="alert"></p><p class="email-security-status" id="email-security-status" role="status" aria-live="polite"></p><details class="email-security-help"><summary>Can’t access that email?</summary><p>Check Spam or Junk first. If you’re already signed in, use Change my email securely to correct the address with your password and a code sent to the new inbox. If you cannot sign in, contact Seomtorch support for ownership checks. Never share your password or verification codes.</p></details>${signedIn && security.email_change_available ? '<button type="button" class="email-security-text" id="change-approval-email">Change my email securely →</button>' : ''}<button type="button" class="email-security-text" id="cancel-email-approval">${signedIn && !security.verification_required ? 'Back to my account' : 'Back to sign in'}</button></section></main>`;
}

export function mountEmailApproval({ root, api, challenge, token, onVerified, onChallenge, onCancel, onChangeEmail, isCurrent = () => true }) {
  let current = challenge, busy = false;
  const error = root.querySelector('#email-security-error');
  const status = root.querySelector('#email-security-status');
  const resend = root.querySelector('#resend-email-code');
  let timer;
  const expires = Date.now() + (Number(challenge?.resend_after) || 60) * 1000;
  function tick() {
    if (!root.isConnected || !isCurrent()) { clearInterval(timer); return; }
    const left = Math.max(0, Math.ceil((expires - Date.now()) / 1000));
    if (resend) { resend.disabled = busy || left > 0; resend.textContent = left ? `Resend code in ${left}s` : 'Resend code'; }
    if (!left) clearInterval(timer);
  }
  if (resend) { tick(); timer = setInterval(tick, 1000); }
  async function run(action) {
    if (busy || !isCurrent()) return;
    busy = true; error.textContent = ''; status.textContent = 'Please wait…';
    root.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { await action(); }
    catch (caught) {
      if (root.isConnected && isCurrent()) {
        error.textContent = caught?.message || 'We couldn’t complete that request. Please try again.';
        if (caught?.status === 429) status.textContent = 'Please wait before requesting another code.';
      }
    } finally {
      busy = false;
      if (root.isConnected && isCurrent()) { root.querySelectorAll('button').forEach(button => { button.disabled = false; }); if (!error.textContent) status.textContent = ''; else if (!status.textContent.includes('wait before')) status.textContent = ''; tick(); }
    }
  }
  root.querySelector('#request-email-code')?.addEventListener('click', () => run(async () => {
    const next = await api.requestEmailCode(token, trustedBrowserKey());
    if (isCurrent()) onChallenge(next);
  }));
  resend?.addEventListener('click', () => run(async () => {
    const next = await api.resendEmailCode(current.challenge_id, trustedBrowserKey());
    if (isCurrent()) onChallenge(next);
  }));
  root.querySelector('#email-code-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const code = form.elements.code.value.trim();
    if (!/^[0-9]{6}$/.test(code) || !form.elements.approve_transfer.checked) return;
    run(async () => {
      const result = await api.verifyEmailCode(current.challenge_id, code, trustedBrowserKey());
      if (isCurrent()) await onVerified(result);
    });
  });
  root.querySelector('#cancel-email-approval')?.addEventListener('click', () => { if (!busy) { clearInterval(timer); onCancel(); } });
  root.querySelector('#change-approval-email')?.addEventListener('click', () => { if (!busy && onChangeEmail) { clearInterval(timer); onChangeEmail(); } });
  return () => clearInterval(timer);
}
