import { api, ApiError } from "./api-client.js";

const SUBJECTS = [
  { id: "english", name: "English Language", description: "Usage, comprehension and oral forms" },
  { id: "general-paper", name: "General Paper", description: "Civics, current affairs and general knowledge" },
  { id: "mathematics", name: "Mathematics", description: "Numbers, algebra and applied reasoning" },
];
const ALL_SUBJECT_ORDER = ["english", "mathematics", "general-paper"].map(id => SUBJECTS.find(subject => subject.id === id));

const FAQS = [
  { group: "Getting started", q: "What is Seomtorch designed for?", a: "Seomtorch is a personal study companion for structured JAMB, WAEC, NECO and Post-UTME preparation. It helps you practise by topic, learn from corrections and see where your next study session will matter most." },
  { group: "Getting started", q: "Do I need an account or internet connection?", a: "An account is required so your progress can be monitored and restored across devices. After signing in once, practice can continue offline and pending answers synchronize when the connection returns." },
  { group: "Getting started", q: "Can I install Seomtorch on my device?", a: "Yes. Use the Install app button. On iPhone or iPad, open Seomtorch in Safari, tap Share, then choose Add to Home Screen." },
  { group: "Practice and review", q: "How are questions selected?", a: "Sessions prioritise questions you have not seen, topics where your accuracy is lower, and questions you previously missed. Recently answered questions receive less priority, which reduces unnecessary repetition." },
  { group: "Practice and review", q: "Which subjects are available?", a: "English Language and General Paper are the two main preparation areas. A smaller Mathematics bank remains available as an additional practice option." },
  { group: "Practice and review", q: "Can I practise one topic only?", a: "Yes. Open Practice, select English Language or General Paper, then choose a topic. You can also choose All topics for a mixed session." },
  { group: "Practice and review", q: "How do timed sessions work?", a: "Choose any question count from 10 to 100 and enter the number of minutes you want to study. One overall countdown runs across the complete session." },
  { group: "Practice and review", q: "Can I practise every subject together?", a: "Yes. Choose All subjects to build one balanced session. Questions are grouped into clear subject sections under one overall timer." },
  { group: "Practice and review", q: "What does Save for review do?", a: "It bookmarks the current question in your account, making it available on every device. Open Practice, then Saved for review, to browse, remove or practise the collection." },
  { group: "Progress and scoring", q: "How is my streak calculated?", a: "A study day counts when you answer at least one question. Consecutive active days build your streak. Missing a day resets the current streak, but your best streak remains recorded." },
  { group: "Progress and scoring", q: "How do XP and levels work?", a: "You earn 5 XP for each correct answer. Incorrect answers do not award XP. Every 250 XP advances your level, while accuracy shows how well you understand the material." },
  { group: "Progress and scoring", q: "What is a focus area?", a: "A focus area is a topic with enough attempts to measure and an accuracy rate that needs attention. It is guidance for your next session, not a judgement of your ability." },
  { group: "Progress and scoring", q: "Are these scores official exam predictions?", a: "No. Your dashboard reflects only your activity in Seomtorch. Use it to guide revision, not as an official predicted examination score." },
  { group: "Data and offline use", q: "Where is my progress stored?", a: "Progress is stored securely in your Seomtorch account and cached in IndexedDB on this device for offline use. Pending offline activity synchronizes when the server is reachable." },
  { group: "Data and offline use", q: "How do I protect my progress?", a: "Your account is the primary record. You can also use Export data in Profile to keep a personal JSON backup." },
  { group: "Data and offline use", q: "What happens if I clear browser data?", a: "Signing in again restores synchronized progress from your account. Answers submitted while offline must reconnect and synchronize before browser data is cleared." },
];

const ICONS = {
  home: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V20H4Z"/><path d="M9 20v-6h6v6"/></svg>',
  practice: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M6 3.5h9l3 3V20.5H6Z"/><path d="M15 3.5v4h4M9 12h6M9 16h6"/></svg>',
  progress: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  profile: '<svg class="nav-icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
};

const DB_NAME = "seomtorch";
const DB_VERSION = 2;
const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

let db;
let questions = [];
let profile = null;
let authToken = localStorage.getItem("seomtorch-auth-token");
let currentUser = readCachedUser();
let attempts = [];
let bookmarks = [];
let route = "home";
let selectedSubject = null;
let selectedQuestionCount = 10;
let selectedStudyMinutes = 10;
let activeSession = null;
let sessionTimer = null;
let syncPromise = null;
let pendingSyncCount = 0;
let deferredInstallPrompt = null;
let authMode = "signin";
let selectedPracticeMode = "timed"; // 'timed' or 'normal'
let dailySprintCompleted = localStorage.getItem("seomtorch-sprint-" + new Date().toISOString().slice(0,10)) === "done";

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault(); deferredInstallPrompt = event;
  if (authToken && currentUser && profile && route !== "session") render();
});
window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; showToast("Seomtorch installed successfully"); if (route !== "session") render(); });

