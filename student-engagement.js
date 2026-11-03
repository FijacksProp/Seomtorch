let activeDialog = null;
const introductionMemory = new Map();
let postPracticeJob = null;
const checkedFeedbackSessions = new Set();

export function cancelPostPracticeFeedback() {
  if (postPracticeJob) clearTimeout(postPracticeJob.timer);
  postPracticeJob = null;
}

export function schedulePostPracticeFeedback({ api, token, sessionId, completedTests, isCurrentResult, isBlocked, escapeHtml }) {
  if (!sessionId || !token || !Number.isFinite(completedTests) || completedTests < 3 || checkedFeedbackSessions.has(sessionId)) return;
  if (postPracticeJob?.sessionId === sessionId) return;
  cancelPostPracticeFeedback();
  const job = { sessionId, timer: null, granted: false, expiresAt: Date.now() + 120000 };
  postPracticeJob = job;
  const current = () => postPracticeJob === job && Date.now() < job.expiresAt && isCurrentResult();
  const blocked = () => document.hidden || isBlocked() || document.querySelector('[aria-modal="true"]');
  const retry = () => { if (current()) job.timer = setTimeout(check, 1000); };
  const remember = () => {
    checkedFeedbackSessions.add(sessionId);
    if (checkedFeedbackSessions.size > 200) checkedFeedbackSessions.delete(checkedFeedbackSessions.values().next().value);
  };
  async function check() {
    if (!current()) { if (postPracticeJob === job) cancelPostPracticeFeedback(); return; }
    if (blocked()) { retry(); return; }
    if (!job.granted) {
      try {
        const response = await api.claimFeedbackPrompt(token, sessionId);
        if (!current()) return;
        remember();
        if (!response.show) { cancelPostPracticeFeedback(); return; }
        job.granted = true;
      } catch {
        // Feedback is optional. A network failure must never interrupt results.
        if (current()) { remember(); cancelPostPracticeFeedback(); }
        return;
      }
    }
    if (!current()) return;
    if (blocked()) { retry(); return; }
    cancelPostPracticeFeedback();
    showFeedbackPanel({ api, token, escapeHtml });
  }
  job.timer = setTimeout(check, 1800);
}

export function closeStudentDialogs() {
  activeDialog?.();
}

export function openStudentDialog({ title, eyebrow = "Seomtorch", content, escapeHtml: e, className = "", canClose = () => true }) {
  closeStudentDialogs();
  const previousFocus = document.activeElement;
  const controller = new AbortController();
  const overlay = document.createElement("div");
  overlay.className = "student-dialog-backdrop";
  overlay.innerHTML = `<section class="student-dialog ${className}" role="dialog" aria-modal="true" aria-labelledby="student-dialog-title"><button type="button" class="student-dialog-close" data-close-student-dialog aria-label="Close dialog">×</button><header><p class="eyebrow">${e(eyebrow)}</p><h2 id="student-dialog-title" tabindex="-1">${e(title)}</h2></header><div data-dialog-content>${content}</div></section>`;
  function close() {
    controller.abort();
    overlay.remove();
    document.body.classList.remove("student-dialog-open");
    if (activeDialog === close) activeDialog = null;
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  overlay.addEventListener("click", event => {
    if ((event.target === overlay || event.target.closest("[data-close-student-dialog]")) && canClose() !== false) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); if (canClose() !== false) close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...overlay.querySelectorAll('button:not([disabled]), input, textarea, select, a[href], summary')].filter(item => item.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }, { signal: controller.signal });
  document.body.classList.add("student-dialog-open");
  document.body.appendChild(overlay);
  activeDialog = close;
  overlay.querySelector("#student-dialog-title").focus();
  return { overlay, close, signal: controller.signal };
}

export function eligibleForUniversityOffer({ user, mode, access, ready }) {
  return Boolean(ready && user && !user.is_staff && !user.is_superuser && !user.must_change_password && mode === "university" && !access?.has_all_access && !access?.is_trial && !(access?.unlocked_courses || []).length);
}

