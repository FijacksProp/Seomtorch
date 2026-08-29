import { api, ApiError } from "./api-client.js";

const SUBJECTS = [
  { id: "biology", name: "Biology", description: "JAMB cell biology, physiology, ecology, genetics and evolution" },
  { id: "civic-education", name: "Civic Education", description: "WAEC & JAMB citizenship, human rights, democracy and governance" },
  { id: "computer-studies", name: "Computer Studies", description: "Hardware, software, networking, logic, programming and data processing" },
  { id: "english", name: "English Language", description: "Usage, comprehension and oral forms" },
  { id: "general-paper", name: "General Paper", description: "Civics, current affairs and general knowledge" },
  { id: "history", name: "History", description: "Nigerian, African and world history from pre-colonial to modern times" },
  { id: "mathematics", name: "Mathematics", description: "Numbers, algebra, geometry and calculus" },
  { id: "music", name: "Music", description: "JAMB music theory, African music and Western art music" },
  { id: "physics", name: "Physics", description: "JAMB mechanics, waves, electricity and modern physics" },
];
const ALL_SUBJECT_ORDER = ["biology", "civic-education", "computer-studies", "english", "general-paper", "history", "mathematics", "music", "physics"].map(id => SUBJECTS.find(subject => subject.id === id));

const FAQS = [
  { group: "Getting started", q: "What is Seomtorch designed for?", a: "Seomtorch is a personal study companion for structured JAMB, WAEC, NECO and Post-UTME preparation. It helps you practise by topic, learn from corrections and see where your next study session will matter most." },
  { group: "Getting started", q: "Do I need an account or internet connection?", a: "An account is required so your progress can be monitored and restored across devices. After signing in once, practice can continue offline and pending answers synchronize when the connection returns." },
  { group: "Getting started", q: "Can I install Seomtorch on my device?", a: "Yes. Use the Install app button. On iPhone or iPad, open Seomtorch in Safari, tap Share, then choose Add to Home Screen." },
  { group: "Practice and review", q: "How are questions selected?", a: "Sessions prioritise questions you have not seen, topics where your accuracy is lower, and questions you previously missed. Recently answered questions receive less priority, which reduces unnecessary repetition." },
  { group: "Practice and review", q: "Which subjects are available?", a: "Biology, Civic Education, Computer Studies, English Language, General Paper, History, Mathematics, Music and Physics are available. Question banks include verified questions with detailed written explanations." },
  { group: "Practice and review", q: "Can I practise one topic only?", a: "Yes. Open Practice, select a subject, then choose a listed topic. You can also choose All topics for a mixed session within that subject." },
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
  challenges: '<svg class="nav-icon" viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0M13 20a4 4 0 0 1 8 0"/></svg>',
  profile: '<svg class="nav-icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
};

const DB_NAME = "seomtorch";
const DB_VERSION = 2;
const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");
let loaderDismissed = false;

function dismissAppLoader() {
  if (loaderDismissed) return;
  loaderDismissed = true;
  clearTimeout(window.__seomtorchLoaderFailsafe);
  const loader = document.querySelector("#app-loader");
  requestAnimationFrame(() => {
    loader?.classList.add("dismissed");
    setTimeout(() => loader?.remove(), 500);
  });
}

function showLoadingOverlay(title = "Preparing your session", subtitle = "Loading questions and syncing...") {
  hideLoadingOverlay();
  const overlay = document.createElement("div");
  overlay.id = "session-loading-overlay";
  overlay.className = "app-loader";
  overlay.style.zIndex = "300";
  overlay.innerHTML = `<div class="loader-composition"><div class="loader-emblem" aria-hidden="true"><span class="loader-halo"></span><span class="loader-logo-frame"><img src="assets/seomtorch_logo.png" alt=""></span></div><div class="loader-copy"><span>Please wait</span><strong style="font-size:clamp(22px, 5vw, 30px);">${escapeHtml(title)}</strong><p>${escapeHtml(subtitle)}</p></div><div class="loader-rule" aria-hidden="true"><i></i></div></div>`;
  document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
  const overlay = document.querySelector("#session-loading-overlay");
  if (overlay) {
    overlay.classList.add("dismissed");
    setTimeout(() => overlay.remove(), 400);
  }
}

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
let challengesData = null;
let selectedChallengeId = null;
let challengeComposerOpen = false;
let challengeInvitees = [];
let achievementsData = null;
let progressData = null;
let badgeCelebrationQueue = [];
let badgeCelebrationActive = false;
let badgeCelebrationKnown = new Set();

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
function questionExplanationImage(question) { return question?.explanation_image_url || question?.explanationImageUrl || ""; }
function imageContext(question) { return String(question?.text || "Physics question").replace(/\s+/g, " ").trim().slice(0, 140); }
function renderQuestionImage(question) {
  const imageUrl = questionImage(question);
  if (!imageUrl) return "";
  const alt = `Question diagram for: ${imageContext(question)}`;
  return `<figure class="question-figure" data-media-figure><button type="button" class="media-preview-trigger" data-image-preview="${escapeHtml(imageUrl)}" data-image-caption="Question diagram" aria-label="Open question diagram at full size"><span class="media-loading">Loading diagram…</span><img class="question-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(alt)}" loading="lazy"></button><figcaption><span>Question diagram</span><small>Tap to enlarge</small></figcaption></figure>`;
}
function renderExplanation(question) {
  const explanation = String(question?.explanation || "").trim();
  const imageUrl = questionExplanationImage(question);
  return `<div class="explanation-content">${explanation
    ? `<p>${renderMath(escapeHtml(explanation))}</p>`
    : `<div class="explanation-pending"><strong>Detailed explanation coming soon</strong><span>The correct answer is available now. This explanation is being completed as part of the Physics editorial release.</span></div>`}${imageUrl ? `<figure class="explanation-figure" data-media-figure><button type="button" class="media-preview-trigger" data-image-preview="${escapeHtml(imageUrl)}" data-image-caption="Worked solution" aria-label="Open worked solution at full size"><span class="media-loading">Loading solution…</span><img src="${escapeHtml(imageUrl)}" alt="Worked solution for: ${escapeHtml(imageContext(question))}" loading="lazy"></button><figcaption><span>Worked solution</span><small>Tap to enlarge</small></figcaption></figure>` : ""}</div>`;
}

function openImagePreview(source, caption) {
  document.querySelector("#image-preview")?.remove();
  const preview = document.createElement("div");
  preview.id = "image-preview";
  preview.className = "image-preview-backdrop";
  preview.innerHTML = `<section class="image-preview-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(caption)}"><header><span>${escapeHtml(caption)}</span><button type="button" aria-label="Close image preview">×</button></header><div><img src="${escapeHtml(source)}" alt="${escapeHtml(caption)} at full size"></div></section>`;
  const close = () => { document.removeEventListener("keydown", onKeydown); preview.remove(); };
  const onKeydown = event => { if (event.key === "Escape") close(); };
  preview.querySelector("button").addEventListener("click", close);
  preview.addEventListener("click", event => { if (event.target === preview) close(); });
  document.addEventListener("keydown", onKeydown);
  document.body.appendChild(preview);
  preview.querySelector("button").focus();
}

