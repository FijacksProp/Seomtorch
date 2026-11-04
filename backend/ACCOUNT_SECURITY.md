# Email verification and one active student sign-in

Deploy this feature **disabled** until real transactional delivery succeeds. It does not require changing the website's Vercel URL or buying a domain immediately, provided Brevo approves your sender and supports its managed-sender fallback on your account. A custom authenticated domain remains the recommended long-term configuration.

## What the release does

- Students prove ownership of their existing registered email with a six-digit code, valid for five minutes and bound to the requesting browser.
- New registrations return no usable auth token until verification succeeds.
- Existing signed-in students see a reminder during a configured grace period. After the deadline, the API blocks normal activity until verification, while preserving access to verification, account status, password change and sign-out.
- An approved browser can sign in with its password without repeated OTP emails. New/different browser storage requires password plus email approval.
- A successful approval or approved-browser login revokes all previous student API tokens under a database user lock. Failed codes, failed delivery and merely requesting a transfer do not revoke the owner's token.
- Browser transfers require explicit confirmation. Two accepted transfers are allowed per rolling 30 days; initial enrollment does not count. This discourages taking turns but cannot stop an owner deliberately forwarding codes.
- Five code-check attempts per challenge; 60-second resend cooldown; five code emails/hour and ten/day per account, stored in the database. New email-change requests send one code and consume one slot; earlier two-code requests retain their original quota cost. IP throttles add another layer but do not replace these persistent limits.
- Codes and browser keys are stored only as keyed digests. Challenge IDs/codes are sent in POST bodies, not URLs. No API key, OTP or browser secret appears in admin screens or logs.
- Student email verification status appears in Monitor's individual student view. Read-only request/transfer history is available in Django administration under Email sign in challenges. Staff accounts and Monitor's separate Django sessions are deliberately excluded from this student anti-sharing policy.

## Brevo setup (your part)

1. In Brevo, finish account onboarding and confirm transactional sending is enabled. Under **Senders, domains & dedicated IPs** (wording may vary), add a sender named **Seomtorch** with **seomtorchacademy@gmail.com** and complete the inbox verification.
2. Because Gmail is not a domain you control, do not try to add Gmail DNS records. Confirm Brevo permits sending with its managed-sender fallback for this account. If it requires your own authenticated domain, do not enable enforcement until that requirement is resolved.
3. Under **SMTP & API → API keys**, create an API key. Use the **API key**, not an SMTP password. Keep it private; paste it directly into Render's Environment page.
4. Set these **Render backend** environment variables:

   ```text
   BREVO_API_KEY=<your private Brevo API key>
   BREVO_SENDER_EMAIL=seomtorchacademy@gmail.com
   BREVO_SENDER_NAME=Seomtorch
   ACCOUNT_SECURITY_ENABLED=False
   ```

   No Brevo key belongs in Vercel, public config.js, Git, chat, or screenshots.

## Deployment and safe activation

1. Deploy the backend and frontend with `ACCOUNT_SECURITY_ENABLED=False`. The normal Render startup migration command must apply accounts migration 0010 before traffic is served. Old sign-in behaviour remains unchanged.
2. Wait for the deployment to succeed and run an explicit delivery check. **Render free web services have no web shell.** For the free tier, temporarily change **Settings → Start Command** from `bash backend/start.sh` to:

   ```sh
   python backend/manage.py test_brevo_email seomtorchacademy@gmail.com; bash backend/start.sh
   ```

   Deploy once, check the deployment logs for the delivery-test outcome, and check the sender inbox. The semicolon deliberately lets the web service start even if the email test fails; it does not bypass verification or enable enforcement. After the test, restore Start Command to `bash backend/start.sh` so service restarts don't keep sending test messages. This assumes the documented blank Root Directory (repository root).

   On a paid service with shell access, run from the repository root instead:

   ```text
   python backend/manage.py test_brevo_email seomtorchacademy@gmail.com
   ```

   Check arrival time, Spam/Junk, the visible sender, and Brevo's transactional delivery logs. API acceptance alone does not prove inbox delivery. Also test consenting Gmail and Outlook addresses before rollout. The command sends a labelled test message, not a usable login code.
3. Choose a rollout date and a grace deadline at least seven days later. Set `ACCOUNT_SECURITY_GRACE_UNTIL` to that deadline in ISO format with a timezone, for example `YYYY-MM-DDT23:59:59+01:00` with real date values. The date is intentionally not hard-coded in the project.
4. Set `ACCOUNT_SECURITY_ENABLED=True` and redeploy Render only after the frontend is live and delivery tests pass. Startup rejects an enabled configuration without Brevo credentials or a timezone-aware grace deadline.
5. Test with two browsers: request a code in browser B; A must keep working until B confirms. Confirm B, then verify A's next API request returns 401. Visible online tabs check status every minute and on focus; same-browser tabs follow token changes through storage events.
6. Verify an existing student's prompt, an incorrect/expired code, resend cooldown, sign-out, progress preservation and a new registration. Do not bulk-email OTPs to everyone: send on the student's request and monitor the daily quota.
7. Check Monitor/Admin for verification and transfer records. If delivery fails in production, set `ACCOUNT_SECURITY_ENABLED=False` and redeploy to stop requiring approvals. This does not restore revoked tokens; students can sign in normally while disabled. Never automatically bypass OTP verification because a send failed.

## Editable grace deadline in Monitor