function readCachedUser() {
  try { return JSON.parse(localStorage.getItem("seomtorch-auth-user") || "null"); }
  catch { localStorage.removeItem("seomtorch-auth-user"); return null; }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("profile")) database.createObjectStore("profile", { keyPath: "id" });
      if (!database.objectStoreNames.contains("attempts")) {
        const store = database.createObjectStore("attempts", { keyPath: "id", autoIncrement: true });
        store.createIndex("questionId", "questionId");
        store.createIndex("subject", "subject");
      }
      if (!database.objectStoreNames.contains("bookmarks")) database.createObjectStore("bookmarks", { keyPath: "questionId" });
      if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta", { keyPath: "key" });
      if (!database.objectStoreNames.contains("auth")) database.createObjectStore("auth", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storeAction(storeName, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const getAll = name => storeAction(name, "readonly", store => store.getAll());
const get = (name, key) => storeAction(name, "readonly", store => store.get(key));
const put = (name, value) => storeAction(name, "readwrite", store => store.put(value));
const add = (name, value) => storeAction(name, "readwrite", store => store.add(value));
const clearStore = name => storeAction(name, "readwrite", store => store.clear());

async function loadQuestions() {
  try {
    const manifestResponse = await fetch("data/manifest.json");
    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      const packs = await Promise.all(manifest.packs.map(async pack => {
        const packResponse = await fetch(pack.file);
        if (!packResponse.ok) throw new Error(`Question pack could not be loaded: ${pack.id}`);
        return (await packResponse.json()).questions;
      }));
      questions = packs.flat();
      await put("meta", { key: "questionBank", version: manifest.version, loadedAt: Date.now() });
      return;
    }
  } catch {}
  // Fallback to single file
  const response = await fetch("data/questions.json");
  if (!response.ok) throw new Error("Question bank could not be loaded");
  const data = await response.json();
  questions = data.questions;
  await put("meta", { key: "questionBank", version: data.version, loadedAt: Date.now() });
}

async function loadData() {
  const profiles = await getAll("profile");
  profile = profiles[0] || null;
  attempts = await getAll("attempts");
  bookmarks = await getAll("bookmarks");
}

function today() { return new Date().toISOString().slice(0, 10); }
function yesterday() { const date = new Date(); date.setDate(date.getDate() - 1); return date.toISOString().slice(0, 10); }
function firstName() { return profile?.name?.trim().split(/\s+/)[0] || "Student"; }
function initials() { return profile?.name?.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "ST"; }
function accuracy(list = attempts) { return list.length ? Math.round(list.filter(item => item.correct).length / list.length * 100) : 0; }
function subjectName(id) { return SUBJECTS.find(subject => subject.id === id)?.name || id; }
function questionById(id) { return questions.find(question => question.id === id); }
function questionPassage(question) { return question?.passage_body || question?.passageBody || question?.passage || ""; }
function questionImage(question) { return question?.image_url || question?.imageUrl || ""; }
function questionVideo(question) { return question?.video_url || question?.videoUrl || ""; }
function xpState() {
  const xp = profile?.xp || 0;
  const level = 1 + Math.floor(xp / 250);
  const levelProgress = xp % 250;
  return { xp, level, levelProgress, remaining: 250 - levelProgress, percent: levelProgress / 250 * 100 };
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastRegion.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }

function showConfirmDialog({ title, message, detail = "", confirmLabel = "Confirm", cancelLabel = "Go back", tone = "default", onConfirm, onCancel, dismissible = true }) {
  document.querySelector("#app-dialog")?.remove();
  const dialog = document.createElement("div");
  dialog.id = "app-dialog"; dialog.className = "dialog-backdrop";
  dialog.innerHTML = `<section class="confirm-dialog ${tone}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><p class="eyebrow">${tone === "timeup" ? "Session ended" : "Please confirm"}</p><h2 id="dialog-title">${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${detail ? `<div class="dialog-detail">${detail}</div>` : ""}<div class="button-row">${dismissible ? `<button class="button outline" data-dialog-cancel>${escapeHtml(cancelLabel)}</button>` : ""}<button class="button" data-dialog-confirm>${escapeHtml(confirmLabel)}</button></div></section>`;
  document.body.appendChild(dialog);
  const close = callback => { dialog.remove(); callback?.(); };
  dialog.querySelector("[data-dialog-cancel]")?.addEventListener("click", () => close(onCancel));
  dialog.querySelector("[data-dialog-confirm]").addEventListener("click", () => close(onConfirm));
  dialog.addEventListener("click", event => { if (dismissible && event.target === dialog) close(onCancel); });
  dialog.querySelector("[data-dialog-confirm]").focus();
}

function navigate(nextRoute) {
  if (activeSession?.started && !activeSession.finished && route === "session") {
    showConfirmDialog({ title: "Leave this active session?", message: "Your timer is still running. Leaving now will end this session and preserve only answers you have already confirmed.", confirmLabel: "Leave session", cancelLabel: "Keep studying", tone: "warning", onConfirm: () => { clearInterval(sessionTimer); activeSession.finished = true; route = nextRoute; activeSession = null; if (nextRoute !== "practice") selectedSubject = null; render(); } });
    return;
  }
  if (route === "session" && activeSession && !activeSession.started) activeSession = null;
  route = nextRoute;
  if (nextRoute !== "practice") selectedSubject = null;
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function shell(content) {
  const xp = xpState();
  const nav = [
    ["home", "Home"], ["practice", "Practice"], ["progress", "Progress"], ["profile", "Profile"]
  ];
  return `<div class="layout">
    <aside class="sidebar">
      <button class="brand" data-route="home" aria-label="Seomtorch home">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="brand-name">Seomtorch<small>Prepare with purpose</small></span>
      </button>
      <nav class="nav" aria-label="Primary navigation">
        ${nav.map(([id, label]) => `<button class="nav-button ${route === id ? "active" : ""}" data-route="${id}">${ICONS[id]}<span>${label}</span></button>`).join("")}
      </nav>
      <div class="sidebar-foot"><div class="streak-panel"><svg class="streak-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.5c.5 3.2-.8 4.7-2.1 6.1-1.1 1.2-2.1 2.3-1.7 4.3-1.3-.7-2-2-1.9-3.7C5.3 11 4 13.5 4.3 16.1 4.7 19.6 7.6 22 11.2 22c4.8 0 8-3.1 8-7.7 0-4.1-2.5-8.3-6-11.8Z"/><path d="M12 19.2c-1.7 0-2.9-1.1-3-2.7-.1-1.2.5-2.3 1.5-3.2.1 1 .6 1.5 1.1 1.8-.2-1.7.7-2.7 1.6-3.7 1.2 1.5 1.8 3.1 1.7 4.6-.1 1.9-1.2 3.2-2.9 3.2Z"/></svg><div><span>Current streak</span><strong>${profile.rhythm || 0}<small> day${profile.rhythm === 1 ? "" : "s"}</small></strong></div></div><div class="xp-panel"><div><strong>Level ${xp.level}</strong><span>${xp.xp} XP</span></div><div class="xp-track"><i style="width:${xp.percent}%"></i></div><small>${xp.remaining} XP to next level</small></div><p>Come back tomorrow and keep it alive.</p></div>
    </aside>
    <div class="content-wrap">
      <header class="topbar"><span class="mobile-brand">Seomtorch</span><span class="sync-indicator ${pendingSyncCount > 0 ? 'pending' : navigator.onLine ? 'synced' : 'offline'}" title="${pendingSyncCount > 0 ? `${pendingSyncCount} items pending sync` : navigator.onLine ? 'Synced' : 'Offline'}"><i></i>${pendingSyncCount > 0 ? `<small>${pendingSyncCount}</small>` : ''}</span><div class="top-stat"><strong>${attempts.length}</strong><span>answered</span></div><div class="top-stat"><strong>${accuracy()}%</strong><span>accuracy</span></div><div class="top-xp" title="Level ${xp.level} · ${xp.remaining} XP to next level"><small>LV ${xp.level}</small><strong>${xp.xp} XP</strong></div><div class="top-streak" title="${profile.rhythm || 0}-day streak"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.5c.5 3.2-.8 4.7-2.1 6.1-1.1 1.2-2.1 2.3-1.7 4.3-1.3-.7-2-2-1.9-3.7C5.3 11 4 13.5 4.3 16.1 4.7 19.6 7.6 22 11.2 22c4.8 0 8-3.1 8-7.7 0-4.1-2.5-8.3-6-11.8Z"/></svg><span><small>Streak</small><strong>${profile.rhythm || 0}</strong></span></div><button class="avatar" data-route="profile" title="Open ${escapeHtml(profile.name)}'s profile">${initials()}</button></header>
      <main id="main">${content}</main>
    </div>
  </div>${!isStandalone() && route !== "session" ? '<button class="pwa-install-fab" data-install-app>Install app</button>' : ""}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function renderMath(html) {
  if (typeof renderMathInElement === "undefined") return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  try {
    renderMathInElement(container, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true }
      ],
      throwOnError: false
    });
  } catch {}
  return container.innerHTML;
}

function bindShell() {
  document.querySelectorAll("[data-route]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.route)));
  document.querySelectorAll("[data-install-app]").forEach(button => button.addEventListener("click", installApp));
}

async function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === "accepted") deferredInstallPrompt = null;
    return;
  }
  const message = isIos()
    ? "To install Seomtorch: tap the Share button in Safari, then choose ‘Add to Home Screen’."
    : "Open your browser menu and choose ‘Install app’ or ‘Add to Home screen’.";
  showConfirmDialog({ title: "Install Seomtorch", message, confirmLabel: "Got it", cancelLabel: "Close", onConfirm: () => {} });
}

function lastTopic() {
  const last = [...attempts].sort((a, b) => b.timestamp - a.timestamp)[0];
  return last ? questionById(last.questionId) : null;
}

function subjectStats(subjectId) {
  const list = attempts.filter(item => item.subject === subjectId);
  return { count: list.length, accuracy: accuracy(list) };
}

function renderHome() {
  const recent = lastTopic();
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
  const todayAttempts = attempts.filter(item => new Date(item.timestamp).toISOString().slice(0, 10) === today());
  const content = `<section class="page">
    <p class="eyebrow">Your study desk</p>
    <h1>${greeting}, ${escapeHtml(firstName())}.</h1>
    <p class="lede">A clear view of what you have done, where to focus, and the next useful step.</p>
    <article class="continue-card">
      <div><span class="label">${recent ? "Continue where you stopped" : "Begin your preparation"}</span><h2>${recent ? escapeHtml(recent.topic) : "Start with a focused session"}</h2><p>${recent ? `${subjectName(recent.subject)} · personalised question selection` : "Choose a subject and work through a short set of questions."}</p></div>
      <button class="button accent" id="continue-study">${recent ? "Continue studying" : "Choose a subject"}<span aria-hidden="true">→</span></button>
    </article>
    <article class="sprint-card" style="margin-top: 1rem;">
      <div><span class="label">Daily challenge</span><h2>5-Minute Sprint</h2><p>5 quick questions worth up to 25 XP. ${dailySprintCompleted ? 'Completed today ✓' : 'Ready to attempt'}</p></div>
      <button class="button ${dailySprintCompleted ? 'outline' : 'accent'}" id="start-sprint">${dailySprintCompleted ? 'Sprint completed ✓' : 'Start sprint →'}</button>
    </article>
    <div class="section-head"><h2>Today, at a glance</h2><p>Synchronized account activity</p></div>
    <div class="metric-strip">
      <div class="metric"><strong>${todayAttempts.length}</strong><span>answered today</span></div>
      <div class="metric"><strong>${accuracy(todayAttempts)}%</strong><span>today’s accuracy</span></div>
      <div class="metric streak-metric"><strong>${profile.rhythm || 0}<small> day${profile.rhythm === 1 ? "" : "s"}</small></strong><span>Current streak</span></div>
    </div>
    <div class="section-head"><h2>Subjects</h2><p>${questions.length} questions available</p></div>
    <div class="subject-list">
      ${SUBJECTS.map((subject, index) => { const stats = subjectStats(subject.id); return `<button class="subject-row" data-subject="${subject.id}"><span class="subject-num">0${index + 1}</span><span><span class="subject-title">${subject.name}</span><span class="subject-meta">${stats.count ? `${stats.accuracy}% accuracy across ${stats.count} attempts` : subject.description}</span></span><span class="mini-progress"><i style="width:${stats.accuracy}%"></i></span><span class="row-arrow" aria-hidden="true">→</span></button>`; }).join("")}
    </div>
  </section>`;
  app.innerHTML = shell(content);
  bindShell();
  document.querySelector("#continue-study").addEventListener("click", () => { route = "practice"; selectedSubject = recent?.subject || null; render(); });
  document.querySelector("#start-sprint").addEventListener("click", () => { if (!dailySprintCompleted) { route = "daily-sprint"; render(); } });
  document.querySelectorAll("[data-subject]").forEach(button => button.addEventListener("click", () => { route = "practice"; selectedSubject = button.dataset.subject; render(); }));
}

function topicAccuracy(subject, topic) {
  const list = attempts.filter(item => item.subject === subject && questionById(item.questionId)?.topic === topic);
  return list.length ? `${accuracy(list)}% accuracy · ${list.length} attempts` : "Not attempted yet";
}

function renderPractice() {
  if (!selectedSubject) {
    const content = `<section class="page">
      <p class="eyebrow">Practice</p>
      <h1>Choose your focus.</h1>

      <div class="mode-cards" style="display: flex; gap: 1rem; margin-bottom: 2rem;">
        <button class="mode-card ${selectedPracticeMode === 'timed' ? 'active' : ''}" data-mode="timed" style="flex: 1; padding: 1rem; border: 1px solid var(--border); border-radius: 8px; text-align: left; background: ${selectedPracticeMode === 'timed' ? 'var(--accent-light)' : 'transparent'};">
          <strong style="display: block; margin-bottom: 0.5rem;">Timed Practice</strong>
          <span style="font-size: 0.875rem;">Exam simulation. Answer everything first, see results and solutions at the end.</span>
        </button>
        <button class="mode-card ${selectedPracticeMode === 'normal' ? 'active' : ''}" data-mode="normal" style="flex: 1; padding: 1rem; border: 1px solid var(--border); border-radius: 8px; text-align: left; background: ${selectedPracticeMode === 'normal' ? 'var(--accent-light)' : 'transparent'};">
          <strong style="display: block; margin-bottom: 0.5rem;">Normal Practice</strong>
          <span style="font-size: 0.875rem;">Step-by-step study. Answer one question, immediately see the answer, explanation, video and discussion, then continue.</span>
        </button>
        <button class="mode-card" data-route="daily-sprint" style="flex: 1; padding: 1rem; border: 1px solid var(--border); border-radius: 8px; text-align: left; cursor: pointer;">
          <strong style="display: block; margin-bottom: 0.5rem;">Daily 5-Minute Sprint</strong>
          <span style="font-size: 0.875rem;">5 questions, one daily attempt, and up to 25 XP from correct answers. ${dailySprintCompleted ? '<strong>Completed today ✓</strong>' : ''}</span>
        </button>
      </div>

      <div class="review-entry"><div><span class="review-entry-count">${bookmarks.length}</span><div><p class="eyebrow">Your review library</p><h2>Saved for review</h2><p>${bookmarks.length ? `${bookmarks.length} question${bookmarks.length === 1 ? " is" : "s are"} ready to revisit.` : "Save useful or difficult questions during practice and they will appear here."}</p></div></div><button class="button ${bookmarks.length ? "" : "outline"}" data-subject="saved">${bookmarks.length ? "Open saved questions" : "View review library"} →</button></div>
      <div class="section-head"><h2>Subjects</h2><p>Choose a subject for ${selectedPracticeMode} practice</p></div>
      <div class="subject-list">
        <button class="subject-row all-subject-row" data-subject="all"><span class="subject-num">ALL</span><span><span class="subject-title">All subjects</span><span class="subject-meta">Balanced, grouped sections across English Language, General Paper and Mathematics</span></span><span class="mini-progress"><i style="width:${accuracy()}%"></i></span><span class="row-arrow">→</span></button>
        ${SUBJECTS.map((subject, index) => `<button class="subject-row" data-subject="${subject.id}"><span class="subject-num">0${index + 1}</span><span><span class="subject-title">${subject.name}</span><span class="subject-meta">${subject.description}</span></span><span class="mini-progress"><i style="width:${subjectStats(subject.id).accuracy}%"></i></span><span class="row-arrow">→</span></button>`).join("")}
      </div>
    </section>`;
    app.innerHTML = shell(content); bindShell();
    document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => { selectedPracticeMode = button.dataset.mode; render(); }));
    document.querySelectorAll("[data-subject]").forEach(button => button.addEventListener("click", () => { selectedSubject = button.dataset.subject; render(); }));
    return;
  }
  if (selectedSubject === "saved") return renderSavedReview();
  const allSubjects = selectedSubject === "all";
  const subject = allSubjects ? { name: "All subjects" } : SUBJECTS.find(item => item.id === selectedSubject);
  const topics = allSubjects ? [] : [...new Set(questions.filter(item => item.subject === selectedSubject).map(item => item.topic))];
  const settings = `<section class="session-builder" aria-label="Session settings"><div class="session-input"><label for="question-count">Questions</label><div><input id="question-count" type="number" min="10" max="100" step="1" value="${selectedQuestionCount}" inputmode="numeric" required><span>10–100</span></div><small>Choose any whole number from 10 to 100.</small></div>${selectedPracticeMode === "timed" ? `<div class="session-input"><label for="study-minutes">Study time</label><div><input id="study-minutes" type="number" min="1" max="600" step="1" value="${selectedStudyMinutes}" inputmode="numeric" required><span>minutes</span></div><small>Choose any whole number from 1 to 600 minutes.</small></div>` : `<div class="session-input"><label>Study time</label><div><strong>Untimed</strong></div><small>Work at your own pace with feedback after every answer.</small></div>`}</section>`;
  const content = `<section class="page"><button class="button outline" id="back-subjects">← Practice modes</button><div class="practice-heading"><p class="eyebrow">${subject.name}</p><h1>Build your session.</h1><p class="lede">Choose how many questions you want.${selectedPracticeMode === "timed" ? " Set the study time, then begin when you are ready." : " Guided practice has no countdown."}${allSubjects ? " Seomtorch will divide the questions into balanced subject sections." : " Then choose the topic you want to practise."}</p></div>${settings}${allSubjects ? `<section class="grouped-preview"><div class="section-head"><h2>Subject sections</h2><p>${selectedPracticeMode === "timed" ? "One timer for the complete session" : "Grouped guided practice"}</p></div><div class="section-plan" id="section-plan"></div><button class="button start-session-button" id="start-all-session">Start grouped session →</button></section>` : `<div class="section-head"><h2>Choose a topic</h2><p>${selectedPracticeMode === "timed" ? "The timer begins when questions open" : "Feedback appears after each answer"}</p></div><div class="topic-grid"><button class="topic-card" data-topic=""><strong>All topics</strong><span>Balanced mix · ${questions.filter(q => q.subject === selectedSubject).length} available</span></button>${topics.map(topic => `<button class="topic-card" data-topic="${escapeHtml(topic)}"><strong>${escapeHtml(topic)}</strong><span>${topicAccuracy(selectedSubject, topic)}</span></button>`).join("")}</div>`}</section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelector("#back-subjects").addEventListener("click", () => { selectedSubject = null; render(); });
  const questionInput = document.querySelector("#question-count");
  const timeInput = document.querySelector("#study-minutes");
  const persistConfiguration = () => { if (questionInput?.validity.valid) selectedQuestionCount = Number(questionInput.value); if (timeInput?.validity.valid) selectedStudyMinutes = Number(timeInput.value); if (allSubjects) renderSectionPlan(selectedQuestionCount); };
  questionInput?.addEventListener("input", persistConfiguration); timeInput?.addEventListener("input", persistConfiguration);
  if (allSubjects) renderSectionPlan(selectedQuestionCount);
  document.querySelector("#start-all-session")?.addEventListener("click", () => { const config = readSessionConfiguration(); if (config) startSession("all", null, config.count, config.minutes); });
  document.querySelectorAll("[data-topic]").forEach(button => button.addEventListener("click", () => { const config = readSessionConfiguration(); if (config) startSession(selectedSubject, button.dataset.topic || null, config.count, config.minutes); }));
}

function readSessionConfiguration() {
  const questionInput = document.querySelector("#question-count");
  const timeInput = document.querySelector("#study-minutes");
  if (!questionInput || !questionInput.reportValidity()) return null;
  if (selectedPracticeMode === "timed" && (!timeInput || !timeInput.reportValidity())) return null;
  selectedQuestionCount = Number(questionInput.value);
  if (timeInput) selectedStudyMinutes = Number(timeInput.value);
  return { count: selectedQuestionCount, minutes: selectedStudyMinutes };
}

function renderSavedReview() {
  const saved = bookmarks.map(bookmark => ({ ...bookmark, question: questionById(bookmark.questionId) })).filter(item => item.question).sort((a, b) => b.savedAt - a.savedAt);
  const maximum = Math.min(100, saved.length);
  const reviewCount = maximum ? Math.min(Math.max(1, selectedQuestionCount), maximum) : 1;
  const groups = ALL_SUBJECT_ORDER.map(subject => ({ subject, items: saved.filter(item => item.question.subject === subject.id) })).filter(group => group.items.length);
  const content = `<section class="page"><button class="button outline" id="back-subjects">← Practice modes</button><div class="practice-heading"><p class="eyebrow">Review library</p><h1>Saved for review.</h1><p class="lede">A synchronized collection of the questions you chose to revisit. Remove anything you no longer need, or turn the collection into a focused timed session.</p></div>${saved.length ? `<section class="session-builder review-builder" aria-label="Review session settings"><div class="session-input"><label for="question-count">Questions to review</label><div><input id="question-count" type="number" min="1" max="${maximum}" step="1" value="${reviewCount}" inputmode="numeric" required><span>of ${saved.length}</span></div><small>Up to 100 saved questions per session.</small></div><div class="session-input"><label for="study-minutes">Study time</label><div><input id="study-minutes" type="number" min="1" max="600" step="1" value="${selectedStudyMinutes}" inputmode="numeric" required><span>minutes</span></div><small>One timer covers the complete review session.</small></div><button class="button start-review-button" id="start-review-session">Start saved review →</button></section><div class="section-head"><h2>Your saved questions</h2><p>${saved.length} synchronized</p></div><div class="saved-groups">${groups.map(group => `<section class="saved-group"><div class="saved-group-head"><h3>${group.subject.name}</h3><span>${group.items.length}</span></div>${group.items.map((item, index) => `<article class="saved-question"><span class="saved-index">${String(index + 1).padStart(2, "0")}</span><div><small>${escapeHtml(item.question.topic)}</small><p>${escapeHtml(item.question.text)}</p></div><button class="saved-remove" data-review-remove="${escapeHtml(item.questionId)}" aria-label="Remove question from saved review">Remove</button></article>`).join("")}</section>`).join("")}</div>` : `<div class="review-empty"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><h2>Your review library is ready.</h2><p>While answering questions, select <strong>Save for review</strong>. The question will synchronize to this account and appear here on every device.</p><button class="button" id="find-questions">Find questions to practise →</button></div>`}</section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelector("#back-subjects").addEventListener("click", () => { selectedSubject = null; render(); });
  document.querySelector("#find-questions")?.addEventListener("click", () => { selectedSubject = null; render(); });
  document.querySelector("#start-review-session")?.addEventListener("click", () => { const config = readSessionConfiguration(); if (config) startSession("saved", null, config.count, config.minutes); });
  document.querySelectorAll("[data-review-remove]").forEach(button => button.addEventListener("click", () => toggleBookmark(button.dataset.reviewRemove)));
  document.querySelector("#question-count")?.addEventListener("input", event => { if (event.target.validity.valid) selectedQuestionCount = Number(event.target.value); });
  document.querySelector("#study-minutes")?.addEventListener("input", event => { if (event.target.validity.valid) selectedStudyMinutes = Number(event.target.value); });
}

function weightedQuestions(subject, topic, limit = 10) {
  const pool = questions.filter(question => question.subject === subject && (!topic || question.topic === topic));
  const stats = new Map();
  for (const attempt of attempts) {
    const value = stats.get(attempt.questionId) || { total: 0, correct: 0, last: 0 };
    value.total++; if (attempt.correct) value.correct++; value.last = Math.max(value.last, attempt.timestamp);
    stats.set(attempt.questionId, value);
  }
  return pool.map(question => {
    const stat = stats.get(question.id);
    let weight = stat ? 2 + (1 - stat.correct / stat.total) * 5 : 9;
    if (stat && Date.now() - stat.last < 86400000) weight *= .35;
    return { question, key: Math.pow(Math.random(), 1 / weight) };
  }).sort((a, b) => b.key - a.key).slice(0, Math.min(limit, pool.length)).map(item => item.question);
}

function balancedSubjectCounts(limit) {
  const counts = new Map(ALL_SUBJECT_ORDER.map(subject => [subject.id, 0]));
  const available = new Map(ALL_SUBJECT_ORDER.map(subject => [subject.id, questions.filter(question => question.subject === subject.id).length]));
  let allocated = 0;
  while (allocated < limit) {
    let progressed = false;
    for (const subject of ALL_SUBJECT_ORDER) {
      if (counts.get(subject.id) < available.get(subject.id) && allocated < limit) {
        counts.set(subject.id, counts.get(subject.id) + 1); allocated++; progressed = true;
      }
    }
    if (!progressed) break;
  }
  return counts;
}

function renderSectionPlan(limit) {
  const target = document.querySelector("#section-plan");
  if (!target) return;
  const allocation = balancedSubjectCounts(limit);
  target.innerHTML = ALL_SUBJECT_ORDER.map((subject, index) => `<article><span>Section ${String(index + 1).padStart(2, "0")}</span><strong>${subject.name}</strong><small>${allocation.get(subject.id)} questions</small></article>`).join("");
}

function weightedAllSubjects(limit) {
  const allocation = balancedSubjectCounts(limit);
  return ALL_SUBJECT_ORDER.flatMap(subject => weightedQuestions(subject.id, null, allocation.get(subject.id)));
}

function savedSessionQuestions(limit) {
  const saved = [...bookmarks].sort((a, b) => b.savedAt - a.savedAt).slice(0, limit).map(bookmark => questionById(bookmark.questionId)).filter(Boolean);
  return ALL_SUBJECT_ORDER.flatMap(subject => saved.filter(question => question.subject === subject.id));
}

function buildSessionSections(queue) {
  const sections = [];
  for (const question of queue) {
    const last = sections.at(-1);
    if (last?.subject === question.subject) last.count++;
    else sections.push({ subject: question.subject, name: subjectName(question.subject), count: 1, start: sections.reduce((total, section) => total + section.count, 0) });
  }
  return sections;
}

function topicSlug(value) { return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

function startSession(subject, topic, count = 10, durationMinutes = 10, mode = selectedPracticeMode) {
  const label = subject === "all" ? "All subjects" : subject === "saved" ? "Saved for review" : subjectName(subject);
  const topicLabel = topic || (subject === "all" ? "Grouped subject sections" : subject === "saved" ? "Saved question collection" : "All topics");
  const detail = `<dl class="session-confirm-summary"><div><dt>Mode</dt><dd>${mode === "normal" ? "Guided practice" : "Timed practice"}</dd></div><div><dt>Focus</dt><dd>${escapeHtml(topicLabel)}</dd></div><div><dt>Questions</dt><dd>${count}</dd></div><div><dt>Time</dt><dd>${mode === "normal" ? "Untimed" : `${durationMinutes} minutes`}</dd></div></dl>`;
  showConfirmDialog({ title: "Start this practice session?", message: mode === "normal" ? "Review your choices, then begin an untimed guided session with feedback after each answer." : "Review your choices carefully. The timer will remain paused until you press Begin session on the next screen.", detail, confirmLabel: "Proceed", cancelLabel: "Change selections", onConfirm: () => createSession(subject, topic, count, durationMinutes, mode) });
}

async function createSession(subject, topic, count = 10, durationMinutes = 10, mode = selectedPracticeMode) {
  let queue = subject === "all" ? weightedAllSubjects(count) : subject === "saved" ? savedSessionQuestions(count) : weightedQuestions(subject, topic, count); let remoteId = null;
  try {
    const remote = await api.startSession(authToken, { subject, topic: topic ? topicSlug(topic) : null, limit: count, duration_minutes: durationMinutes, mode });
    remoteId = remote.session_id;
    const selected = remote.questions.map(item => questionById(item.external_id)).filter(Boolean);
    if (selected.length) queue = selected;
  } catch { showToast("Working offline. This session will sync when connected."); }
  if (queue.length < count) showToast(`${queue.length} questions are currently available in this selection.`);
  const sections = buildSessionSections(queue);
  if (mode === "normal") durationMinutes = 0;

  activeSession = { subject, topic, requestedCount: count, durationMinutes, deadline: null, started: false, finished: false, queue, sections, answers: queue.map(() => ({ selected: null, confirmed: false, correct: false })), remoteId, index: 0, correct: 0, questionStartedAt: null, reportedComplete: false, timedOut: false, timeUpAcknowledged: false, mode };
  route = "session"; render();
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function runSessionTimer() {
  clearInterval(sessionTimer);
  const update = () => {
    if (!activeSession?.started || activeSession.finished || route !== "session") return clearInterval(sessionTimer);
    const remaining = Math.max(0, Math.ceil((activeSession.deadline - Date.now()) / 1000));
    const display = document.querySelector("#session-timer");
    if (display) {
      display.textContent = formatTime(remaining);
      display.closest(".session-clock")?.classList.toggle("urgent", remaining <= 60);
    }
    if (remaining === 0) {
      clearInterval(sessionTimer);
      finalizeSelectedAnswers(true);
    }
  };
  update();
  sessionTimer = setInterval(update, 1000);
}

function currentSection() {
  return activeSession?.sections.find(section => activeSession.index >= section.start && activeSession.index < section.start + section.count) || activeSession?.sections[0];
}

function renderSessionStart() {
  const mode = activeSession.subject === "all" ? "All subjects" : activeSession.subject === "saved" ? "Saved for review" : subjectName(activeSession.subject);
  const isNormal = activeSession.mode === "normal";
  const content = `<section class="page page-narrow"><div class="session-ready"><p class="eyebrow">Ready when you are</p><h1>Your session is prepared.</h1><p class="lede">${isNormal ? "This guided session is untimed. You will see feedback after each answer." : "The countdown has not started. Once you begin, you may skip between questions and return using the numbered navigator."}</p><div class="ready-summary"><article><span>Focus</span><strong>${escapeHtml(mode)}</strong></article><article><span>Questions</span><strong>${activeSession.queue.length}</strong></article><article><span>Study time</span><strong>${isNormal ? "Untimed" : `${activeSession.durationMinutes} minutes`}</strong></article></div>${activeSession.sections.length > 1 ? `<div class="ready-sections">${activeSession.sections.map((section, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(section.name)}</strong><small>${section.count} questions</small></div>`).join("")}</div>` : ""}<div class="button-row"><button class="button" id="begin-session">Begin session →</button><button class="button outline" id="cancel-session">Change selections</button></div></div></section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelector("#begin-session").addEventListener("click", () => { activeSession.started = true; activeSession.deadline = isNormal ? null : Date.now() + activeSession.durationMinutes * 60000; activeSession.questionStartedAt = Date.now(); render(); });
  document.querySelector("#cancel-session").addEventListener("click", () => { activeSession = null; route = "practice"; render(); });
}

function renderSession() {
  if (!activeSession) { route = "practice"; return render(); }
  if (activeSession.finished) { if (!activeSession.timedOut || activeSession.timeUpAcknowledged) return renderResult(); return; }
  if (!activeSession.started) return renderSessionStart();
  if (activeSession.mode === 'normal') return renderNormalSession();
  const question = activeSession.queue[activeSession.index];
  const answer = activeSession.answers[activeSession.index];
  const section = currentSection();
  const sectionIndex = activeSession.sections.indexOf(section);
  const isBookmarked = bookmarks.some(item => item.questionId === question.id);
  const confirmed = activeSession.answers.filter(item => item.selected !== null).length;
  const passage = questionPassage(question);
  const imageUrl = questionImage(question);
  const content = `<section class="page session-page"><aside class="question-navigator"><div><p class="eyebrow">Question navigator</p><strong>${confirmed} of ${activeSession.queue.length} answered</strong><span>Select any number to move between questions.</span></div><div class="question-number-grid">${activeSession.answers.map((item, index) => `<button class="question-number ${index === activeSession.index ? "current" : ""} ${item.selected !== null ? "selected" : ""}" data-question-index="${index}" aria-label="Question ${index + 1}${item.selected !== null ? ", selected" : ", unanswered"}">${index + 1}</button>`).join("")}</div><div class="navigator-key"><span><i class="selected"></i>Selected</span><span><i class="unanswered"></i>Unanswered</span></div><button class="button outline finish-session" id="finish-session">Finish session</button></aside><div class="session-workspace">${activeSession.sections.length > 1 ? `<div class="active-section"><span>Section ${sectionIndex + 1} of ${activeSession.sections.length}</span><strong>${escapeHtml(section.name)}</strong><small>${activeSession.index - section.start + 1} of ${section.count} in this section</small></div>` : ""}<div class="question-header"><div class="question-topline"><span>${subjectName(question.subject)} · ${escapeHtml(question.topic)}${question.questionYear ? ` · ${question.questionYear} source` : ""}</span><div class="session-status"><span>${activeSession.index + 1} of ${activeSession.queue.length}</span><span class="session-clock" role="timer" aria-label="Session time remaining"><small>Time left</small><strong id="session-timer">${formatTime(Math.ceil((activeSession.deadline - Date.now()) / 1000))}</strong></span></div></div><div class="question-progress"><i style="width:${confirmed / activeSession.queue.length * 100}%"></i></div></div><article class="question-paper" style="${passage ? 'display:flex; flex-direction:column; gap:1rem;' : ''}">
  ${passage ? `<details class="passage-details"><summary>View reading passage</summary><div class="passage-content">${renderMath(escapeHtml(passage))}</div></details>` : ""}
  ${imageUrl ? `<img class="question-image" src="${escapeHtml(imageUrl)}" alt="Illustration for this question" loading="lazy">` : ""}
  <div><p class="eyebrow">Question ${String(activeSession.index + 1).padStart(2, "0")}</p><h2>${renderMath(escapeHtml(question.text))}</h2></div><div class="options">${question.options.map((option, index) => { let state = ""; if (answer.confirmed && index === question.correct) state = "correct"; else if (answer.confirmed && index === answer.selected) state = "incorrect"; else if (!answer.confirmed && index === answer.selected) state = "selected"; return `<button class="option ${state}" data-option="${index}" ${answer.confirmed ? "disabled" : ""}><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${renderMath(escapeHtml(option))}</span></button>`; }).join("")}</div>${answer.confirmed ? `<div class="feedback"><div class="feedback-head"><div class="feedback-label ${answer.correct ? "" : "wrong"}">${answer.correct ? "Correct" : "Review this"}</div>${answer.correct ? '<span class="xp-earned">+5 XP</span>' : ""}</div><p>${renderMath(escapeHtml(question.explanation))}</p></div>` : answer.selected !== null ? '<p class="selection-note">Your selection is not recorded until you finish the session.</p>' : ""}<div class="question-actions"><button class="button outline" id="previous-question" ${activeSession.index === 0 ? "disabled" : ""}>← Previous</button><button class="button outline" id="bookmark">${isBookmarked ? "Remove from saved" : "Save for review"}</button><button class="button" id="next-question">${activeSession.index === activeSession.queue.length - 1 ? "Review session" : answer.selected !== null ? "Next question →" : "Skip for now →"}</button></div></article></div></section>`;
  app.innerHTML = shell(content); bindShell();
  runSessionTimer();
  document.querySelectorAll("[data-question-index]").forEach(button => button.addEventListener("click", () => goToQuestion(Number(button.dataset.questionIndex))));
  document.querySelectorAll("[data-option]").forEach(button => button.addEventListener("click", () => selectAnswer(Number(button.dataset.option))));
  document.querySelector("#bookmark").addEventListener("click", () => toggleBookmark(question.id));
  document.querySelector("#previous-question").addEventListener("click", () => goToQuestion(activeSession.index - 1));
  document.querySelector("#next-question").addEventListener("click", () => activeSession.index === activeSession.queue.length - 1 ? confirmFinishSession() : goToQuestion(activeSession.index + 1));
  document.querySelector("#finish-session").addEventListener("click", confirmFinishSession);
}

function goToQuestion(index) {
  if (index < 0 || index >= activeSession.queue.length) return;
  activeSession.index = index; activeSession.questionStartedAt = Date.now(); render();
}

function selectAnswer(selected) {
  const answer = activeSession.answers[activeSession.index];
  if (answer.confirmed) return;
  const question = activeSession.queue[activeSession.index];
  answer.selected = selected;
  if (activeSession.mode === 'timed' || activeSession.mode === 'sprint') {
    render(); // Deferred grading
  } else {
    // Normal mode: immediate feedback
    submitConfirmedAnswer(activeSession.index);
  }
}

async function submitConfirmedAnswer(questionIndex, shouldRender = true, syncNow = true) {
  if (!activeSession || activeSession.finished) return;
  const answer = activeSession.answers[questionIndex];
  if (answer.confirmed || answer.selected === null) return;
  const question = activeSession.queue[questionIndex];
  const selected = answer.selected;
  const correct = selected === question.correct;
  answer.confirmed = true; answer.correct = correct; if (correct) activeSession.correct++;
  const attempt = { questionId: question.id, subject: question.subject, correct, selected, timestamp: Date.now(), durationMs: Date.now() - activeSession.questionStartedAt, clientId: crypto.randomUUID(), sessionId: activeSession.remoteId, synced: false };
  attempt.id = await add("attempts", attempt); attempts.push(attempt);
  profile.xp = (profile.xp || 0) + (correct ? 5 : 0);
  await put("profile", profile);
  await registerStudyDay();
  if (shouldRender) render();
  if (syncNow) await syncAttemptRecord(attempt);
  if (syncNow && shouldRender && route === "session" && activeSession?.queue[questionIndex]?.id === question.id) render();
}

function confirmFinishSession() {
  const answered = activeSession.answers.filter(item => item.selected !== null).length;
  const unanswered = activeSession.queue.length - answered;
  showConfirmDialog({ title: "Finish this session?", message: unanswered ? `${unanswered} question${unanswered === 1 ? " is" : "s are"} still unanswered. You can return to them using the numbered navigator.` : "Every question has a selected answer.", detail: `<div class="finish-summary"><span><strong>${answered}</strong> answered</span><span><strong>${unanswered}</strong> unanswered</span></div>`, confirmLabel: "Finish and view results", cancelLabel: "Continue session", onConfirm: () => activeSession.mode === "normal" ? finishNormalSession() : finalizeSelectedAnswers(false) });
}

function finishNormalSession() {
  activeSession.finished = true;
  render();
}

async function finalizeSelectedAnswers(timedOut = false) {
  if (!activeSession || activeSession.finalizing) return;
  activeSession.finalizing = true;
  const selected = activeSession.answers.map((answer, index) => answer.selected !== null && !answer.confirmed ? index : -1).filter(index => index >= 0);
  for (const index of selected) await submitConfirmedAnswer(index, false, false);
  activeSession.timedOut = timedOut;
  activeSession.finished = true;
  activeSession.finalizing = false;
  syncPendingAttempts();
  if (timedOut) {
    showConfirmDialog({ title: "Time’s up.", message: "Your study time has ended. Selected answers have been recorded; questions without a selection remain unanswered.", confirmLabel: "View results", tone: "timeup", dismissible: false, onConfirm: () => { activeSession.timeUpAcknowledged = true; render(); } });
  } else {
    render();
  }
}

async function syncAttemptRecord(attempt) {
  if (!authToken || attempt.synced) return;
  if (!attempt.clientId) attempt.clientId = crypto.randomUUID();
  try {
    const response = await api.syncAttempt(authToken, { question_id: attempt.questionId, selected_index: attempt.selected, client_id: attempt.clientId, session_id: attempt.sessionId || null, duration_ms: attempt.durationMs || null });
    attempt.synced = true; attempt.correct = response.correct; await put("attempts", attempt);
    applyRemoteStats(response.stats); await put("profile", profile);
  } catch (error) { if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401) { attempt.syncError = error.message; await put("attempts", attempt); } }
}

function applyRemoteStats(stats = {}) {
  profile.xp = stats.xp ?? 0;
  profile.rhythm = stats.current_streak ?? 0;
  profile.bestRhythm = stats.best_streak ?? 0;
  profile.lastStudyDate = stats.last_study_date || null;
  if (currentUser) {
    currentUser.stats = { ...(currentUser.stats || {}), ...stats };
    localStorage.setItem("seomtorch-auth-user", JSON.stringify(currentUser));
  }
}

async function syncPendingAttempts() {
  if (syncPromise) return syncPromise;
  pendingSyncCount = attempts.filter(item => !item.synced && !item.syncError).length;
  if (pendingSyncCount > 0) render();
  syncPromise = (async () => {
    for (const attempt of attempts.filter(item => !item.synced && !item.syncError)) await syncAttemptRecord(attempt);
    const remote = await api.attempts(authToken);
    const unresolved = attempts.filter(item => !item.synced);
    const canonical = remote.attempts.map(item => ({ questionId: item.question_id, subject: item.subject, correct: item.is_correct, selected: item.selected_index, timestamp: new Date(item.answered_at).getTime(), durationMs: item.duration_ms, clientId: item.client_id, synced: true }));
    const known = new Set(canonical.map(item => item.clientId));
    await clearStore("attempts"); attempts = [];
    for (const item of [...canonical, ...unresolved.filter(item => !known.has(item.clientId))]) { const clean = { ...item }; delete clean.id; clean.id = await add("attempts", clean); attempts.push(clean); }
    applyRemoteStats(remote.stats); await put("profile", profile);

    const pendingBookmarks = await syncBookmarkQueue();
    const remoteBookmarks = await api.bookmarks(authToken);
    await clearStore("bookmarks"); bookmarks = [];
    for (const item of remoteBookmarks) { const bookmark = { questionId: item.question_id, savedAt: new Date(item.created_at).getTime() }; await put("bookmarks", bookmark); bookmarks.push(bookmark); }
    for (const item of pendingBookmarks) {
      if (item.action === "add" && !bookmarks.some(bookmark => bookmark.questionId === item.questionId)) { const bookmark = { questionId: item.questionId, savedAt: item.queuedAt }; await put("bookmarks", bookmark); bookmarks.push(bookmark); }
      if (item.action === "remove") { await storeAction("bookmarks", "readwrite", store => store.delete(item.questionId)); bookmarks = bookmarks.filter(bookmark => bookmark.questionId !== item.questionId); }
    }
  })().then(() => { pendingSyncCount = 0; if (route !== "session") render(); return true; }).catch(() => false).finally(() => { syncPromise = null; });
  return syncPromise;
}

async function queueBookmarkAction(questionId, action) {
  const record = await get("meta", "bookmarkQueue") || { key: "bookmarkQueue", actions: [] };
  record.actions = record.actions.filter(item => item.questionId !== questionId);
  record.actions.push({ questionId, action, queuedAt: Date.now() });
  await put("meta", record);
}

async function clearBookmarkAction(questionId) {
  const record = await get("meta", "bookmarkQueue") || { key: "bookmarkQueue", actions: [] };
  record.actions = record.actions.filter(item => item.questionId !== questionId);
  await put("meta", record);
}

async function syncBookmarkQueue() {
  const record = await get("meta", "bookmarkQueue") || { key: "bookmarkQueue", actions: [] };
  const remaining = [];
  for (const item of record.actions) {
    try {
      if (item.action === "add") await api.addBookmark(authToken, item.questionId);
      else await api.removeBookmark(authToken, item.questionId);
    } catch { remaining.push(item); }
  }
  await put("meta", { key: "bookmarkQueue", actions: remaining });
  return remaining;
}

async function registerStudyDay() {
  const current = today();
  if (profile.lastStudyDate === current) return;
  profile.rhythm = profile.lastStudyDate === yesterday() ? (profile.rhythm || 0) + 1 : 1;
  profile.bestRhythm = Math.max(profile.bestRhythm || 0, profile.rhythm);
  profile.lastStudyDate = current;
  await put("profile", profile);
}

function toggleBookmark(questionId) {
  const existing = bookmarks.find(item => item.questionId === questionId);
  const question = questionById(questionId);
  showConfirmDialog({ title: existing ? "Remove this saved question?" : "Save this question for review?", message: existing ? "It will be removed from your synchronized review library on every device." : "It will be added to your synchronized review library so you can return to it later.", detail: question ? `<p class="dialog-question-preview">${escapeHtml(question.text)}</p>` : "", confirmLabel: existing ? "Yes, remove it" : "Yes, save it", cancelLabel: "Keep as it is", onConfirm: () => performBookmarkToggle(questionId) });
}

async function performBookmarkToggle(questionId) {
  const existing = bookmarks.find(item => item.questionId === questionId);
  if (existing) {
    await storeAction("bookmarks", "readwrite", store => store.delete(questionId));
    bookmarks = bookmarks.filter(item => item.questionId !== questionId); showToast("Removed from review list");
    await queueBookmarkAction(questionId, "remove");
    render();
    try { await api.removeBookmark(authToken, questionId); await clearBookmarkAction(questionId); }
    catch {}
  } else {
    const item = { questionId, savedAt: Date.now() }; await put("bookmarks", item); bookmarks.push(item); showToast("Saved for later review");
    await queueBookmarkAction(questionId, "add");
    render();
    try { await api.addBookmark(authToken, questionId); await clearBookmarkAction(questionId); }
    catch {}
  }
}

function renderResult() {
  clearInterval(sessionTimer);
  if (activeSession.remoteId && !activeSession.reportedComplete) {
    activeSession.reportedComplete = true;
    syncPendingAttempts().then(() => api.completeSession(authToken, activeSession.remoteId)).catch(() => { activeSession.reportedComplete = false; });
  }
  if (activeSession.mode === "sprint" && !dailySprintCompleted) {
    dailySprintCompleted = true;
    localStorage.setItem("seomtorch-sprint-" + new Date().toISOString().slice(0, 10), "done");
  }
  const score = activeSession.queue.length ? Math.round(activeSession.correct / activeSession.queue.length * 100) : 0;
  const answered = activeSession.answers.filter(item => item.confirmed).length;
  const unanswered = activeSession.queue.length - answered;
  const note = activeSession.timedOut ? "Time is up. Review the result, then try a shorter session or return when you can give it a full window." : score >= 80 ? "A strong session. Keep the standard steady." : score >= 50 ? "Good work. Review the corrections before moving on." : "This topic needs another careful pass. That is useful information.";
  const review = activeSession.answers.map((answer, index) => { const question = activeSession.queue[index]; if (!answer.confirmed) return ""; return `<article class="result-review-item ${answer.correct ? "correct" : "incorrect"}"><div><span>Question ${index + 1}</span><strong>${answer.correct ? "Correct" : "Review"}</strong></div><p>${renderMath(escapeHtml(question.text))}</p><small>Your answer: ${escapeHtml(question.options[answer.selected] || "—")}</small>${answer.correct ? "" : `<small>Correct answer: ${escapeHtml(question.options[question.correct] || "—")}</small>`}<div>${renderMath(escapeHtml(question.explanation))}</div></article>`; }).join("");
  const content = `<section class="page page-narrow"><div class="session-result"><p class="eyebrow">${activeSession.timedOut ? "Time expired" : "Session complete"}</p><div class="result-score">${score}%</div><h2>${activeSession.correct} of ${activeSession.queue.length} correct</h2><p class="lede" style="margin-inline:auto">${note}</p><div class="result-meta"><span>${answered} answered</span><span>${unanswered} unanswered</span><span>${activeSession.mode === "normal" ? "Untimed practice" : `${activeSession.durationMinutes} minute timer`}</span></div><div class="button-row" style="justify-content:center;margin-top:28px"><button class="button outline" id="return-practice">Choose another topic</button>${activeSession.mode === "sprint" ? "" : '<button class="button" id="retry-session">Practise this again</button>'}</div></div>${review ? `<div class="result-review"><div class="section-head"><h2>Solutions</h2><p>Review every recorded answer</p></div>${review}</div>` : ""}</section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelector("#return-practice").addEventListener("click", () => { activeSession = null; route = "practice"; render(); });
  document.querySelector("#retry-session")?.addEventListener("click", () => startSession(activeSession.subject, activeSession.topic, activeSession.requestedCount, activeSession.durationMinutes, activeSession.mode));
}

function renderProgress() {
  const xp = xpState();
  const topicMap = new Map();
  for (const attempt of attempts) {
    const question = questionById(attempt.questionId); if (!question) continue;
    const key = `${question.subject}|${question.topic}`; const item = topicMap.get(key) || { subject: question.subject, topic: question.topic, list: [] }; item.list.push(attempt); topicMap.set(key, item);
  }
  const focus = [...topicMap.values()].filter(item => item.list.length >= 2).map(item => ({ ...item, accuracy: accuracy(item.list) })).sort((a, b) => a.accuracy - b.accuracy).slice(0, 4);
  const content = `<section class="page"><p class="eyebrow">Progress</p><h1>Your work, made useful.</h1><p class="lede">Results are organised to help you decide what to study next—not to decorate a dashboard.</p><div class="metric-strip four" style="margin-top:38px"><div class="metric"><strong>${attempts.length}</strong><span>total attempts</span></div><div class="metric"><strong>${accuracy()}%</strong><span>overall accuracy</span></div><div class="metric xp-metric"><strong>${xp.xp}<small> XP</small></strong><span>Level ${xp.level}</span></div><div class="metric streak-metric"><strong>${profile.bestRhythm || 0}<small> days</small></strong><span>best streak</span></div></div><div class="section-head"><h2>Academic report</h2><p>Based on synchronized account history</p></div><div class="report-grid"><div class="report-panel"><h3>Subject performance</h3>${SUBJECTS.map(subject => { const stat = subjectStats(subject.id); return `<div class="report-row"><span>${subject.name}<small>${stat.count} attempts</small></span><strong>${stat.count ? `${stat.accuracy}%` : "—"}</strong></div>`; }).join("")}</div><div class="report-panel"><h3>Topics needing attention</h3>${focus.length ? focus.map(item => `<div class="report-row"><span>${escapeHtml(item.topic)}<small>${subjectName(item.subject)} · ${item.list.length} attempts</small></span><strong class="${item.accuracy < 50 ? "attention" : ""}">${item.accuracy}%</strong></div>`).join("") : '<div class="empty">Complete at least two questions in a topic and Seomtorch will begin identifying useful focus areas.</div>'}</div></div></section>`;
  app.innerHTML = shell(content); bindShell();
}

function renderProfile(filter = "") {
  const normalized = filter.trim().toLowerCase();
  const matches = FAQS.filter(item => !normalized || `${item.q} ${item.a} ${item.group}`.toLowerCase().includes(normalized));
  const groups = [...new Set(matches.map(item => item.group))];
  const xp = xpState();
  const joined = currentUser?.date_joined ? new Date(currentUser.date_joined).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "—";
  const content = `<section class="page profile-page"><div class="profile-hero"><div class="profile-monogram">${initials()}</div><div><p class="eyebrow">Student profile</p><h1>${escapeHtml(currentUser?.username || profile.name)}</h1><p>${escapeHtml(currentUser?.email || profile.email)} · Member since ${joined}</p></div><button class="button outline" id="refresh-account">Refresh account</button></div><div class="profile-grid"><section class="profile-card identity-card"><span class="card-label">Student ID</span><strong>${escapeHtml(currentUser?.public_id || "—")}</strong><p>Use this six-character ID when an administrator needs to find your record.</p></section><section class="profile-card level-card"><span class="card-label">Level ${xp.level}</span><strong>${xp.xp} <small>XP</small></strong><div class="xp-track light"><i style="width:${xp.percent}%"></i></div><p>${xp.remaining} XP until level ${xp.level + 1}</p></section></div><div class="metric-strip four profile-metrics"><div class="metric"><strong>${attempts.length}</strong><span>answers recorded</span></div><div class="metric"><strong>${accuracy()}%</strong><span>overall accuracy</span></div><div class="metric streak-metric"><strong>${profile.rhythm || 0}<small> days</small></strong><span>current streak</span></div><div class="metric"><strong>${profile.bestRhythm || 0}<small> days</small></strong><span>best streak</span></div></div><div class="section-head"><h2>Subject record</h2><p>Synchronized account history</p></div><div class="profile-subjects">${SUBJECTS.map(subject => { const stat = subjectStats(subject.id); return `<article><span>${subject.name}</span><strong>${stat.count ? `${stat.accuracy}%` : "—"}</strong><small>${stat.count} answer${stat.count === 1 ? "" : "s"}</small></article>`; }).join("")}</div><section class="settings-panel"><p class="eyebrow">Account data</p><h2>Portable, private and recoverable.</h2><p class="lede">The server keeps the authoritative account record. This device stores an offline copy and queues answers whenever the connection drops.</p><div class="button-row"><button class="button" id="export-data">Export backup</button><label class="button outline" for="import-data">Import backup</label><input class="file-input" id="import-data" type="file" accept="application/json"><button class="button outline" id="clear-cache">Refresh device cache</button><button class="button danger" id="sign-out">Sign out</button></div></section><section class="settings-panel guide-section"><p class="eyebrow">Guide and support</p><h2>Answers, without the noise.</h2><p class="lede">Quick guidance about practice, progress and account data.</p><div class="search-wrap"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg><input type="search" id="faq-search" value="${escapeHtml(filter)}" placeholder="Search help topics" aria-label="Search help topics"></div><div id="faq-results">${groups.length ? groups.map(group => `<section class="faq-group"><h3>${group}</h3>${matches.filter(item => item.group === group).map(item => `<div class="faq-item"><button class="faq-question" aria-expanded="false"><span>${item.q}</span><span aria-hidden="true">+</span></button><div class="faq-answer">${item.a}</div></div>`).join("")}</section>`).join("") : '<div class="empty">No help entries match that search.</div>'}</div></section></section>`;
  app.innerHTML = shell(content); bindShell(); bindProfile();
}

function bindProfile() {
  document.querySelectorAll(".faq-question").forEach(button => button.addEventListener("click", () => { const item = button.closest(".faq-item"); item.classList.toggle("open"); button.setAttribute("aria-expanded", item.classList.contains("open")); }));
  let timer; document.querySelector("#faq-search").addEventListener("input", event => { clearTimeout(timer); timer = setTimeout(() => renderProfile(event.target.value), 180); });
  document.querySelector("#export-data").addEventListener("click", exportData);
  document.querySelector("#import-data").addEventListener("change", event => importData(event.target.files[0]));
  document.querySelector("#refresh-account").addEventListener("click", async () => { const synced = await syncPendingAttempts(); showToast(synced ? "Account is up to date" : "Could not reach the account server"); renderProfile(); });
  document.querySelector("#clear-cache").addEventListener("click", refreshDeviceCache);
  document.querySelector("#sign-out").addEventListener("click", signOut);
  const accountActions = document.querySelector(".settings-panel .button-row");
  if (accountActions) {
    const changePassword = document.createElement("button");
    changePassword.className = "button outline";
    changePassword.type = "button";
    changePassword.textContent = "Change password";
    changePassword.addEventListener("click", () => navigate("change-password"));
    accountActions.prepend(changePassword);
  }
}

function renderPasswordChange(required = false) {
  const content = `<section class="page page-narrow"><div class="password-change-card"><p class="eyebrow">${required ? "Security step required" : "Account security"}</p><h1>${required ? "Create your new password." : "Change your password."}</h1><p class="lede">${required ? "You signed in with a temporary password issued by an administrator. Replace it before continuing to your account." : "Enter your current password, then choose a strong new one."}</p><form id="change-password-form" class="auth-form"><div class="field"><label for="current-password">Current password</label><input id="current-password" name="current_password" type="password" autocomplete="current-password" required></div><div class="field"><label for="new-password">New password</label><input id="new-password" name="new_password" type="password" minlength="8" autocomplete="new-password" required></div><div class="field"><label for="confirm-password">Confirm new password</label><input id="confirm-password" name="confirm_password" type="password" minlength="8" autocomplete="new-password" required></div><div id="password-change-error" class="auth-error" role="alert"></div><div class="button-row"><button class="button" type="submit">Save new password</button>${required ? '<button class="button outline" type="button" id="password-change-signout">Sign out</button>' : '<button class="button outline" type="button" id="cancel-password-change">Cancel</button>'}</div></form></div></section>`;
  app.innerHTML = shell(content);
  bindShell();
  document.querySelector("#cancel-password-change")?.addEventListener("click", () => navigate("profile"));
  document.querySelector("#password-change-signout")?.addEventListener("click", signOut);
  document.querySelector("#change-password-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const error = document.querySelector("#password-change-error");
    const values = Object.fromEntries(new FormData(form));
    if (values.new_password !== values.confirm_password) { error.textContent = "The new passwords do not match."; return; }
    submit.disabled = true; submit.textContent = "Saving…"; error.textContent = "";
    try {
      const response = await api.changePassword(authToken, { current_password: values.current_password, new_password: values.new_password });
      currentUser = response.user;
      localStorage.setItem("seomtorch-auth-user", JSON.stringify(currentUser));
      await syncPendingAttempts();
      route = required ? "home" : "profile";
      showToast("Password changed successfully");
      render();
    } catch (caught) {
      error.textContent = caught instanceof ApiError ? caught.message : "The password could not be changed.";
      submit.disabled = false; submit.textContent = "Save new password";
    }
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify({ format: "seomtorch-backup", version: 1, exportedAt: new Date().toISOString(), profile, attempts, bookmarks }, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `seomtorch-backup-${today()}.json`; link.click(); URL.revokeObjectURL(link.href); showToast("Backup downloaded");
}

async function importData(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.format !== "seomtorch-backup" || !data.profile || !Array.isArray(data.attempts)) throw new Error("Invalid backup");
    if (data.profile.remoteId && data.profile.remoteId !== currentUser?.public_id) throw new Error("Backup belongs to another account");
    await clearStore("profile"); await clearStore("attempts"); await clearStore("bookmarks");
    await put("profile", data.profile);
    for (const attempt of data.attempts) { const clean = { ...attempt }; delete clean.id; await add("attempts", clean); }
    for (const bookmark of data.bookmarks || []) { await put("bookmarks", bookmark); await queueBookmarkAction(bookmark.questionId, "add"); }
    await loadData(); await syncPendingAttempts(); showToast("Backup restored"); renderProfile();
  } catch { showToast("That file is not a valid Seomtorch backup"); }
}

async function refreshDeviceCache() {
  if (!confirm("Refresh this device from your online account? Any answers that have not synchronized yet will be retried first.")) return;
  const synced = await syncPendingAttempts();
  showToast(synced ? "Device cache refreshed" : "Could not refresh while offline"); renderProfile();
}

function renderAuth() {
  const register = authMode === "register";
  app.innerHTML = `<main class="onboarding auth-screen"><section class="onboard-brand"><span class="brand"><span class="brand-mark"><i></i><i></i><i></i></span><span class="brand-name">Seomtorch<small>Prepare with purpose</small></span></span><div><blockquote>Your progress should follow you.</blockquote><p>Sign in to keep every answer, streak and milestone connected to your account.</p></div><small>English Language · General Paper · Mathematics</small></section><section class="onboard-form"><div><div class="auth-tabs"><button class="${!register ? "active" : ""}" data-auth-mode="signin">Sign in</button><button class="${register ? "active" : ""}" data-auth-mode="register">Register</button></div><p class="eyebrow">${register ? "Create your account" : "Welcome back"}</p><h1>${register ? "Begin your preparation." : "Return to your study desk."}</h1><p class="lede">${register ? "Use an email, username and secure password." : "Sign in with your email address and password."}</p><form id="auth-form" class="auth-form">${register ? '<div class="field"><label for="auth-username">Username</label><input id="auth-username" name="username" type="text" maxlength="150" autocomplete="username" required></div>' : ""}<div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" required></div><div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" minlength="8" autocomplete="${register ? "new-password" : "current-password"}" required></div><div id="auth-error" class="auth-error" role="alert"></div><button class="button auth-submit" type="submit">${register ? "Create account" : "Sign in"} →</button></form></div></section></main>`;
  document.querySelectorAll("[data-auth-mode]").forEach(button => button.addEventListener("click", () => { authMode = button.dataset.authMode; renderAuth(); }));
  document.querySelector("#auth-form").addEventListener("submit", submitAuth);
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget; const button = form.querySelector("button[type=submit]"); const error = document.querySelector("#auth-error");
  const body = Object.fromEntries(new FormData(form)); button.disabled = true; button.textContent = "Please wait…"; error.textContent = "";
  try {
    const data = authMode === "register" ? await api.register(body) : await api.login(body);
    authToken = data.token; currentUser = data.user;
    localStorage.setItem("seomtorch-auth-token", authToken); localStorage.setItem("seomtorch-auth-user", JSON.stringify(currentUser));
    await prepareLocalUser(currentUser); await syncPendingAttempts(); route = "home"; render();
  } catch (caught) { error.textContent = caught instanceof ApiError ? caught.message : "Something went wrong. Please try again."; button.disabled = false; button.textContent = authMode === "register" ? "Create account →" : "Sign in →"; }
}

async function prepareLocalUser(user) {
  if (profile && profile.remoteId !== user.public_id) {
    await clearStore("profile"); await clearStore("attempts"); await clearStore("bookmarks"); await put("meta", { key: "bookmarkQueue", actions: [] }); attempts = []; bookmarks = [];
  }
  const stats = user.stats || {};
  profile = { id: "local-user", remoteId: user.public_id, name: user.username, email: user.email, xp: stats.xp ?? 0, rhythm: stats.current_streak ?? 0, bestRhythm: stats.best_streak ?? 0, lastStudyDate: stats.last_study_date || null, createdAt: profile?.createdAt || Date.now() };
  await put("profile", profile);
}

async function restoreAuth() {
  if (!authToken) return false;
  try { currentUser = await api.me(authToken); localStorage.setItem("seomtorch-auth-user", JSON.stringify(currentUser)); await prepareLocalUser(currentUser); return true; }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) { authToken = null; currentUser = null; localStorage.removeItem("seomtorch-auth-token"); localStorage.removeItem("seomtorch-auth-user"); return false; }
    if (currentUser) { await prepareLocalUser(currentUser); return true; }
    return false;
  }
}