function bindQuestionMedia() {
  document.querySelectorAll("[data-image-preview]").forEach(button => {
    const image = button.querySelector("img");
    const finishLoading = () => button.classList.add("loaded");
    if (image?.complete && image.naturalWidth) finishLoading();
    else image?.addEventListener("load", finishLoading, { once: true });
    image?.addEventListener("error", () => {
      const figure = button.closest("[data-media-figure]");
      if (figure) figure.innerHTML = '<div class="media-unavailable"><strong>Diagram unavailable</strong><span>This question has been reported for media repair.</span></div>';
    }, { once: true });
    button.addEventListener("click", () => openImagePreview(button.dataset.imagePreview, button.dataset.imageCaption || "Question image"));
  });
}
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
  if (nextRoute === "challenges") { selectedChallengeId = null; challengesData = null; }
  route = nextRoute;
  if (nextRoute !== "practice") selectedSubject = null;
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function shell(content) {
  const xp = xpState();
  const testStats = profile.tests || { tests_taken: 0, average_score: 0 };
  const nav = [
    ["home", "Home"], ["practice", "Practice"], ["challenges", "Challenges"], ["progress", "Progress"], ["profile", "Profile"]
  ];
  return `<div class="layout">
    <aside class="sidebar">
      <button class="brand" data-route="home" aria-label="Seomtorch home">
        <span class="brand-symbol" aria-hidden="true"><img src="assets/seomtorch_logo.png" alt=""></span>
        <span class="brand-name">Seomtorch<small>Prepare with purpose</small></span>
      </button>
      <nav class="nav" aria-label="Primary navigation">
        ${nav.map(([id, label]) => `<button class="nav-button ${route === id ? "active" : ""}" data-route="${id}">${ICONS[id]}<span>${label}</span></button>`).join("")}
      </nav>
      <div class="sidebar-foot"><div class="streak-panel"><svg class="streak-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.5c.5 3.2-.8 4.7-2.1 6.1-1.1 1.2-2.1 2.3-1.7 4.3-1.3-.7-2-2-1.9-3.7C5.3 11 4 13.5 4.3 16.1 4.7 19.6 7.6 22 11.2 22c4.8 0 8-3.1 8-7.7 0-4.1-2.5-8.3-6-11.8Z"/><path d="M12 19.2c-1.7 0-2.9-1.1-3-2.7-.1-1.2.5-2.3 1.5-3.2.1 1 .6 1.5 1.1 1.8-.2-1.7.7-2.7 1.6-3.7 1.2 1.5 1.8 3.1 1.7 4.6-.1 1.9-1.2 3.2-2.9 3.2Z"/></svg><div><span>Current streak</span><strong>${profile.rhythm || 0}<small> day${profile.rhythm === 1 ? "" : "s"}</small></strong></div></div><div class="xp-panel"><div><strong>Level ${xp.level}</strong><span>${xp.xp} XP</span></div><div class="xp-track"><i style="width:${xp.percent}%"></i></div><small>${xp.remaining} XP to next level</small></div><p>Come back tomorrow and keep it alive.</p></div>
    </aside>
    <div class="content-wrap">
      <header class="topbar"><span class="mobile-brand"><img src="assets/seomtorch_logo.png" alt=""><b>Seomtorch</b></span><span class="sync-indicator ${pendingSyncCount > 0 ? 'pending' : navigator.onLine ? 'synced' : 'offline'}" title="${pendingSyncCount > 0 ? `${pendingSyncCount} items pending sync` : navigator.onLine ? 'Synced' : 'Offline'}"><i></i>${pendingSyncCount > 0 ? `<small>${pendingSyncCount}</small>` : ''}</span><div class="top-stat"><strong>${testStats.tests_taken}</strong><span>tests</span></div><div class="top-stat"><strong>${testStats.average_score}%</strong><span>test average</span></div><div class="top-xp" title="Level ${xp.level} · ${xp.remaining} XP to next level"><small>LV ${xp.level}</small><strong>${xp.xp} XP</strong></div><div class="top-streak" title="${profile.rhythm || 0}-day streak"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.5c.5 3.2-.8 4.7-2.1 6.1-1.1 1.2-2.1 2.3-1.7 4.3-1.3-.7-2-2-1.9-3.7C5.3 11 4 13.5 4.3 16.1 4.7 19.6 7.6 22 11.2 22c4.8 0 8-3.1 8-7.7 0-4.1-2.5-8.3-6-11.8Z"/></svg><span><small>Streak</small><strong>${profile.rhythm || 0}</strong></span></div><button class="avatar" data-route="profile" title="Open ${escapeHtml(profile.name)}'s profile">${initials()}</button></header>
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
  const testStats = profile.tests || { tests_today: 0, average_score: 0 };
  const urgentChallenge = challengesData?.find(item => item.can_respond) || challengesData?.find(item => item.can_start);
  const content = `<section class="page">
    <p class="eyebrow">Your study desk</p>
    <h1>${greeting}, ${escapeHtml(firstName())}.</h1>
    <p class="lede">A clear view of what you have done, where to focus, and the next useful step.</p>
    ${urgentChallenge ? `<article class="challenge-nudge"><div><span>${urgentChallenge.can_respond ? "Challenge invitation" : urgentChallenge.my_status === "started" ? "Attempt in progress" : "Challenge ready"}</span><h2>${escapeHtml(urgentChallenge.title)}</h2><p>${escapeHtml(urgentChallenge.creator.username)} · ${urgentChallenge.question_count} questions · ${urgentChallenge.duration_minutes} minutes</p></div><button class="button" id="open-urgent-challenge">${urgentChallenge.can_respond ? "Review invitation" : urgentChallenge.my_status === "started" ? "Continue attempt" : "Open challenge"} →</button></article>` : ""}
    <article class="continue-card">
      <div><span class="label">${recent ? "Continue where you stopped" : "Begin your preparation"}</span><h2>${recent ? escapeHtml(recent.topic) : "Start with a focused session"}</h2><p>${recent ? `${subjectName(recent.subject)} · personalised question selection` : "Choose a subject and work through a short set of questions."}</p></div>
      <button class="button accent" id="continue-study">${recent ? "Continue studying" : "Choose a subject"}<span aria-hidden="true">→</span></button>
    </article>
    <article class="sprint-card" style="margin-top: 1rem;">
      <div><span class="label">Daily challenge</span><h2>5-Minute Sprint</h2><p>5 quick questions worth up to 25 XP. ${dailySprintCompleted ? 'Completed today ✓' : 'Ready to attempt'}</p></div>
      <button class="button ${dailySprintCompleted ? 'outline' : 'accent'}" id="start-sprint">${dailySprintCompleted ? 'Sprint completed ✓' : 'Start sprint →'}</button>
    </article>
    <div class="section-head"><h2>Today, at a glance</h2><p>Synchronized account activity</p></div>
    <div class="metric-strip four">
      <div class="metric"><strong>${testStats.tests_today}</strong><span>tests completed today</span></div>
      <div class="metric"><strong>${testStats.average_score}%</strong><span>average test score</span></div>
      <div class="metric"><strong>${todayAttempts.length}</strong><span>questions today</span></div>
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
  document.querySelector("#open-urgent-challenge")?.addEventListener("click", () => { selectedChallengeId = urgentChallenge.id; route = "challenges"; renderChallenges(); });
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

      <div class="practice-modes" aria-label="Choose a practice mode">
        <button class="mode-card ${selectedPracticeMode === 'timed' ? 'selected' : ''}" data-mode="timed" aria-pressed="${selectedPracticeMode === 'timed'}">
          <span class="mode-kicker">01 · Exam conditions</span>
          <h3>Timed Practice</h3>
          <p>Answer the complete paper before viewing your score and solutions.</p>
          <span class="mode-badge exam">Custom questions & time</span>
        </button>
        <button class="mode-card ${selectedPracticeMode === 'normal' ? 'selected' : ''}" data-mode="normal" aria-pressed="${selectedPracticeMode === 'normal'}">
          <span class="mode-kicker">02 · Learn as you go</span>
          <h3>Normal Practice</h3>
          <p>Work question by question with immediate answers and explanations.</p>
          <span class="mode-badge study">Untimed study</span>
        </button>
        <button class="mode-card sprint-mode-card" data-route="daily-sprint">
          <span class="mode-kicker">03 · Daily challenge</span>
          <h3>5-Minute Sprint</h3>
          <p>Five quick questions, one attempt each day, and up to 25 XP.</p>
          <span class="mode-badge sprint-badge">${dailySprintCompleted ? 'Completed today ✓' : 'Ready today'}</span>
        </button>
      </div>

      <div class="review-entry"><div><span class="review-entry-count">${bookmarks.length}</span><div><p class="eyebrow">Your review library</p><h2>Saved for review</h2><p>${bookmarks.length ? `${bookmarks.length} question${bookmarks.length === 1 ? " is" : "s are"} ready to revisit.` : "Save useful or difficult questions during practice and they will appear here."}</p></div></div><button class="button ${bookmarks.length ? "" : "outline"}" data-subject="saved">${bookmarks.length ? "Open saved questions" : "View review library"} →</button></div>
      <div class="section-head"><h2>Subjects</h2><p>Choose a subject for ${selectedPracticeMode} practice</p></div>
      <div class="subject-list">
        <button class="subject-row all-subject-row" data-subject="all"><span class="subject-num">ALL</span><span><span class="subject-title">All subjects</span><span class="subject-meta">Balanced, grouped sections across all four available subjects</span></span><span class="mini-progress"><i style="width:${accuracy()}%"></i></span><span class="row-arrow">→</span></button>
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
  const content = `<section class="page"><button class="button outline" id="back-subjects">← Practice modes</button><div class="practice-heading"><p class="eyebrow">Review library</p><h1>Saved for review.</h1><p class="lede">A synchronized collection of the questions you chose to revisit. Remove anything you no longer need, or turn the collection into a focused timed session.</p></div>${saved.length ? `<section class="session-builder review-builder" aria-label="Review session settings"><div class="session-input"><label for="question-count">Questions to review</label><div><input id="question-count" type="number" min="1" max="${maximum}" step="1" value="${reviewCount}" inputmode="numeric" required><span>of ${saved.length}</span></div><small>Up to 100 saved questions per session.</small></div><div class="session-input"><label for="study-minutes">Study time</label><div><input id="study-minutes" type="number" min="1" max="600" step="1" value="${selectedStudyMinutes}" inputmode="numeric" required><span>minutes</span></div><small>One timer covers the complete review session.</small></div><button class="button start-review-button" id="start-review-session">Start saved review →</button></section><div class="section-head"><h2>Your saved questions</h2><p>${saved.length} synchronized</p></div><div class="saved-groups">${groups.map(group => `<section class="saved-group"><div class="saved-group-head"><h3>${group.subject.name}</h3><span>${group.items.length}</span></div>${group.items.map((item, index) => `<article class="saved-question"><span class="saved-index">${String(index + 1).padStart(2, "0")}</span><div><small>${escapeHtml(item.question.topic)}</small><p>${escapeHtml(item.question.text)}</p></div><button class="saved-remove" data-review-remove="${escapeHtml(item.questionId)}" aria-label="Remove question from saved review">Remove</button></article>`).join("")}</section>`).join("")}</div>` : `<div class="review-empty"><span class="empty-brand-symbol" aria-hidden="true"><img src="assets/seomtorch_logo.png" alt=""></span><h2>Your review library is ready.</h2><p>While answering questions, select <strong>Save for review</strong>. The question will synchronize to this account and appear here on every device.</p><button class="button" id="find-questions">Find questions to practise →</button></div>`}</section>`;
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
  showLoadingOverlay("Preparing practice", "Selecting questions for your session...");
  try {
    let queue = subject === "all" ? weightedAllSubjects(count) : subject === "saved" ? savedSessionQuestions(count) : weightedQuestions(subject, topic, count);
    let remoteId = null;
    if (authToken && navigator.onLine) {
      try {
        const startPromise = api.startSession(authToken, { subject, topic: topic ? topicSlug(topic) : null, limit: count, duration_minutes: durationMinutes, mode });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000));
        const remote = await Promise.race([startPromise, timeoutPromise]);
        remoteId = remote?.session_id || null;
        const selected = (remote?.questions || []).map(item => questionById(item.external_id)).filter(Boolean);
        if (selected.length) queue = selected;
      } catch {
        // Smooth local offline fallback
      }
    }
    if (!queue || queue.length === 0) {
      queue = questions.filter(q => subject === "all" || q.subject === subject).slice(0, count);
    }
    if (!queue || queue.length === 0) {
      showToast("No questions found for this selection.");
      route = "practice";
      render();
      return;
    }
    if (queue.length < count) {
      showToast(`${queue.length} question${queue.length === 1 ? "" : "s"} available in this selection.`);
    }
    const sections = buildSessionSections(queue);
    if (mode === "normal") durationMinutes = 0;

    activeSession = {
      subject,
      topic,
      requestedCount: count,
      durationMinutes,
      deadline: null,
      started: false,
      finished: false,
      queue,
      sections,
      answers: queue.map(() => ({ selected: null, confirmed: false, correct: false })),
      remoteId,
      index: 0,
      correct: 0,
      questionStartedAt: null,
      reportedComplete: false,
      timedOut: false,
      timeUpAcknowledged: false,
      mode
    };
    route = "session";
    render();
  } finally {
    hideLoadingOverlay();
  }
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
  ${renderQuestionImage(question)}
  <div><p class="eyebrow">Question ${String(activeSession.index + 1).padStart(2, "0")}</p><h2>${renderMath(escapeHtml(question.text))}</h2></div><div class="options">${question.options.map((option, index) => { let state = ""; if (activeSession.mode === "challenge" && answer.confirmed && index === answer.selected) state = "selected"; else if (answer.confirmed && index === question.correct) state = "correct"; else if (answer.confirmed && index === answer.selected) state = "incorrect"; else if (!answer.confirmed && index === answer.selected) state = "selected"; return `<button class="option ${state}" data-option="${index}" ${answer.confirmed ? "disabled" : ""}><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${renderMath(escapeHtml(option))}</span></button>`; }).join("")}</div>${answer.confirmed && activeSession.mode !== "challenge" ? `<div class="feedback"><div class="feedback-head"><div class="feedback-label ${answer.correct ? "" : "wrong"}">${answer.correct ? "Correct" : "Review this"}</div>${answer.correct ? '<span class="xp-earned">+5 XP</span>' : ""}</div>${renderExplanation(question)}</div>` : answer.confirmed ? '<p class="selection-note">This answer was already recorded and is locked.</p>' : answer.selected !== null ? '<p class="selection-note">Your selection is not recorded until you finish the session.</p>' : ""}<div class="question-actions"><button class="button outline" id="previous-question" ${activeSession.index === 0 ? "disabled" : ""}>← Previous</button><button class="button outline" id="bookmark">${isBookmarked ? "Remove from saved" : "Save for review"}</button><button class="button" id="next-question">${activeSession.index === activeSession.queue.length - 1 ? "Review session" : answer.selected !== null ? "Next question →" : "Skip for now →"}</button></div></article></div></section>`;
  app.innerHTML = shell(content); bindShell();
  bindQuestionMedia();
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
  if (activeSession.mode === 'timed' || activeSession.mode === 'sprint' || activeSession.mode === 'challenge') {
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
    attempt.synced = true; if (typeof response.correct === "boolean") attempt.correct = response.correct;
    const localQuestion = questionById(attempt.questionId);
    if (localQuestion && response.explanation !== undefined) {
      localQuestion.explanation = response.explanation || "";
      localQuestion.explanationStatus = response.explanation_status || localQuestion.explanationStatus;
      localQuestion.explanation_image_url = response.explanation_image_url || localQuestion.explanation_image_url || "";
    }
    await put("attempts", attempt);
    applyRemoteStats(response.stats); await put("profile", profile);
    handleEarnedBadges(response.badges_earned || []);
  } catch (error) { if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401) { attempt.syncError = error.message; await put("attempts", attempt); } }
}

function applyRemoteStats(stats = {}) {
  profile.xp = stats.xp ?? 0;
  profile.rhythm = stats.current_streak ?? 0;
  profile.bestRhythm = stats.best_streak ?? 0;
  profile.lastStudyDate = stats.last_study_date || null;
  if (stats.tests) profile.tests = stats.tests;
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
  if (activeSession.mode === "challenge") return renderChallengeSubmission();
  if (activeSession.remoteId && !activeSession.reportedComplete) {
    activeSession.reportedComplete = true;
    syncPendingAttempts().then(() => api.completeSession(authToken, activeSession.remoteId)).then(async response => { applyRemoteStats(response.stats); progressData = null; await put("profile", profile); handleEarnedBadges(response.badges_earned || []); }).catch(() => { activeSession.reportedComplete = false; });
  }
  if (activeSession.mode === "sprint" && !dailySprintCompleted) {
    dailySprintCompleted = true;
    localStorage.setItem("seomtorch-sprint-" + new Date().toISOString().slice(0, 10), "done");
  }
  const score = activeSession.queue.length ? Math.round(activeSession.correct / activeSession.queue.length * 100) : 0;
  const answered = activeSession.answers.filter(item => item.confirmed).length;
  const unanswered = activeSession.queue.length - answered;
  const note = activeSession.timedOut ? "Time is up. Review the result, then try a shorter session or return when you can give it a full window." : score >= 80 ? "A strong session. Keep the standard steady." : score >= 50 ? "Good work. Review the corrections before moving on." : "This topic needs another careful pass. That is useful information.";
  const review = activeSession.answers.map((answer, index) => { const question = activeSession.queue[index]; if (!answer.confirmed) return ""; return `<article class="result-review-item ${answer.correct ? "correct" : "incorrect"}"><div><span>Question ${index + 1}</span><strong>${answer.correct ? "Correct" : "Review"}</strong></div><p>${renderMath(escapeHtml(question.text))}</p><small>Your answer: ${escapeHtml(question.options[answer.selected] || "—")}</small>${answer.correct ? "" : `<small>Correct answer: ${escapeHtml(question.options[question.correct] || "—")}</small>`}${renderExplanation(question)}</article>`; }).join("");
  const content = `<section class="page page-narrow"><div class="session-result"><p class="eyebrow">${activeSession.timedOut ? "Time expired" : "Session complete"}</p><div class="result-score">${score}%</div><h2>${activeSession.correct} of ${activeSession.queue.length} correct</h2><p class="lede" style="margin-inline:auto">${note}</p><div class="result-meta"><span>${answered} answered</span><span>${unanswered} unanswered</span><span>${activeSession.mode === "normal" ? "Untimed practice" : `${activeSession.durationMinutes} minute timer`}</span></div><div class="button-row" style="justify-content:center;margin-top:28px"><button class="button outline" id="return-practice">Choose another topic</button>${activeSession.mode === "sprint" ? "" : '<button class="button" id="retry-session">Practise this again</button>'}</div></div>${review ? `<div class="result-review"><div class="section-head"><h2>Solutions</h2><p>Review every recorded answer</p></div>${review}</div>` : ""}</section>`;
  app.innerHTML = shell(content); bindShell();
  bindQuestionMedia();
  document.querySelector("#return-practice").addEventListener("click", () => { activeSession = null; route = "practice"; render(); });
  document.querySelector("#retry-session")?.addEventListener("click", () => startSession(activeSession.subject, activeSession.topic, activeSession.requestedCount, activeSession.durationMinutes, activeSession.mode));
}

function renderChallengeSubmission() {
  const result = activeSession.challengeResult;
  const content = result ? `<section class="page page-narrow"><div class="challenge-submitted"><span class="submission-mark"><i></i><i></i><i></i></span><p class="eyebrow">Challenge submitted</p><h1>${escapeHtml(activeSession.challengeTitle)}</h1><div class="submitted-score"><strong>${result.my_result?.correct ?? activeSession.correct}<small> / ${result.question_count}</small></strong><span>${result.my_result?.accuracy ?? Math.round(activeSession.correct / result.question_count * 100)}% accuracy</span></div><p class="lede">${result.results_unlocked ? "The private group result is ready. See how everyone progressed and the recognition each participant earned." : "Your work is recorded. Other scores remain hidden until everyone finishes or the challenge deadline passes."}</p><div class="button-row"><button class="button" id="view-challenge-result">${result.results_unlocked ? "View group result" : "Return to challenges"} →</button><button class="button outline" data-route="home">Return home</button></div></div></section>` : `<section class="page page-narrow"><div class="challenge-submitted sending"><span class="submission-mark"><i></i><i></i><i></i></span><p class="eyebrow">Securing your paper</p><h1>Submitting your challenge.</h1><p class="lede">Your confirmed answers are being synchronized before the result is sealed.</p></div></section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelector("#view-challenge-result")?.addEventListener("click", () => { challengesData = challengesData ? challengesData.map(item => item.id === result.id ? result : item) : [result]; selectedChallengeId = result.id; activeSession = null; route = "challenges"; renderChallenges(); });
  if (result || activeSession.challengeCompletionStarted) return;
  activeSession.challengeCompletionStarted = true;
  syncPendingAttempts()
    .then(() => api.completeSession(authToken, activeSession.remoteId))
    .then(async response => { applyRemoteStats(response.stats); progressData = null; await put("profile", profile); handleEarnedBadges(response.badges_earned || []); return api.challenge(authToken, activeSession.challengeId); })
    .then(challenge => { activeSession.challengeResult = challenge; applyRemoteStats(challenge.stats); put("profile", profile); challengesData = null; achievementsData = null; renderChallengeSubmission(); })
    .catch(() => { activeSession.challengeCompletionStarted = false; showToast("Your paper is saved locally. Reconnect to submit it."); });
}