export function maybeShowUniversityIntroduction({ user, mode, access, ready, config, escapeHtml: e, onViewPlans }) {
  if (!eligibleForUniversityOffer({ user, mode, access, ready }) || document.querySelector('[aria-modal="true"]')) return false;
  const key = `seomtorch-access-introduction:${user.public_id}`;
  let lastShown = introductionMemory.get(key) || 0;
  try { lastShown = Math.max(lastShown, Number(localStorage.getItem(key)) || 0); } catch {}
  if (Date.now() - lastShown < 24 * 60 * 60 * 1000) return false;
  const price = Number(config?.single_course_price);
  const { overlay, close } = openStudentDialog({
    title: "Make room for the whole course.", eyebrow: "University course access", escapeHtml: e, className: "course-introduction",
    content: `<div class="course-intro-art" aria-hidden="true"><span class="course-art-rule"></span><div class="course-art-book book-one"><small>SEOMTORCH</small><strong>ANA<br>201</strong><span>Upper &amp; Lower Limb</span></div><div class="course-art-book book-two"><small>SEOMTORCH</small><strong>ANA<br>203</strong><span>Embryology</span></div><div class="course-art-book book-three"><small>SEOMTORCH</small><strong>PIO<br>201</strong><span>Physiology</span></div></div><p class="student-dialog-lede">Keep exploring the free topics, or choose a pass for the materials and practice you need this semester.</p><ul class="course-intro-benefits"><li>Course topics and worked explanations</li><li>Timed practice and available study notes</li><li>Your progress, saved to your account</li></ul>${Number.isFinite(price) && price > 0 ? `<p class="course-intro-price">Single-course passes from <strong>₦${price.toLocaleString()}</strong>. See plans for access periods and options.</p>` : ""}<div class="student-dialog-actions"><button type="button" class="button" data-intro-plans>View course plans <span aria-hidden="true">→</span></button><button type="button" class="circle-text-button" data-close-student-dialog>Keep exploring</button></div><p class="student-dialog-fine">No pressure to decide now. You can find plans in the university portal whenever you’re ready.</p>`,
  });
  introductionMemory.set(key, Date.now());
  try { localStorage.setItem(key, String(Date.now())); } catch {}
  overlay.querySelector("[data-intro-plans]").addEventListener("click", () => { close(); onViewPlans(); });
  return true;
}