async function signOut() {
  try { await syncBookmarkQueue(); await api.logout(authToken); } catch {}
  await clearStore("profile"); await clearStore("attempts"); await clearStore("bookmarks"); await put("meta", { key: "bookmarkQueue", actions: [] });
  authToken = null; currentUser = null; profile = null; attempts = []; bookmarks = []; localStorage.removeItem("seomtorch-auth-token"); localStorage.removeItem("seomtorch-auth-user"); renderAuth();
}

function render() {
  if (!authToken || !currentUser || !profile) return renderAuth();
  if (currentUser.must_change_password) return renderPasswordChange(true);
  if (route === "daily-sprint") return renderDailySprint();
  if (route === "home") return renderHome();
  if (route === "practice") return renderPractice();
  if (route === "session") return renderSession();
  if (route === "progress") return renderProgress();
  if (route === "profile") return renderProfile();
  if (route === "change-password") return renderPasswordChange(false);
}

async function init() {
  try {
    db = await openDatabase();
    await Promise.all([loadQuestions(), loadData()]);
    const authenticated = await restoreAuth();
    if (authenticated) await syncPendingAttempts();
    render();
    window.addEventListener("online", async () => { if (authToken) { await syncPendingAttempts(); render(); } });
    window.addEventListener("offline", () => { if (route !== "session") render(); });
    document.addEventListener("visibilitychange", async () => { if (document.visibilityState === "visible" && authToken && route !== "session") { await syncPendingAttempts(); render(); } });
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  } catch (error) {
    console.error(error);
    app.innerHTML = `<main class="onboard-form" style="min-height:100dvh"><div><p class="eyebrow">Unable to start</p><h1>Seomtorch needs a local web server.</h1><p class="lede">Open this project through localhost or a secure website so its question bank and offline storage can load correctly.</p><p><code>npx serve .</code></p></div></main>`;
  }
}