function handleEarnedBadges(badges) {
  if (!badges?.length) return;
  const fresh = badges.filter(item => !badgeCelebrationKnown.has(item.code));
  fresh.forEach(item => badgeCelebrationKnown.add(item.code));
  badgeCelebrationQueue.push(...fresh);
  achievementsData = null;
  showNextBadgeCelebration();
}

function showNextBadgeCelebration() {
  if (badgeCelebrationActive || !badgeCelebrationQueue.length) return;
  badgeCelebrationActive = true;
  const badge = badgeCelebrationQueue.shift();
  const overlay = document.createElement("div");
  overlay.className = "badge-unlock-backdrop";
  overlay.innerHTML = `<section class="badge-unlock" role="dialog" aria-modal="true" aria-labelledby="badge-unlock-title"><div class="badge-unlock-seal ${escapeHtml(badge.tier)}"><span>${escapeHtml(badge.name.split(/\s+/).map(word => word[0]).slice(0, 2).join(""))}</span><i></i></div><p class="eyebrow">Achievement earned</p><h2 id="badge-unlock-title">${escapeHtml(badge.name)}</h2><p>${escapeHtml(badge.description)}</p><button class="button">Keep going</button></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector("button").addEventListener("click", async () => { overlay.classList.add("leaving"); await api.markBadgesSeen(authToken, [badge.code]).catch(() => {}); setTimeout(() => { overlay.remove(); badgeCelebrationActive = false; showNextBadgeCelebration(); }, 220); });
}

function renderProgress() {
  if (!progressData) {
    app.innerHTML = shell(`<section class="page"><p class="eyebrow">Progress</p><h1>Your test record.</h1><p class="lede">Preparing completed papers, score trends and subject analysis.</p><div class="progress-loading"><i></i><i></i><i></i></div></section>`);
    bindShell(); loadProgress(); return;
  }
  const xp = xpState();
  const tests = progressData.tests;
  const movement = tests.improvement === null ? "Building" : `${tests.improvement >= 0 ? "+" : ""}${tests.improvement}`;
  const content = `<section class="page progress-page"><p class="eyebrow">Progress</p><h1>Your test record.</h1><p class="lede">Completed papers lead the analysis. Individual answers remain available as supporting evidence.</p><div class="metric-strip four test-metrics"><div class="metric"><strong>${tests.tests_taken}</strong><span>tests taken</span></div><div class="metric"><strong>${tests.average_score}%</strong><span>average test score</span></div><div class="metric"><strong>${tests.best_score}%</strong><span>best test score</span></div><div class="metric ${tests.improvement !== null && tests.improvement >= 0 ? "xp-metric" : ""}"><strong>${movement}${tests.improvement === null ? "" : "<small> pts</small>"}</strong><span>recent movement</span></div></div><div class="test-analysis-grid"><section class="report-panel test-trend"><div class="section-head compact"><div><p class="eyebrow">Last ${tests.trend.length} tests</p><h2>Score movement</h2></div><p>${tests.completion_rate}% completion rate</p></div>${tests.trend.length ? `<div class="trend-bars">${tests.trend.map((item, index) => `<div title="${escapeHtml(item.focus)} · ${item.score}%"><span style="height:${Math.max(4, item.score)}%"></span><small>${index + 1}</small></div>`).join("")}</div>` : '<div class="empty">Your score movement will appear after your first completed test.</div>'}</section><section class="report-panel"><div class="section-head compact"><div><p class="eyebrow">Test formats</p><h2>How you practise</h2></div></div><div class="test-mode-list">${tests.by_mode.length ? tests.by_mode.map(item => `<div><span><strong>${escapeHtml(item.label)}</strong><small>${item.count} test${item.count === 1 ? "" : "s"}</small></span><b>${item.average_score}%</b></div>`).join("") : '<div class="empty">No completed formats yet.</div>'}</div></section></div><div class="section-head"><h2>Test history</h2><p>${tests.questions_in_tests} questions answered within completed tests</p></div><div class="test-history">${tests.recent_tests.length ? tests.recent_tests.map(item => `<article><time>${new Date(item.completed_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</time><div><strong>${escapeHtml(item.focus)}</strong><small>${escapeHtml(item.mode_label)} · ${item.answered}/${item.total} answered</small></div><span>${item.score}%</span></article>`).join("") : '<div class="empty">Complete a test and it will appear here.</div>'}</div><div class="section-head"><h2>Academic detail</h2><p>${progressData.stats.total_attempts} individual answers recorded</p></div><div class="report-grid"><div class="report-panel"><h3>Subject performance</h3>${progressData.subjects.map(item => `<div class="report-row"><span>${escapeHtml(item.name)}<small>${item.total} answers</small></span><strong>${item.accuracy}%</strong></div>`).join("") || '<div class="empty">No subject results yet.</div>'}</div><div class="report-panel"><h3>Topics needing attention</h3>${progressData.topics.filter(item => item.total >= 2).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5).map(item => `<div class="report-row"><span>${escapeHtml(item.name)}<small>${subjectName(item.subject)} · ${item.total} answers</small></span><strong class="${item.accuracy < 50 ? "attention" : ""}">${item.accuracy}%</strong></div>`).join("") || '<div class="empty">Complete at least two questions in a topic to identify focus areas.</div>'}</div></div><div class="supporting-stat"><span>Supporting activity</span><strong>${progressData.stats.total_attempts} questions answered · ${progressData.stats.accuracy}% answer accuracy · ${xp.xp} XP</strong></div></section>`;
  app.innerHTML = shell(content); bindShell();
}

async function loadProgress() {
  try {
    progressData = await api.progress(authToken);
    applyRemoteStats(progressData.stats);
    await put("profile", profile);
    if (route === "progress") renderProgress();
  } catch { if (route === "progress") showToast("Test analysis could not be loaded"); }
}

function renderProfile(filter = "") {
  const normalized = filter.trim().toLowerCase();
  const matches = FAQS.filter(item => !normalized || `${item.q} ${item.a} ${item.group}`.toLowerCase().includes(normalized));
  const groups = [...new Set(matches.map(item => item.group))];
  const xp = xpState();
  const testStats = profile.tests || { tests_taken: 0, average_score: 0 };
  const joined = currentUser?.date_joined ? new Date(currentUser.date_joined).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "—";
  const content = `<section class="page profile-page"><div class="profile-hero"><div class="profile-monogram">${initials()}</div><div><p class="eyebrow">Student profile</p><h1>${escapeHtml(currentUser?.username || profile.name)}</h1><p>${escapeHtml(currentUser?.email || profile.email)} · Member since ${joined}</p></div><button class="button outline" id="refresh-account">Refresh account</button></div><div class="profile-grid"><section class="profile-card identity-card"><span class="card-label">Student ID</span><strong>${escapeHtml(currentUser?.public_id || "—")}</strong><p>Share this ID with people you know when they invite you to a challenge.</p></section><section class="profile-card level-card"><span class="card-label">Level ${xp.level}</span><strong>${xp.xp} <small>XP</small></strong><div class="xp-track light"><i style="width:${xp.percent}%"></i></div><p>${xp.remaining} XP until level ${xp.level + 1}</p></section></div><div class="metric-strip four profile-metrics"><div class="metric"><strong>${attempts.length}</strong><span>answers recorded</span></div><div class="metric"><strong>${accuracy()}%</strong><span>overall accuracy</span></div><div class="metric streak-metric"><strong>${profile.rhythm || 0}<small> days</small></strong><span>current streak</span></div><div class="metric"><strong>${profile.bestRhythm || 0}<small> days</small></strong><span>best streak</span></div></div>${renderAchievementSummary()}<div class="section-head"><h2>Subject record</h2><p>Synchronized account history</p></div><div class="profile-subjects">${SUBJECTS.map(subject => { const stat = subjectStats(subject.id); return `<article><span>${subject.name}</span><strong>${stat.count ? `${stat.accuracy}%` : "—"}</strong><small>${stat.count} answer${stat.count === 1 ? "" : "s"}</small></article>`; }).join("")}</div><section class="settings-panel"><p class="eyebrow">Account data</p><h2>Portable, private and recoverable.</h2><p class="lede">The server keeps the authoritative account record. This device stores an offline copy and queues answers whenever the connection drops.</p><div class="button-row"><button class="button" id="export-data">Export backup</button><label class="button outline" for="import-data">Import backup</label><input class="file-input" id="import-data" type="file" accept="application/json"><button class="button outline" id="clear-cache">Refresh device cache</button><button class="button danger" id="sign-out">Sign out</button></div></section><section class="settings-panel guide-section"><p class="eyebrow">Guide and support</p><h2>Answers, without the noise.</h2><p class="lede">Quick guidance about practice, progress and account data.</p><div class="search-wrap"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg><input type="search" id="faq-search" value="${escapeHtml(filter)}" placeholder="Search help topics" aria-label="Search help topics"></div><div id="faq-results">${groups.length ? groups.map(group => `<section class="faq-group"><h3>${group}</h3>${matches.filter(item => item.group === group).map(item => `<div class="faq-item"><button class="faq-question" aria-expanded="false"><span>${item.q}</span><span aria-hidden="true">+</span></button><div class="faq-answer">${item.a}</div></div>`).join("")}</section>`).join("") : '<div class="empty">No help entries match that search.</div>'}</div></section></section>`;
  app.innerHTML = shell(content);
  const profileMetrics = document.querySelectorAll(".profile-metrics .metric");
  if (profileMetrics[0]) profileMetrics[0].innerHTML = `<strong>${testStats.tests_taken}</strong><span>tests taken</span>`;
  if (profileMetrics[1]) profileMetrics[1].innerHTML = `<strong>${testStats.average_score}%</strong><span>average test score</span>`;
  bindShell(); bindProfile();
  if (!achievementsData) loadAchievements(filter);
}

function localDateTimeValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function challengeTime(value) {
  return new Date(value).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function challengeStatusLabel(status) {
  return ({ invited: "Awaiting your reply", accepted: "Ready", declined: "Declined", started: "In progress", completed: "Completed", abandoned: "Left challenge" })[status] || status;
}

function challengeCard(item) {
  const participantCount = item.participants.filter(person => !["declined", "abandoned"].includes(person.status)).length;
  const urgent = item.can_respond || item.can_start;
  return `<button class="challenge-card ${urgent ? "urgent" : ""}" data-challenge-id="${item.id}"><div class="challenge-card-top"><span class="challenge-state ${item.state}">${item.can_respond ? "Invitation" : item.state}</span><span>${participantCount} participant${participantCount === 1 ? "" : "s"}</span></div><h3>${escapeHtml(item.title)}</h3><p>By ${escapeHtml(item.creator.username)} · ${escapeHtml(item.subject_label)}</p><div class="challenge-facts"><span><strong>${item.question_count}</strong> questions</span><span><strong>${item.duration_minutes}</strong> minutes</span></div><div class="challenge-card-foot"><span>${challengeStatusLabel(item.my_status)}</span><strong>${item.state === "upcoming" ? challengeTime(item.starts_at) : item.state === "open" ? `Closes ${challengeTime(item.ends_at)}` : "View result"} →</strong></div></button>`;
}

function renderChallengeComposer() {
  const starts = new Date(Date.now() + 30 * 60000);
  const ends = new Date(Date.now() + 24 * 60 * 60000);
  return `<section class="challenge-composer"><div class="composer-intro"><p class="eyebrow">Create a private challenge</p><h2>Set the paper. Invite your people.</h2><p>Everyone receives the same frozen question set. Each accepted friend gets one timed attempt inside your chosen window.</p></div><form id="challenge-form"><div class="challenge-form-grid"><div class="field"><label for="challenge-title">Challenge title</label><input id="challenge-title" name="title" maxlength="100" value="Weekend study circle" required></div><div class="field"><label for="challenge-subject">Focus</label><select id="challenge-subject" name="subject"><option value="all">All subjects</option>${SUBJECTS.map(subject => `<option value="${subject.id}">${subject.name}</option>`).join("")}</select></div><div class="field"><label for="challenge-count">Questions</label><input id="challenge-count" name="question_count" type="number" min="10" max="100" value="20" required></div><div class="field"><label for="challenge-duration">Timer in minutes</label><input id="challenge-duration" name="duration_minutes" type="number" min="1" max="180" value="20" required></div><div class="field"><label for="challenge-start">Opens</label><input id="challenge-start" name="starts_at" type="datetime-local" value="${localDateTimeValue(starts)}" required></div><div class="field"><label for="challenge-end">Completion deadline</label><input id="challenge-end" name="ends_at" type="datetime-local" value="${localDateTimeValue(ends)}" required></div></div><div class="field"><label for="challenge-message">Invitation note <span>optional</span></label><textarea id="challenge-message" name="message" maxlength="280" placeholder="A short note for the group"></textarea></div><div class="invite-builder"><label for="friend-id">Invite with Student ID</label><div><input id="friend-id" maxlength="6" autocomplete="off" placeholder="e.g. A7B2Q9"><button class="button outline" type="button" id="add-friend">Add friend</button></div><small>Invite up to nine registered friends you know.</small><div class="invitee-list">${challengeInvitees.length ? challengeInvitees.map(item => `<span>${escapeHtml(item.username)} <small>${item.public_id}</small><button type="button" data-remove-invitee="${item.public_id}" aria-label="Remove ${escapeHtml(item.username)}">×</button></span>`).join("") : '<p>No friends added yet.</p>'}</div></div><div id="challenge-error" class="auth-error" role="alert"></div><div class="button-row"><button class="button" type="submit">Review challenge →</button><button class="button outline" type="button" id="close-composer">Cancel</button></div></form></section>`;
}

function renderChallengeDetail(item) {
  const statusCopy = item.results_unlocked ? "The group result is ready." : item.my_status === "completed" ? "Your paper is submitted. Group results unlock when everyone responds and finishes, or when the deadline passes." : item.state === "upcoming" ? `This challenge opens ${challengeTime(item.starts_at)}.` : item.state === "open" ? "Your attempt timer starts only when you confirm Begin challenge." : "This challenge window is closed.";
  const myResult = item.my_result ? `<section class="my-challenge-result"><p class="eyebrow">Your work</p><strong>${item.my_result.correct}<small> / ${item.my_result.total}</small></strong><div><h3>${item.my_result.accuracy}% accuracy${item.my_result.bonus_xp ? ` · +${item.my_result.bonus_xp} challenge XP` : ""}</h3><p>${item.my_result.change_from_average === null ? "Your first personal comparison will appear after more practice." : item.my_result.change_from_average >= 0 ? `${item.my_result.change_from_average} points above your recent average.` : "Use the challenge review to choose your next focus."}</p></div></section>` : "";
  const resultBoard = item.results_unlocked && item.results.length ? `<section class="challenge-results"><div class="section-head"><div><p class="eyebrow">Private group result</p><h2>Challenge Results</h2></div><p>Accuracy first. Time breaks ties only.</p></div>${item.results.map(row => `<article class="result-person ${row.public_id === currentUser.public_id ? "you" : ""}"><span class="result-position">${String(row.position).padStart(2, "0")}</span><div><h3>${escapeHtml(row.username)}${row.public_id === currentUser.public_id ? " · You" : ""}</h3><p>${escapeHtml(row.recognition)}${row.bonus_xp ? ` · +${row.bonus_xp} XP` : ""}</p></div><strong>${row.correct}/${row.total}<small>${row.accuracy}%</small></strong></article>`).join("")}</section>` : `<section class="results-quiet"><span class="quiet-lines"><i></i><i></i><i></i></span><h3>Scores stay quiet for now.</h3><p>${escapeHtml(statusCopy)}</p></section>`;
  const removeLabel = item.removal_mode === "cancel" ? "Cancel and leave challenge" : item.removal_mode === "abandon" ? "Leave challenge" : "Remove from my challenges";
  return `<section class="page"><button class="button outline" id="back-challenges">← All challenges</button><div class="challenge-detail-head"><div><p class="eyebrow">${item.can_respond ? "Challenge invitation" : "Friend challenge"}</p><h1>${escapeHtml(item.title)}</h1><p class="lede">${escapeHtml(item.message || `${item.creator.username} invited this group to practise together.`)}</p></div><span class="challenge-state ${item.state}">${item.state}</span></div><div class="challenge-detail-grid"><section class="challenge-brief"><span>Created by</span><strong>${escapeHtml(item.creator.username)}</strong><span>Focus</span><strong>${escapeHtml(item.subject_label)}</strong><span>Paper</span><strong>${item.question_count} questions · ${item.duration_minutes} minutes</strong><span>Challenge window</span><strong>${challengeTime(item.starts_at)}<br>to ${challengeTime(item.ends_at)}</strong></section><section class="participant-panel"><div class="section-head"><h2>Study circle</h2><p>${item.participants.length} invited</p></div>${item.participants.map(person => `<div class="participant-row"><span class="participant-monogram">${escapeHtml(person.username.slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(person.username)}${person.public_id === currentUser.public_id ? " · You" : ""}</strong><small>${person.is_creator ? "Creator" : person.public_id}</small></div><span class="participant-status ${person.status}">${challengeStatusLabel(person.status)}</span></div>`).join("")}</section></div><div class="challenge-actions">${item.can_respond ? '<button class="button" data-challenge-response="accept">Accept invitation</button><button class="button outline" data-challenge-response="decline">Decline</button>' : ""}${item.can_start ? `<button class="button challenge-start" id="begin-challenge">${item.my_status === "started" ? "Continue attempt" : "Begin challenge"} →</button>` : ""}${item.can_remove ? `<button class="button danger challenge-remove" id="remove-challenge">${removeLabel}</button>` : ""}</div>${myResult}${resultBoard}</section>`;
}

function renderChallenges() {
  const selected = challengesData?.find(item => item.id === selectedChallengeId);
  if (selected) {
    app.innerHTML = shell(renderChallengeDetail(selected)); bindShell(); bindChallengeDetail(selected); return;
  }
  const invitations = challengesData?.filter(item => item.can_respond) || [];
  const current = challengesData?.filter(item => !item.can_respond && ["upcoming", "open"].includes(item.state) && !["declined", "completed"].includes(item.my_status)) || [];
  const history = challengesData?.filter(item => item.state === "closed" || item.my_status === "completed" || item.my_status === "declined") || [];
  const content = `<section class="page challenges-page"><div class="challenge-page-head"><div><p class="eyebrow">Study together</p><h1>Challenges.</h1><p class="lede">A private place to invite people you know, sit the same paper and compare progress without public pressure.</p></div><button class="button" id="toggle-challenge-composer">${challengeComposerOpen ? "Close creator" : "Create a challenge"}</button></div>${challengeComposerOpen ? renderChallengeComposer() : ""}${!challengesData ? '<div class="challenge-loading"><i></i><i></i><i></i><p>Gathering your study circle…</p></div>' : `${invitations.length ? `<div class="section-head"><h2>Invitations</h2><p>Waiting for your response</p></div><div class="challenge-grid">${invitations.map(challengeCard).join("")}</div>` : ""}<div class="section-head"><h2>Upcoming and active</h2><p>${current.length ? `${current.length} challenge${current.length === 1 ? "" : "s"}` : "Nothing scheduled"}</p></div>${current.length ? `<div class="challenge-grid">${current.map(challengeCard).join("")}</div>` : '<div class="challenge-empty"><span>Make room for shared effort.</span><p>Create a private challenge or ask a friend to invite you with your Student ID.</p></div>'}${history.length ? `<div class="section-head"><h2>Completed</h2><p>Your private challenge record</p></div><div class="challenge-grid history">${history.map(challengeCard).join("")}</div>` : ""}`}</section>`;
  app.innerHTML = shell(content); bindShell(); bindChallenges();
  if (!challengesData) loadChallenges();
}

async function loadChallenges() {
  try { challengesData = await api.challenges(authToken); if (challengesData.at(-1)?.stats) { applyRemoteStats(challengesData.at(-1).stats); put("profile", profile); } if (route === "challenges") renderChallenges(); else if (route === "home") renderHome(); }
  catch { if (route === "challenges") showToast("Challenges could not be loaded"); }
}

function bindChallenges() {
  document.querySelector("#toggle-challenge-composer")?.addEventListener("click", () => { challengeComposerOpen = !challengeComposerOpen; renderChallenges(); });
  document.querySelector("#close-composer")?.addEventListener("click", () => { challengeComposerOpen = false; challengeInvitees = []; renderChallenges(); });
  document.querySelectorAll("[data-challenge-id]").forEach(button => button.addEventListener("click", () => { selectedChallengeId = button.dataset.challengeId; renderChallenges(); }));
  document.querySelector("#add-friend")?.addEventListener("click", addChallengeFriend);
  bindInviteeRemoval();
  document.querySelector("#challenge-form")?.addEventListener("submit", reviewChallengeForm);
}

async function addChallengeFriend() {
  const input = document.querySelector("#friend-id");
  const error = document.querySelector("#challenge-error");
  const publicId = input.value.trim().toUpperCase();
  if (challengeInvitees.some(item => item.public_id === publicId)) { error.textContent = "That friend is already included."; return; }
  if (challengeInvitees.length >= 9) { error.textContent = "A challenge can include up to nine invited friends."; return; }
  try { const student = await api.lookupStudent(authToken, publicId); challengeInvitees.push(student); input.value = ""; error.textContent = ""; renderInviteeList(); }
  catch (caught) { error.textContent = caught instanceof ApiError ? caught.message : "That student could not be found."; }
}

function bindInviteeRemoval() {
  document.querySelectorAll("[data-remove-invitee]").forEach(button => button.addEventListener("click", () => { challengeInvitees = challengeInvitees.filter(item => item.public_id !== button.dataset.removeInvitee); renderInviteeList(); }));
}

function renderInviteeList() {
  const list = document.querySelector(".invitee-list");
  if (!list) return;
  list.innerHTML = challengeInvitees.length ? challengeInvitees.map(item => `<span>${escapeHtml(item.username)} <small>${item.public_id}</small><button type="button" data-remove-invitee="${item.public_id}" aria-label="Remove ${escapeHtml(item.username)}">×</button></span>`).join("") : '<p>No friends added yet.</p>';
  bindInviteeRemoval();
}

function reviewChallengeForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const error = document.querySelector("#challenge-error");
  if (!challengeInvitees.length) { error.textContent = "Add at least one friend before sending the challenge."; return; }
  const body = { ...values, question_count: Number(values.question_count), duration_minutes: Number(values.duration_minutes), starts_at: new Date(values.starts_at).toISOString(), ends_at: new Date(values.ends_at).toISOString(), participant_ids: challengeInvitees.map(item => item.public_id) };
  const detail = `<dl class="session-confirm-summary"><div><dt>Focus</dt><dd>${escapeHtml(values.subject === "all" ? "All subjects" : subjectName(values.subject))}</dd></div><div><dt>Paper</dt><dd>${body.question_count} questions · ${body.duration_minutes} minutes</dd></div><div><dt>Friends</dt><dd>${challengeInvitees.map(item => escapeHtml(item.username)).join(", ")}</dd></div><div><dt>Opens</dt><dd>${challengeTime(body.starts_at)}</dd></div><div><dt>Deadline</dt><dd>${challengeTime(body.ends_at)}</dd></div></dl>`;
  showConfirmDialog({ title: "Send this challenge?", message: "The question set will be frozen after sending, so everyone receives the same paper.", detail, confirmLabel: "Send invitations", cancelLabel: "Keep editing", onConfirm: () => createChallenge(body) });
}

async function createChallenge(body) {
  try {
    const challenge = await api.createChallenge(authToken, body);
    challengesData = [challenge, ...(challengesData || [])]; challengeInvitees = []; challengeComposerOpen = false; selectedChallengeId = challenge.id;
    showToast("Challenge invitations sent"); renderChallenges();
  } catch (caught) { showToast(caught instanceof ApiError ? caught.message : "The challenge could not be created"); }
}

function bindChallengeDetail(item) {
  document.querySelector("#back-challenges")?.addEventListener("click", () => { selectedChallengeId = null; renderChallenges(); });
  document.querySelectorAll("[data-challenge-response]").forEach(button => button.addEventListener("click", () => { const response = button.dataset.challengeResponse; showConfirmDialog({ title: `${response === "accept" ? "Accept" : "Decline"} this challenge?`, message: response === "accept" ? "It will be added to your study schedule. Your timer starts only when you begin inside the challenge window." : "The creator will see that you declined, but no academic score will be recorded.", confirmLabel: response === "accept" ? "Accept invitation" : "Decline invitation", tone: response === "decline" ? "warning" : "default", onConfirm: () => respondToChallenge(item.id, response) }); }));
  document.querySelector("#begin-challenge")?.addEventListener("click", () => showConfirmDialog({ title: "Begin your challenge attempt?", message: `Your ${item.duration_minutes}-minute timer will start immediately. You have one attempt at the shared paper.`, detail: `<p class="dialog-question-preview">${item.question_count} questions · ${escapeHtml(item.subject_label)} · results stay private until the group finishes.</p>`, confirmLabel: "Begin challenge", cancelLabel: "Not yet", onConfirm: () => beginChallenge(item) }));
  document.querySelector("#remove-challenge")?.addEventListener("click", () => {
    const cancelling = item.removal_mode === "cancel";
    const abandoning = item.removal_mode === "abandon";
    showConfirmDialog({
      title: cancelling ? "Cancel and leave this challenge?" : abandoning ? "Leave this challenge?" : "Remove this challenge?",
      message: cancelling
        ? "The challenge will be cancelled if no friend has started. Your copy will be removed from this list."
        : abandoning
          ? "You will leave the study circle and any active challenge attempt will end. Confirmed answers remain in your learning record."
          : "This removes the challenge from your list. Existing academic results and group records remain safely stored.",
      confirmLabel: cancelling ? "Cancel challenge" : abandoning ? "Leave challenge" : "Remove challenge",
      cancelLabel: "Keep challenge",
      tone: "warning",
      onConfirm: () => removeChallenge(item.id),
    });
  });
}

async function removeChallenge(id) {
  try {
    await api.removeChallenge(authToken, id);
    challengesData = (challengesData || []).filter(item => item.id !== id);
    selectedChallengeId = null;
    showToast("Challenge removed from your list");
    renderChallenges();
  } catch (caught) {
    showToast(caught instanceof ApiError ? caught.message : "The challenge could not be removed");
  }
}

async function respondToChallenge(id, response) {
  try { const updated = await api.respondChallenge(authToken, id, response); challengesData = challengesData.map(item => item.id === id ? updated : item); showToast(response === "accept" ? "Challenge accepted" : "Invitation declined"); renderChallenges(); }
  catch (caught) { showToast(caught instanceof ApiError ? caught.message : "The invitation could not be updated"); }
}

async function beginChallenge(item) {
  try {
    const remote = await api.startChallenge(authToken, item.id);
    const queue = remote.questions.map(question => ({ ...(questionById(question.external_id) || {}), ...question, id: question.external_id })).filter(question => question.id);
    if (!queue.length) throw new Error("The shared paper could not be prepared on this device.");
    activeSession = { subject: item.subject, topic: null, requestedCount: queue.length, durationMinutes: item.duration_minutes, deadline: new Date(remote.deadline_at).getTime(), started: true, finished: false, queue, sections: buildSessionSections(queue), answers: queue.map(question => remote.answers?.[question.id] === undefined ? ({ selected: null, confirmed: false, correct: false }) : ({ selected: remote.answers[question.id], confirmed: true, correct: false })), remoteId: remote.session_id, challengeId: item.id, challengeTitle: item.title, index: 0, correct: 0, questionStartedAt: Date.now(), reportedComplete: false, timedOut: false, timeUpAcknowledged: false, mode: "challenge" };
    route = "session"; render();
  } catch (caught) { showToast(caught instanceof ApiError ? caught.message : caught.message); challengesData = null; renderChallenges(); }
}

function badgeInitials(item) {
  return item.name.split(/\s+/).map(word => word[0]).slice(0, 2).join("");
}

function renderAchievementSummary() {
  if (!achievementsData) return `<section class="achievement-summary loading"><div><p class="eyebrow">Achievements</p><h2>Your record is loading.</h2></div><div class="achievement-loading"><i></i><i></i><i></i></div></section>`;
  const earned = achievementsData.badges.filter(item => item.earned).slice(0, 7);
  return `<section class="achievement-summary"><div class="achievement-summary-copy"><p class="eyebrow">Achievements</p><h2>${achievementsData.earned_count ? `${achievementsData.earned_count} earned so far.` : "Your first badge is ahead."}</h2><p>${achievementsData.earned_count ? "A compact record of the work you have already put in." : "Every completed session moves an achievement closer."}</p></div><div class="earned-badge-strip">${earned.length ? earned.map(item => `<span class="mini-badge ${item.tier}" title="${escapeHtml(item.name)}"><i>${escapeHtml(badgeInitials(item))}</i><small>${escapeHtml(item.name)}</small></span>`).join("") : '<span class="no-badges-yet">No badges earned yet</span>'}</div><button class="achievement-open" id="open-achievements"><span>Explore all badges</span><strong>${achievementsData.earned_count} / ${achievementsData.total_count}</strong><i aria-hidden="true">→</i></button></section>`;
}

function renderAchievements() {
  if (!achievementsData) {
    app.innerHTML = shell(`<section class="page achievements-page"><button class="button outline" data-route="profile">← Profile</button><div class="achievement-page-head"><p class="eyebrow">Personal record</p><h1>Achievements.</h1><p class="lede">A clear record of consistency, learning habits and milestones—not a public ranking.</p></div><div class="achievement-loading page-loading"><i></i><i></i><i></i></div></section>`);
    bindShell(); loadAchievements(); return;
  }
  const categories = [...new Set(achievementsData.badges.map(item => item.category))];
  const content = `<section class="page achievements-page"><button class="button outline" data-route="profile">← Profile</button><div class="achievement-page-head"><div><p class="eyebrow">Personal record</p><h1>Achievements.</h1><p class="lede">A clear record of consistency, learning habits and milestones—not a public ranking.</p></div><div class="achievement-tally"><strong>${achievementsData.earned_count}</strong><span>earned from ${achievementsData.total_count}</span></div></div>${categories.map(category => { const items = achievementsData.badges.filter(item => item.category === category); return `<section class="badge-category"><div class="section-head"><h2>${escapeHtml(category)}</h2><p>${items.filter(item => item.earned).length} of ${items.length} earned</p></div><div class="badge-ledger">${items.map(item => `<button class="badge-ledger-row ${item.earned ? `earned ${item.tier}` : "locked"}" data-badge-code="${item.code}"><span class="badge-ledger-seal">${escapeHtml(badgeInitials(item))}</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.earned ? `Earned ${new Date(item.earned_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : `${item.current} of ${item.target}`}</small></span><span class="badge-ledger-progress"><i style="width:${item.percent}%"></i></span><span class="badge-ledger-arrow" aria-hidden="true">→</span></button>`).join("")}</div></section>`; }).join("")}</section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelectorAll("[data-badge-code]").forEach(button => button.addEventListener("click", () => showBadgeDetail(button.dataset.badgeCode)));
}

function showBadgeDetail(code) {
  const badge = achievementsData?.badges.find(item => item.code === code);
  if (!badge) return;
  document.querySelector("#badge-detail")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "badge-detail"; overlay.className = "badge-detail-backdrop";
  overlay.innerHTML = `<section class="badge-detail" role="dialog" aria-modal="true" aria-labelledby="badge-detail-title"><button class="badge-detail-close" aria-label="Close badge details">×</button><div class="badge-detail-seal ${badge.earned ? `earned ${badge.tier}` : "locked"}">${escapeHtml(badgeInitials(badge))}</div><p class="eyebrow">${escapeHtml(badge.category)}</p><h2 id="badge-detail-title">${escapeHtml(badge.name)}</h2><p>${escapeHtml(badge.description)}</p><div class="badge-detail-status"><span>${badge.earned ? "Earned" : "Progress"}</span><strong>${badge.earned ? new Date(badge.earned_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : `${badge.current} of ${badge.target}`}</strong></div>${badge.earned ? "" : `<div class="badge-progress detail"><i style="width:${badge.percent}%"></i></div>`}<button class="button" data-close-badge>Done</button></section>`;
  document.body.appendChild(overlay);
  const onKeydown = event => { if (event.key === "Escape") close(); };
  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    overlay.classList.add("leaving");
    setTimeout(() => overlay.remove(), 180);
  };
  overlay.querySelector(".badge-detail-close").addEventListener("click", close);
  overlay.querySelector("[data-close-badge]").addEventListener("click", close);
  overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", onKeydown);
  overlay.querySelector(".badge-detail-close").focus();
}

async function loadAchievements(filter = "") {
  try {
    achievementsData = await api.achievements(authToken);
    if (route === "profile") renderProfile(filter);
    if (route === "achievements") renderAchievements();
    const unseen = achievementsData.badges.filter(item => item.unseen);
    if (unseen.length) handleEarnedBadges(unseen);
  } catch {
    if (route === "profile") document.querySelector(".achievement-summary")?.classList.add("unavailable");
  }
}

function bindProfile() {
  document.querySelectorAll(".faq-question").forEach(button => button.addEventListener("click", () => { const item = button.closest(".faq-item"); item.classList.toggle("open"); button.setAttribute("aria-expanded", item.classList.contains("open")); }));
  let timer; document.querySelector("#faq-search").addEventListener("input", event => { clearTimeout(timer); timer = setTimeout(() => renderProfile(event.target.value), 180); });
  document.querySelector("#export-data").addEventListener("click", exportData);
  document.querySelector("#import-data").addEventListener("change", event => importData(event.target.files[0]));
  document.querySelector("#refresh-account").addEventListener("click", async () => { const synced = await syncPendingAttempts(); showToast(synced ? "Account is up to date" : "Could not reach the account server"); renderProfile(); });
  document.querySelector("#clear-cache").addEventListener("click", refreshDeviceCache);
  document.querySelector("#sign-out").addEventListener("click", signOut);
  document.querySelector("#open-achievements")?.addEventListener("click", () => navigate("achievements"));
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
  app.innerHTML = `<main class="onboarding auth-screen"><section class="onboard-brand"><span class="brand"><span class="brand-symbol" aria-hidden="true"><img src="assets/seomtorch_logo.png" alt=""></span><span class="brand-name">Seomtorch<small>Prepare with purpose</small></span></span><div><blockquote>Your progress should follow you.</blockquote><p>Sign in to keep every answer, streak and milestone connected to your account.</p></div><small>Biology · Civic Education · Computer Studies · English Language · General Paper · History · Mathematics · Music · Physics</small></section><section class="onboard-form"><div><div class="auth-tabs"><button class="${!register ? "active" : ""}" data-auth-mode="signin">Sign in</button><button class="${register ? "active" : ""}" data-auth-mode="register">Register</button></div><p class="eyebrow">${register ? "Create your account" : "Welcome back"}</p><h1>${register ? "Begin your preparation." : "Return to your study desk."}</h1><p class="lede">${register ? "Use an email, username and secure password." : "Sign in with your email address and password."}</p><form id="auth-form" class="auth-form">${register ? '<div class="field"><label for="auth-username">Username</label><input id="auth-username" name="username" type="text" maxlength="150" autocomplete="username" required></div>' : ""}<div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" required></div><div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" minlength="8" autocomplete="${register ? "new-password" : "current-password"}" required></div><div id="auth-error" class="auth-error" role="alert"></div><button class="button auth-submit" type="submit">${register ? "Create account" : "Sign in"} →</button></form></div></section></main>`;
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
  profile = { id: "local-user", remoteId: user.public_id, name: user.username, email: user.email, xp: stats.xp ?? 0, rhythm: stats.current_streak ?? 0, bestRhythm: stats.best_streak ?? 0, lastStudyDate: stats.last_study_date || null, tests: stats.tests || profile?.tests || null, createdAt: profile?.createdAt || Date.now() };
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
  authToken = null; currentUser = null; profile = null; attempts = []; bookmarks = []; challengesData = null; achievementsData = null; progressData = null; selectedChallengeId = null; badgeCelebrationKnown.clear(); badgeCelebrationQueue = []; localStorage.removeItem("seomtorch-auth-token"); localStorage.removeItem("seomtorch-auth-user"); renderAuth();
}

function render() {
  if (!authToken || !currentUser || !profile) return renderAuth();
  if (currentUser.must_change_password) return renderPasswordChange(true);
  if (route === "daily-sprint") return renderDailySprint();
  if (route === "home") return renderHome();
  if (route === "practice") return renderPractice();
  if (route === "challenges") return renderChallenges();
  if (route === "session") return renderSession();
  if (route === "progress") return renderProgress();
  if (route === "profile") return renderProfile();
  if (route === "achievements") return renderAchievements();
  if (route === "change-password") return renderPasswordChange(false);
}

async function init() {
  try {
    db = await openDatabase();
    await Promise.all([loadQuestions(), loadData()]);
    if (authToken && currentUser) {
      await prepareLocalUser(currentUser);
      render();
    } else {
      renderAuth();
    }
    dismissAppLoader();
    const authenticated = await restoreAuth();
    render();
    if (authenticated) {
      syncPendingAttempts();
      loadChallenges();
    }
    window.addEventListener("online", async () => { if (authToken) { await syncPendingAttempts(); render(); } });
    window.addEventListener("offline", () => { if (route !== "session") render(); });
    document.addEventListener("visibilitychange", async () => { if (document.visibilityState === "visible" && authToken && route !== "session") { await syncPendingAttempts(); render(); } });
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  } catch (error) {
    console.error(error);
    app.innerHTML = `<main class="onboard-form" style="min-height:100dvh"><div><p class="eyebrow">Unable to start</p><h1>Seomtorch needs a local web server.</h1><p class="lede">Open this project through localhost or a secure website so its question bank and offline storage can load correctly.</p><p><code>npx serve .</code></p></div></main>`;
  } finally {
    dismissAppLoader();
  }
}

init();


async function renderDailySprint() {
  const content = `<section class="page"><div class="session-ready"><p class="eyebrow">Daily Challenge</p><h1>5-Minute Sprint</h1><p class="lede">Loading your daily sprint questions...</p></div></section>`;
  app.innerHTML = shell(content); bindShell();
  showLoadingOverlay("Daily Sprint", "Loading your 5-minute sprint questions...");

  try {
    let sprintQuestions = [];
    let remoteId = null;
    try {
      const sprintPromise = api.dailySprint(authToken);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 6000));
      const remote = await Promise.race([sprintPromise, timeoutPromise]);
      remoteId = remote?.session_id || null;
      sprintQuestions = (remote?.questions || []).map(item => questionById(item.external_id)).filter(Boolean);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        dailySprintCompleted = true;
        localStorage.setItem("seomtorch-sprint-" + new Date().toISOString().slice(0, 10), "done");
        throw e;
      }
      // Offline fallback: pick 5 random questions across subjects
      const shuffled = [...questions].sort(() => 0.5 - Math.random());
      sprintQuestions = shuffled.slice(0, 5);
    }

    if (sprintQuestions.length > 0) {
      activeSession = { subject: 'sprint', topic: null, requestedCount: 5, durationMinutes: 5, deadline: Date.now() + 5 * 60000, started: true, finished: false, queue: sprintQuestions, sections: [{subject: 'sprint', name: 'Sprint', count: sprintQuestions.length, start: 0}], answers: sprintQuestions.map(() => ({ selected: null, confirmed: false, correct: false })), remoteId, index: 0, correct: 0, questionStartedAt: Date.now(), reportedComplete: false, timedOut: false, timeUpAcknowledged: false, mode: 'sprint' };
      route = "session"; render();
    } else {
      throw new Error("No questions available");
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      dailySprintCompleted = true;
      localStorage.setItem("seomtorch-sprint-" + new Date().toISOString().slice(0, 10), "done");
    }
    const message = err instanceof ApiError ? err.message : "Could not load the sprint. Check your connection and try again.";
    app.innerHTML = shell(`<section class="page page-narrow"><div class="session-ready"><p class="eyebrow">Daily challenge</p><h1>${dailySprintCompleted ? "Sprint already started." : "Sprint unavailable."}</h1><p class="lede">${escapeHtml(message)}</p><button class="button" data-route="home">Return home</button></div></section>`);
    bindShell();
  } finally {
    hideLoadingOverlay();
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
  const videoUrl = questionVideo(question);

  const content = `<section class="page normal-session-page">
    <div class="session-workspace">
      <div class="question-header">
        <div class="question-topline">
          <span>${subjectName(question.subject)} · ${escapeHtml(question.topic)}${question.questionYear ? ` · ${question.questionYear} source` : ""}</span>
          <div class="session-status"><span>${activeSession.index + 1} of ${activeSession.queue.length}</span></div>
        </div>
        <div class="question-progress"><i style="width:${confirmed / activeSession.queue.length * 100}%"></i></div>
      </div>

      <article class="question-paper normal-question-paper" style="${passage ? 'display:flex; flex-direction:column; gap:1rem;' : ''}">
        ${passage ? `<details class="passage-details"><summary>View reading passage</summary><div class="passage-content">${renderMath(escapeHtml(passage))}</div></details>` : ""}
        ${renderQuestionImage(question)}

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
            ${renderExplanation(question)}
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
  bindQuestionMedia();

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