export function showFeedbackPanel({ api, token, escapeHtml: e, reportMessage = null }) {
  const isReport = Boolean(reportMessage);
  const maxLength = isReport ? 1000 : 4000;
  let submitting = false, completed = false;
  const { overlay, close, signal } = openStudentDialog({
    title: isReport ? "Report a message." : "What should Seomtorch improve?",
    eyebrow: isReport ? "Keep your study circle safe" : "The listening desk",
    escapeHtml: e,
    canClose: () => {
      if (submitting) {
        overlay.querySelector("[data-feedback-error]").textContent = "Your submission is still being sent. Please wait for confirmation.";
        return false;
      }
      if (completed || !input.value.trim()) return true;
      if (!overlay.querySelector("[data-feedback-discard]")) {
        const warning = document.createElement("div");
        warning.className = "feedback-discard"; warning.dataset.feedbackDiscard = "";
        warning.innerHTML = '<p>Leave this draft? Your unsent text will be lost.</p><button type="button" class="circle-text-button" data-keep-feedback>Keep writing</button><button type="button" class="circle-text-button" data-discard-feedback>Discard draft</button>';
        overlay.querySelector("[data-dialog-content]").append(warning);
        warning.querySelector("[data-keep-feedback]").addEventListener("click", () => { warning.remove(); input.focus(); });
        warning.querySelector("[data-discard-feedback]").addEventListener("click", close);
      }
      overlay.querySelector("[data-keep-feedback]").focus();
      return false;
    },
    content: `<p class="student-dialog-lede">${isReport ? "Only this message and your reason will be shared privately with Seomtorch administrators—not the rest of your conversation." : "Tell us what is working, what feels frustrating, or what you wish was here. This goes privately to our administrators."}</p>${isReport ? `<blockquote class="feedback-reported-message">${e(reportMessage.body)}</blockquote>` : ""}<form class="feedback-form" data-feedback-form>${isReport ? "" : '<fieldset class="feedback-categories"><legend>What would you like to share?</legend><label><input type="radio" name="category" value="improvement" checked><span>An improvement</span></label><label><input type="radio" name="category" value="bug"><span>A problem</span></label><label><input type="radio" name="category" value="general"><span>Something else</span></label></fieldset>'}<label for="student-feedback-body">${isReport ? "What concerns you about this message?" : "Your honest feedback"}</label><textarea id="student-feedback-body" name="body" rows="5" minlength="5" maxlength="${maxLength}" placeholder="${isReport ? "Please explain what happened…" : "It would be helpful if…"}" required aria-describedby="feedback-writing-help"></textarea><div class="feedback-writing-meta" id="feedback-writing-help"><span>At least 5 characters. Don’t include passwords or payment details.</span><span data-feedback-count>0 / ${maxLength}</span></div><p class="feedback-error" data-feedback-error role="alert"></p><div class="student-dialog-actions"><button class="button" type="submit">${isReport ? "Send private report" : "Send feedback"} <span aria-hidden="true">→</span></button><button class="circle-text-button" type="button" data-close-student-dialog>Cancel</button></div></form>${!isReport ? '<details class="feedback-history"><summary>Your recent feedback</summary><div data-feedback-history>Loading your submissions…</div></details>' : ""}`,
  });
  const input = overlay.querySelector("textarea");
  input.addEventListener("input", () => { overlay.querySelector("[data-feedback-count]").textContent = `${input.value.length} / ${maxLength}`; });
  let pending = null;
  if (!isReport) api.feedback(token).then(data => {
    if (!overlay.isConnected) return;
    const target = overlay.querySelector("[data-feedback-history]");
    target.innerHTML = data.feedback.length ? data.feedback.map(item => `<article><div><strong>${e(item.status_label)}</strong><time>${e(new Date(item.created_at).toLocaleDateString([], { day: "numeric", month: "short" }))}</time></div><p>${e(item.body.slice(0, 160))}${item.body.length > 160 ? "…" : ""}</p></article>`).join("") : '<p>No submissions yet. Your feedback will appear here.</p>';
  }).catch(() => { if (overlay.isConnected) overlay.querySelector("[data-feedback-history]").textContent = "Your submission history is unavailable right now."; });
  overlay.querySelector("form").addEventListener("submit", async event => {
    event.preventDefault();
    if (submitting) return;
    const body = input.value.trim();
    if (body.length < 5) { input.focus(); return; }
    const button = event.target.querySelector('[type="submit"]'), error = overlay.querySelector("[data-feedback-error]");
    const category = isReport ? "safety" : new FormData(event.target).get("category");
    if (!pending || pending.body !== body || pending.category !== category) pending = { body, category, client_id: crypto.randomUUID() };
    button.disabled = true; button.textContent = "Sending…"; error.textContent = "";
    submitting = true;
    overlay.querySelector("[data-feedback-discard]")?.remove();
    try {
      const response = isReport ? await api.reportBuddyMessage(token, reportMessage.id, body) : await api.submitFeedback(token, pending);
      if (!overlay.isConnected || signal.aborted) return;
      submitting = false; completed = true;
      overlay.querySelector("[data-dialog-content]").innerHTML = `<div class="feedback-receipt" role="status"><span class="feedback-receipt-mark" aria-hidden="true">✓</span><h3>Thank you. We’ve received it.</h3><p>${isReport ? "Your report is in the administrators’ private inbox." : "Your feedback is now in the administrators’ private inbox. You can check its review status from this form."}</p><p class="feedback-reference">Reference ${e(response.id.slice(0, 8).toUpperCase())}</p><button type="button" class="button" data-receipt-done>Done</button></div>`;
      overlay.querySelector("[data-receipt-done]").addEventListener("click", close);
      overlay.querySelector("[data-receipt-done]").focus();
    } catch (caught) {
      submitting = false;
      if (overlay.isConnected) { error.textContent = caught.message || "Could not send your feedback. Your text is still here."; button.disabled = false; button.textContent = isReport ? "Send private report" : "Send feedback"; }
    }
  });
}