init();


async function renderDailySprint() {
  const content = `<section class="page"><div class="session-ready"><p class="eyebrow">Daily Challenge</p><h1>5-Minute Sprint</h1><p class="lede">Loading your daily sprint questions...</p></div></section>`;
  app.innerHTML = shell(content); bindShell();

  try {
    const remote = await api.dailySprint(authToken);
    const sprintQuestions = remote.questions.map(item => questionById(item.external_id)).filter(Boolean);
    if (sprintQuestions.length > 0) {
      activeSession = { subject: 'sprint', topic: null, requestedCount: 5, durationMinutes: 5, deadline: Date.now() + 5 * 60000, started: true, finished: false, queue: sprintQuestions, sections: [{subject: 'sprint', name: 'Sprint', count: sprintQuestions.length, start: 0}], answers: sprintQuestions.map(() => ({ selected: null, confirmed: false, correct: false })), remoteId: remote.session_id, index: 0, correct: 0, questionStartedAt: Date.now(), reportedComplete: false, timedOut: false, timeUpAcknowledged: false, mode: 'sprint' };
      route = "session"; render();
    } else {
      throw new Error("No questions");
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      dailySprintCompleted = true;
      localStorage.setItem("seomtorch-sprint-" + new Date().toISOString().slice(0, 10), "done");
    }
    const message = err instanceof ApiError ? err.message : "Could not load the sprint. Check your connection and try again.";
    app.innerHTML = shell(`<section class="page page-narrow"><div class="session-ready"><p class="eyebrow">Daily challenge</p><h1>${dailySprintCompleted ? "Sprint already started." : "Sprint unavailable."}</h1><p class="lede">${escapeHtml(message)}</p><button class="button" data-route="home">Return home</button></div></section>`);
    bindShell();
  }
}