Open **Monitor → Account security** (`/monitor/account-security/`) as an active staff administrator. Choose the date and time in **Africa/Lagos (UTC+1)**, give a reason, click **Review change**, then confirm the impact and save. Dates in the past intentionally end the grace period immediately for unverified sessions on their next protected API request. An extension reopens grace for those sessions, but new-browser logins still require email approval.

Until the first confirmed Monitor save, the existing `ACCOUNT_SECURITY_GRACE_UNTIL` environment value remains authoritative. After a save, the shared database deadline takes priority and persists across deployments. Keep the valid Render environment value as the initial fallback; changing it later does not override a saved Monitor deadline. No redeploy is required for a Monitor edit. Student screens update on their next account refresh (visible online tabs check roughly once a minute).

This page cannot enable/disable `ACCOUNT_SECURITY_ENABLED`, verify student inboxes, or bypass browser transfer checks. Changes are CSRF-protected, require staff access and explicit confirmation, and record the old/new date, reason, actor and time. Stale forms are rejected if another administrator has saved first. The latest 20 changes appear in Monitor; complete read-only history is available in Django administration under Account security policy changes. Migration 0011 must run before this page is used; the normal startup migration command handles it.

## Quota and retention

Brevo's free plan currently allows 300 total email sends per day. Other Brevo traffic shares that limit. A provider queue can deliver a code after expiry: do not enable mandatory verification during a mass-mail campaign or near quota exhaustion. Monitor Brevo usage and delivery logs; upgrade or increase capacity before authentication traffic outgrows the allowance. This implementation does not promise guaranteed delivery or automatically purchase capacity.

Challenge records are private security audit data. Remove expired records older than 90 days using your normal approved maintenance process; retain accepted transfers for at least 30 days so the transfer limit cannot be bypassed by cleanup.

## Recovery and ownership checks

An email address or six-character Student ID alone is **not proof of ownership**. Never ask students to forward OTPs or send passwords. Confirm ownership independently using existing support procedures and evidence such as payment references checked against actual subscription records. Do not replace a registered email merely because someone knows the account password.

For a confirmed lost/replaced-device case, a privileged operator can run:

```text
python manage.py recover_student_signin ABC123 --reason SUPPORT-TICKET-123
```

This revokes student tokens, invalidates pending codes and clears the browser binding. It does not grant access, alter the subscription, erase progress, or verify a new email. The student still needs their password and registered inbox. The recovery is logged in their activity. For an independently approved email correction, use Django User administration; changing an email clears its verification and browser binding, and pending codes for the old address cannot be redeemed. Perform sign-in recovery as well to revoke old tokens.

## Student email changes

Signed-in students can use **Profile → Change email** (also available from the signed-in verification screen). The current password and a code sent **only to the new email** are required. Access to the old inbox is not required, allowing a signed-in student to correct a mistyped address. The new address is entered twice to reduce mistakes, and the final form requires explicit confirmation. The code expires after five minutes. Resending replaces it; Cancel invalidates the pending request on the server.

The old email remains unchanged until the new-inbox code is accepted. Codes are stored as keyed hashes, tied to the account, requesting browser and current password; five unsuccessful checks exhaust a request. Addresses are normalized, checked for conflicts when requested and again at confirmation, and protected by the database uniqueness constraint. Delivery failures are counted toward the shared rate limit without revoking the current sign-in. No password or code is saved in frontend storage.

A successful change preserves the Student ID, progress and subscription, marks the new email verified, revokes old API sign-ins and returns a fresh token to the current browser. Existing verified students must use their active browser; this flow cannot reset the browser-transfer counter or redirect an account using only a shared password. If the former email was verified, a best-effort security notice is sent to it after commit; no message is sent to a former unverified address that may be a typo. Notification failure does not undo a completed change. Read-only change history is in Django Admin under Email change requests; code hashes are not displayed.

This is not an unauthenticated recovery endpoint. Students who cannot sign in still need the independently verified support recovery process above. Because the old inbox does not approve changes, someone with both an active account session and its password could redirect the email; this is the deliberate tradeoff for correcting incorrect/inaccessible addresses. A password alone on a new browser still cannot bypass the existing email-approval rule for verified accounts. Staff accounts use administrator recovery rather than this student workflow. No additional environment variables are needed; migrations 0012–0013 run through the existing startup script and the existing Brevo sender/key are reused. Each request/resend sends one code email, plus a best-effort security notice to the former address after success, so monitor the shared Brevo quota. The legacy old-code hash column is retained only for rolling-deploy compatibility; new requests leave it empty and never check it.

## Limits of browser enforcement

The **Screenshot & Content Shield** control is in **Monitor → Account security**, separate from Monetization & Plans. Moving it does not reset its saved value. Only staff can submit an explicit enable/disable change; pricing updates cannot alter this setting. No environment changes are needed. The shield provides browser-level deterrents and watermarks, not guaranteed capture prevention.

The browser key identifies browser storage, not hardware. Private browsing, clearing site data, a different browser or an independently stored PWA may count as a new browser. Clearing storage does not reset the server-side transfer counter. A copied token or already-loaded/offline material cannot be reliably retracted from someone else's computer. Paid API requests remain server-authorized, but no web app can guarantee preventing screenshots, saved content, or willing credential/code sharing. This is an online sign-in control, not hardware DRM.

Reference: https://developers.brevo.com/docs/send-a-transactional-email