function showReportModal(questionId) {
  document.querySelector("#app-dialog")?.remove();
  const dialog = document.createElement("div");
  dialog.id = "app-dialog"; dialog.className = "dialog-backdrop";
  dialog.innerHTML = `<section class="confirm-dialog default" role="dialog">
    <h2>Report an issue</h2>
    <p>Help us improve by selecting a reason below.</p>
    <div style="display:flex; flex-direction:column; gap:0.5rem; margin:1rem 0;">
      <label><input type="radio" name="reportReason" value="typo" checked> Typo</label>
      <label><input type="radio" name="reportReason" value="wrong_key"> Wrong Answer Key</label>
      <label><input type="radio" name="reportReason" value="broken_math"> Broken Math/Formula</label>
      <label><input type="radio" name="reportReason" value="unclear"> Unclear Explanation</label>
      <label><input type="radio" name="reportReason" value="other"> Other</label>
    </div>
    <textarea id="reportDetails" placeholder="Optional details..." style="width:100%; min-height:60px; margin-bottom:1rem; padding:0.5rem;"></textarea>
    <div class="button-row">
      <button class="button outline" data-dialog-cancel>Cancel</button>
      <button class="button" data-dialog-confirm>Submit Report</button>
    </div>
  </section>`;
  document.body.appendChild(dialog);
  const close = () => dialog.remove();
  dialog.querySelector("[data-dialog-cancel]")?.addEventListener("click", close);
  dialog.querySelector("[data-dialog-confirm]")?.addEventListener("click", async () => {
    const reason = dialog.querySelector('input[name="reportReason"]:checked').value;
    const details = dialog.querySelector('#reportDetails').value;
    try {
      await api.reportQuestion(authToken, questionId, reason, details);
      showToast("Issue reported. Thank you.");
      close();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Could not submit the report");
    }
  });
}

function renderNormalSession() {
  const question = activeSession.queue[activeSession.index];
  const answer = activeSession.answers[activeSession.index];
  const isBookmarked = bookmarks.some(item => item.questionId === question.id);
  const confirmed = activeSession.answers.filter(item => item.confirmed).length;
  const passage = questionPassage(question);
  const imageUrl = questionImage(question);
  const videoUrl = questionVideo(question);

  const content = `<section class="page session-page">
    <div class="session-workspace" style="max-width:800px; margin:0 auto; padding-top:1rem;">
      <div class="question-header">
        <div class="question-topline">
          <span>${subjectName(question.subject)} · ${escapeHtml(question.topic)}${question.questionYear ? ` · ${question.questionYear} source` : ""}</span>
          <div class="session-status"><span>${activeSession.index + 1} of ${activeSession.queue.length}</span></div>
        </div>
        <div class="question-progress"><i style="width:${confirmed / activeSession.queue.length * 100}%"></i></div>
      </div>

      <article class="question-paper" style="${passage ? 'display:flex; flex-direction:column; gap:1rem;' : ''}">
        ${passage ? `<details class="passage-details"><summary>View reading passage</summary><div class="passage-content">${renderMath(escapeHtml(passage))}</div></details>` : ""}
        ${imageUrl ? `<img class="question-image" src="${escapeHtml(imageUrl)}" alt="Illustration for this question" loading="lazy">` : ""}

        <div><p class="eyebrow">Question ${String(activeSession.index + 1).padStart(2, "0")}</p>
        <h2>${renderMath(escapeHtml(question.text))}</h2></div>

        <div class="options">
          ${question.options.map((option, index) => {
            let state = "";
            if (answer.confirmed && index === question.correct) state = "correct";
            else if (answer.confirmed && index === answer.selected) state = "incorrect";
            else if (!answer.confirmed && index === answer.selected) state = "selected";
            return `<button class="option ${state}" data-option="${index}" ${answer.confirmed ? "disabled" : ""}><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${renderMath(escapeHtml(option))}</span></button>`;
          }).join("")}
        </div>

        ${answer.confirmed ? `
          <div class="feedback">
            <div class="feedback-head">
              <div class="feedback-label ${answer.correct ? "" : "wrong"}">${answer.correct ? "Correct" : "Review this"}</div>
              ${answer.correct ? '<span class="xp-earned">+5 XP</span>' : ""}
            </div>
            <p>${renderMath(escapeHtml(question.explanation))}</p>
            ${videoUrl ? `<div class="question-video"><iframe src="${escapeHtml(videoUrl)}" title="Video explanation" loading="lazy" allowfullscreen></iframe></div>` : ""}

            <div style="margin-top:2rem; border-top:1px solid var(--border); padding-top:1rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <h3>Comments & Discussion</h3>
                <button class="button outline" id="report-question">Report issue</button>
              </div>
              <div id="comments-container" style="display:flex; flex-direction:column; gap:1rem; margin-bottom:1rem;">
                <p>Loading comments...</p>
              </div>
              <div style="display:flex; gap:0.5rem;">
                <input type="text" id="new-comment-text" placeholder="Add a comment..." style="flex:1; padding:0.5rem; border-radius:4px; border:1px solid var(--border);">
                <button class="button" id="post-comment-btn">Post</button>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="question-actions" style="margin-top:2rem; padding-top:1rem; border-top:1px solid var(--border);">
          <button class="button outline" id="previous-question" ${activeSession.index === 0 ? "disabled" : ""}>← Previous</button>
          <button class="button outline" id="bookmark">${isBookmarked ? "Remove from saved" : "Save for review"}</button>
          <button class="button" id="next-question">${activeSession.index === activeSession.queue.length - 1 ? "Finish practice" : "Next question →"}</button>
        </div>
      </article>
    </div>
  </section>`;

  app.innerHTML = shell(content); bindShell();

  document.querySelectorAll("[data-option]").forEach(button => button.addEventListener("click", () => selectAnswer(Number(button.dataset.option))));
  document.querySelector("#bookmark").addEventListener("click", () => toggleBookmark(question.id));
  document.querySelector("#previous-question").addEventListener("click", () => goToQuestion(activeSession.index - 1));
  document.querySelector("#next-question").addEventListener("click", () => activeSession.index === activeSession.queue.length - 1 ? confirmFinishSession() : goToQuestion(activeSession.index + 1));
  document.querySelector("#report-question")?.addEventListener("click", () => showReportModal(question.id));

  if (answer.confirmed) {
    // Load comments
    const container = document.getElementById('comments-container');
    if (api.questionComments) {
      api.questionComments(authToken, question.id).then(comments => {
        if (!comments || comments.length === 0) {
          container.innerHTML = "<p>No comments yet. Be the first to discuss!</p>";
        } else {
          container.innerHTML = comments.map(c => `<div style="background:var(--surface-light); padding:0.75rem; border-radius:4px;"><strong style="font-size:0.85rem;">${escapeHtml(c.username)}</strong> <span style="font-size:0.75rem; opacity:0.7;">${new Date(c.created_at).toLocaleString()}</span><p style="margin-top:0.25rem;">${escapeHtml(c.text)}</p></div>`).join("");
        }
      }).catch(err => {
        container.innerHTML = "<p>Could not load comments.</p>";
      });
    } else {
      container.innerHTML = "<p>Comments unavailable.</p>";
    }

    document.getElementById('post-comment-btn')?.addEventListener("click", async () => {
      const input = document.getElementById('new-comment-text');
      const text = input.value.trim();
      if (!text) return;
      try {
        if (api.addComment) await api.addComment(authToken, question.id, text);
        showToast("Comment posted");
        input.value = "";
        renderNormalSession(); // Reload to show new comment
      } catch {
        showToast("Could not post comment");
      }
    });
  }
}
