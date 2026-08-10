import { api, ApiError } from "./api-client.js";

const SUBJECTS = [
  { id: "english", name: "English Language", description: "Usage, comprehension and oral forms" },
  { id: "general-paper", name: "General Paper", description: "Civics, current affairs and general knowledge" },
  { id: "mathematics", name: "Mathematics", description: "Numbers, algebra and applied reasoning" },
];

const FAQS = [
  { group: "Getting started", q: "What is Seomtorch designed for?", a: "Seomtorch is a personal study companion for structured JAMB, WAEC, NECO and Post-UTME preparation. It helps you practise by topic, learn from corrections and see where your next study session will matter most." },
  { group: "Getting started", q: "Do I need an account or internet connection?", a: "An account is required so your progress can be monitored and restored across devices. After signing in once, practice can continue offline and pending answers synchronize when the connection returns." },
  { group: "Practice and review", q: "How are questions selected?", a: "Sessions prioritise questions you have not seen, topics where your accuracy is lower, and questions you previously missed. Recently answered questions receive less priority, which reduces unnecessary repetition." },
  { group: "Practice and review", q: "Which subjects are available?", a: "English Language and General Paper are the two main preparation areas. A smaller Mathematics bank remains available as an additional practice option." },
  { group: "Practice and review", q: "Can I practise one topic only?", a: "Yes. Open Practice, select English Language or General Paper, then choose a topic. You can also choose All topics for a mixed session." },
  { group: "Practice and review", q: "What does Save for review do?", a: "It bookmarks the current question locally. Bookmarked-question practice is planned for a later release; your saved list is already included when you export your data." },
  { group: "Progress and scoring", q: "How is my streak calculated?", a: "A study day counts when you answer at least one question. Consecutive active days build your streak. Missing a day resets the current streak, but your best streak remains recorded." },
  { group: "Progress and scoring", q: "How do XP and levels work?", a: "You earn 5 XP for each correct answer. Incorrect answers do not award XP. Every 250 XP advances your level, while accuracy shows how well you understand the material." },
  { group: "Progress and scoring", q: "What is a focus area?", a: "A focus area is a topic with enough attempts to measure and an accuracy rate that needs attention. It is guidance for your next session, not a judgement of your ability." },
  { group: "Progress and scoring", q: "Are these scores official exam predictions?", a: "No. Your dashboard reflects only your activity in Seomtorch. Use it to guide revision, not as an official predicted examination score." },
  { group: "Data and offline use", q: "Where is my progress stored?", a: "Progress is stored securely in your Seomtorch account and cached in IndexedDB on this device for offline use. Pending offline activity synchronizes when the server is reachable." },
  { group: "Data and offline use", q: "How do I protect my progress?", a: "Use Export data in this Guide to download a backup. Keep that file somewhere safe. You can restore it later with Import data." },
  { group: "Data and offline use", q: "What happens if I clear browser data?", a: "Clearing this site’s storage can remove your profile and results. Export a backup first if you plan to clear browser data or change devices." },
];

const ICONS = {
  home: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V20H4Z"/><path d="M9 20v-6h6v6"/></svg>',
  practice: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M6 3.5h9l3 3V20.5H6Z"/><path d="M15 3.5v4h4M9 12h6M9 16h6"/></svg>',
  progress: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  guide: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23Z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23Z"/></svg>',
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
let activeSession = null;
let authMode = "signin";

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
const put = (name, value) => storeAction(name, "readwrite", store => store.put(value));
const add = (name, value) => storeAction(name, "readwrite", store => store.add(value));
const clearStore = name => storeAction(name, "readwrite", store => store.clear());

async function loadQuestions() {
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

function navigate(nextRoute) {
  route = nextRoute;
  if (nextRoute !== "practice") selectedSubject = null;
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function shell(content) {
  const xp = xpState();
  const nav = [
    ["home", "Home"], ["practice", "Practice"], ["progress", "Progress"], ["guide", "Guide"]
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
      <header class="topbar"><span class="mobile-brand">Seomtorch</span><div class="top-stat"><strong>${attempts.length}</strong><span>answered</span></div><div class="top-stat"><strong>${accuracy()}%</strong><span>accuracy</span></div><div class="top-xp" title="Level ${xp.level} · ${xp.remaining} XP to next level"><small>LV ${xp.level}</small><strong>${xp.xp} XP</strong></div><div class="top-streak" title="${profile.rhythm || 0}-day streak"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.5c.5 3.2-.8 4.7-2.1 6.1-1.1 1.2-2.1 2.3-1.7 4.3-1.3-.7-2-2-1.9-3.7C5.3 11 4 13.5 4.3 16.1 4.7 19.6 7.6 22 11.2 22c4.8 0 8-3.1 8-7.7 0-4.1-2.5-8.3-6-11.8Z"/></svg><span><small>Streak</small><strong>${profile.rhythm || 0}</strong></span></div><div class="avatar" title="${escapeHtml(profile.name)}">${initials()}</div></header>
      <main id="main">${content}</main>
    </div>
  </div>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function bindShell() {
  document.querySelectorAll("[data-route]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.route)));
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
    <div class="section-head"><h2>Today, at a glance</h2><p>Updated from this device</p></div>
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
  document.querySelectorAll("[data-subject]").forEach(button => button.addEventListener("click", () => { route = "practice"; selectedSubject = button.dataset.subject; render(); }));
}

function topicAccuracy(subject, topic) {
  const list = attempts.filter(item => item.subject === subject && questionById(item.questionId)?.topic === topic);
  return list.length ? `${accuracy(list)}% accuracy · ${list.length} attempts` : "Not attempted yet";
}

function renderPractice() {
  if (!selectedSubject) {
    const content = `<section class="page"><p class="eyebrow">Practice</p><h1>Choose your focus.</h1><p class="lede">Work through a ten-question session. Selection adapts to your history while keeping the mix varied.</p><div class="section-head"><h2>Available subjects</h2><p>Select one to view topics</p></div><div class="subject-list">${SUBJECTS.map((subject, index) => `<button class="subject-row" data-subject="${subject.id}"><span class="subject-num">0${index + 1}</span><span><span class="subject-title">${subject.name}</span><span class="subject-meta">${subject.description}</span></span><span class="mini-progress"><i style="width:${subjectStats(subject.id).accuracy}%"></i></span><span class="row-arrow">→</span></button>`).join("")}</div></section>`;
    app.innerHTML = shell(content); bindShell();
    document.querySelectorAll("[data-subject]").forEach(button => button.addEventListener("click", () => { selectedSubject = button.dataset.subject; render(); }));
    return;
  }
  const subject = SUBJECTS.find(item => item.id === selectedSubject);
  const topics = [...new Set(questions.filter(item => item.subject === selectedSubject).map(item => item.topic))];
  const content = `<section class="page"><button class="button outline" id="back-subjects">← All subjects</button><div style="margin-top:35px"><p class="eyebrow">${subject.name}</p><h1>Select a topic.</h1><p class="lede">Choose a focused area or let Seomtorch build a balanced session across the subject.</p></div><div class="topic-grid" style="margin-top:35px"><button class="topic-card" data-topic=""><strong>All topics</strong><span>Balanced mix · ${questions.filter(q => q.subject === selectedSubject).length} available</span></button>${topics.map(topic => `<button class="topic-card" data-topic="${escapeHtml(topic)}"><strong>${escapeHtml(topic)}</strong><span>${topicAccuracy(selectedSubject, topic)}</span></button>`).join("")}</div></section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelector("#back-subjects").addEventListener("click", () => { selectedSubject = null; render(); });
  document.querySelectorAll("[data-topic]").forEach(button => button.addEventListener("click", () => startSession(selectedSubject, button.dataset.topic || null)));
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

function topicSlug(value) { return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

async function startSession(subject, topic) {
  let queue = weightedQuestions(subject, topic); let remoteId = null;
  try {
    const remote = await api.startSession(authToken, { subject, topic: topic ? topicSlug(topic) : null, limit: 10 });
    remoteId = remote.session_id;
    const selected = remote.questions.map(item => questionById(item.external_id)).filter(Boolean);
    if (selected.length) queue = selected;
  } catch { showToast("Working offline. This session will sync when connected."); }
  activeSession = { subject, topic, queue, remoteId, index: 0, correct: 0, answered: false, selected: null, reportedComplete: false };
  route = "session"; render();
}

function renderSession() {
  if (!activeSession || activeSession.index >= activeSession.queue.length) return renderResult();
  const question = activeSession.queue[activeSession.index];
  const isBookmarked = bookmarks.some(item => item.questionId === question.id);
  const content = `<section class="page page-narrow">
    <div class="question-header"><div class="question-topline"><span>${subjectName(question.subject)} · ${escapeHtml(question.topic)}${question.questionYear ? ` · ${question.questionYear} source` : ""}</span><span>${activeSession.index + 1} of ${activeSession.queue.length}</span></div><div class="question-progress"><i style="width:${(activeSession.index + (activeSession.answered ? 1 : 0)) / activeSession.queue.length * 100}%"></i></div></div>
    <article class="question-paper"><p class="eyebrow">Question ${String(activeSession.index + 1).padStart(2, "0")}</p><h2>${escapeHtml(question.text)}</h2><div class="options">${question.options.map((option, index) => { let state = ""; if (activeSession.answered && index === question.correct) state = "correct"; else if (activeSession.answered && index === activeSession.selected) state = "incorrect"; return `<button class="option ${state}" data-option="${index}" ${activeSession.answered ? "disabled" : ""}><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span></button>`; }).join("")}</div>
      ${activeSession.answered ? `<div class="feedback"><div class="feedback-head"><div class="feedback-label ${activeSession.selected === question.correct ? "" : "wrong"}">${activeSession.selected === question.correct ? "Correct" : "Review this"}</div>${activeSession.selected === question.correct ? '<span class="xp-earned">+5 XP</span>' : ""}</div><p>${escapeHtml(question.explanation)}</p></div>` : ""}
      <div class="question-actions"><button class="button outline" id="bookmark">${isBookmarked ? "Saved for review" : "Save for review"}</button>${activeSession.answered ? '<button class="button" id="next-question">Next question →</button>' : '<button class="button outline" id="exit-session">Exit session</button>'}</div>
    </article>
  </section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelectorAll("[data-option]").forEach(button => button.addEventListener("click", () => answerQuestion(Number(button.dataset.option))));
  document.querySelector("#bookmark").addEventListener("click", () => toggleBookmark(question.id));
  document.querySelector("#next-question")?.addEventListener("click", () => { activeSession.index++; activeSession.answered = false; activeSession.selected = null; render(); });
  document.querySelector("#exit-session")?.addEventListener("click", () => { activeSession = null; route = "practice"; render(); });
}

async function answerQuestion(selected) {
  if (activeSession.answered) return;
  const question = activeSession.queue[activeSession.index];
  const correct = selected === question.correct;
  activeSession.answered = true; activeSession.selected = selected; if (correct) activeSession.correct++;
  const attempt = { questionId: question.id, subject: question.subject, correct, selected, timestamp: Date.now(), clientId: crypto.randomUUID(), sessionId: activeSession.remoteId, synced: false };
  attempt.id = await add("attempts", attempt); attempts.push(attempt);
  profile.xp = (profile.xp || 0) + (correct ? 5 : 0);
  await put("profile", profile);
  await registerStudyDay();
  syncAttemptRecord(attempt);
  render();
}

async function syncAttemptRecord(attempt) {
  if (!authToken || attempt.synced) return;
  if (!attempt.clientId) attempt.clientId = crypto.randomUUID();
  try {
    const response = await api.syncAttempt(authToken, { question_id: attempt.questionId, selected_index: attempt.selected, client_id: attempt.clientId, session_id: attempt.sessionId || null });
    attempt.synced = true; attempt.correct = response.correct; await put("attempts", attempt);
    const stats = response.stats; profile.xp = stats.xp; profile.rhythm = stats.current_streak; profile.bestRhythm = stats.best_streak; await put("profile", profile);
  } catch (error) { if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401) { attempt.syncError = error.message; await put("attempts", attempt); } }
}

async function syncPendingAttempts() {
  for (const attempt of attempts.filter(item => !item.synced)) await syncAttemptRecord(attempt);
  try {
    const remote = await api.attempts(authToken);
    const known = new Set(attempts.map(item => item.clientId).filter(Boolean));
    for (const item of remote.attempts) {
      if (known.has(item.client_id)) continue;
      const local = { questionId: item.question_id, subject: item.subject, correct: item.is_correct, selected: item.selected_index, timestamp: new Date(item.answered_at).getTime(), clientId: item.client_id, synced: true };
      local.id = await add("attempts", local); attempts.push(local); known.add(item.client_id);
    }
    profile.xp = remote.stats.xp; profile.rhythm = remote.stats.current_streak; profile.bestRhythm = remote.stats.best_streak; await put("profile", profile);
    const remoteBookmarks = await api.bookmarks(authToken);
    for (const item of remoteBookmarks) if (!bookmarks.some(bookmark => bookmark.questionId === item.question_id)) { const bookmark = { questionId: item.question_id, savedAt: new Date(item.created_at).getTime() }; await put("bookmarks", bookmark); bookmarks.push(bookmark); }
  } catch {}
}

async function registerStudyDay() {
  const current = today();
  if (profile.lastStudyDate === current) return;
  profile.rhythm = profile.lastStudyDate === yesterday() ? (profile.rhythm || 0) + 1 : 1;
  profile.bestRhythm = Math.max(profile.bestRhythm || 0, profile.rhythm);
  profile.lastStudyDate = current;
  await put("profile", profile);
}

async function toggleBookmark(questionId) {
  const existing = bookmarks.find(item => item.questionId === questionId);
  if (existing) {
    await storeAction("bookmarks", "readwrite", store => store.delete(questionId));
    bookmarks = bookmarks.filter(item => item.questionId !== questionId); showToast("Removed from review list");
    api.removeBookmark(authToken, questionId).catch(() => {});
  } else {
    const item = { questionId, savedAt: Date.now() }; await put("bookmarks", item); bookmarks.push(item); showToast("Saved for later review");
    api.addBookmark(authToken, questionId).catch(() => {});
  }
  render();
}

function renderResult() {
  if (activeSession.remoteId && !activeSession.reportedComplete) { activeSession.reportedComplete = true; api.completeSession(authToken, activeSession.remoteId).catch(() => { activeSession.reportedComplete = false; }); }
  const score = activeSession.queue.length ? Math.round(activeSession.correct / activeSession.queue.length * 100) : 0;
  const note = score >= 80 ? "A strong session. Keep the standard steady." : score >= 50 ? "Good work. Review the corrections before moving on." : "This topic needs another careful pass. That is useful information.";
  const content = `<section class="page page-narrow"><div class="session-result"><p class="eyebrow">Session complete</p><div class="result-score">${score}%</div><h2>${activeSession.correct} of ${activeSession.queue.length} correct</h2><p class="lede" style="margin-inline:auto">${note}</p><div class="button-row" style="justify-content:center;margin-top:28px"><button class="button outline" id="return-practice">Choose another topic</button><button class="button" id="retry-session">Practise this again</button></div></div></section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelector("#return-practice").addEventListener("click", () => { activeSession = null; route = "practice"; render(); });
  document.querySelector("#retry-session").addEventListener("click", () => startSession(activeSession.subject, activeSession.topic));
}

function renderProgress() {
  const xp = xpState();
  const topicMap = new Map();
  for (const attempt of attempts) {
    const question = questionById(attempt.questionId); if (!question) continue;
    const key = `${question.subject}|${question.topic}`; const item = topicMap.get(key) || { subject: question.subject, topic: question.topic, list: [] }; item.list.push(attempt); topicMap.set(key, item);
  }
  const focus = [...topicMap.values()].filter(item => item.list.length >= 2).map(item => ({ ...item, accuracy: accuracy(item.list) })).sort((a, b) => a.accuracy - b.accuracy).slice(0, 4);
  const content = `<section class="page"><p class="eyebrow">Progress</p><h1>Your work, made useful.</h1><p class="lede">Results are organised to help you decide what to study next—not to decorate a dashboard.</p><div class="metric-strip four" style="margin-top:38px"><div class="metric"><strong>${attempts.length}</strong><span>total attempts</span></div><div class="metric"><strong>${accuracy()}%</strong><span>overall accuracy</span></div><div class="metric xp-metric"><strong>${xp.xp}<small> XP</small></strong><span>Level ${xp.level}</span></div><div class="metric streak-metric"><strong>${profile.bestRhythm || 0}<small> days</small></strong><span>best streak</span></div></div><div class="section-head"><h2>Academic report</h2><p>Based on local practice history</p></div><div class="report-grid"><div class="report-panel"><h3>Subject performance</h3>${SUBJECTS.map(subject => { const stat = subjectStats(subject.id); return `<div class="report-row"><span>${subject.name}<small>${stat.count} attempts</small></span><strong>${stat.count ? `${stat.accuracy}%` : "—"}</strong></div>`; }).join("")}</div><div class="report-panel"><h3>Topics needing attention</h3>${focus.length ? focus.map(item => `<div class="report-row"><span>${escapeHtml(item.topic)}<small>${subjectName(item.subject)} · ${item.list.length} attempts</small></span><strong class="${item.accuracy < 50 ? "attention" : ""}">${item.accuracy}%</strong></div>`).join("") : '<div class="empty">Complete at least two questions in a topic and Seomtorch will begin identifying useful focus areas.</div>'}</div></div></section>`;
  app.innerHTML = shell(content); bindShell();
}

function renderGuide(filter = "") {
  const normalized = filter.trim().toLowerCase();
  const matches = FAQS.filter(item => !normalized || `${item.q} ${item.a} ${item.group}`.toLowerCase().includes(normalized));
  const groups = [...new Set(matches.map(item => item.group))];
  const content = `<section class="page page-narrow"><p class="eyebrow">Guide</p><h1>Answers, without the noise.</h1><p class="lede">Find help with practice, progress and keeping your study records safe.</p><div class="search-wrap"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg><input type="search" id="faq-search" value="${escapeHtml(filter)}" placeholder="Search the guide" aria-label="Search the guide"></div><div id="faq-results">${groups.length ? groups.map(group => `<section class="faq-group"><h2>${group}</h2>${matches.filter(item => item.group === group).map(item => `<div class="faq-item"><button class="faq-question" aria-expanded="false"><span>${item.q}</span><span aria-hidden="true">+</span></button><div class="faq-answer">${item.a}</div></div>`).join("")}</section>`).join("") : '<div class="empty">No guide entries match that search.</div>'}</div><section class="settings-panel account-summary"><p class="eyebrow">Signed-in account</p><h2>${escapeHtml(currentUser?.username || profile.name)}</h2><p class="lede">Student ID <strong>${escapeHtml(currentUser?.public_id || "—")}</strong> · ${escapeHtml(currentUser?.email || "")}</p><div class="button-row"><button class="button outline" id="sign-out">Sign out</button></div></section><section class="settings-panel"><p class="eyebrow">Your local data</p><h2>Backup and restore</h2><p class="lede">Progress synchronizes to your account when online. Export is also available as a personal backup.</p><div class="button-row"><button class="button" id="export-data">Export data</button><label class="button outline" for="import-data">Import data</label><input class="file-input" id="import-data" type="file" accept="application/json"><button class="button danger" id="reset-data">Reset local progress</button></div></section></section>`;
  app.innerHTML = shell(content); bindShell(); bindGuide();
}

function bindGuide() {
  document.querySelectorAll(".faq-question").forEach(button => button.addEventListener("click", () => { const item = button.closest(".faq-item"); item.classList.toggle("open"); button.setAttribute("aria-expanded", item.classList.contains("open")); }));
  let timer; document.querySelector("#faq-search").addEventListener("input", event => { clearTimeout(timer); timer = setTimeout(() => renderGuide(event.target.value), 180); });
  document.querySelector("#export-data").addEventListener("click", exportData);
  document.querySelector("#import-data").addEventListener("change", event => importData(event.target.files[0]));
  document.querySelector("#reset-data").addEventListener("click", resetData);
  document.querySelector("#sign-out").addEventListener("click", signOut);
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
    await clearStore("profile"); await clearStore("attempts"); await clearStore("bookmarks");
    await put("profile", data.profile);
    for (const attempt of data.attempts) { const clean = { ...attempt }; delete clean.id; await add("attempts", clean); }
    for (const bookmark of data.bookmarks || []) await put("bookmarks", bookmark);
    await loadData(); await syncPendingAttempts(); showToast("Backup restored"); renderGuide();
  } catch { showToast("That file is not a valid Seomtorch backup"); }
}

async function resetData() {
  if (!confirm("Reset all practice history and bookmarks on this device? Your name will be kept.")) return;
  await clearStore("attempts"); await clearStore("bookmarks");
  profile.rhythm = 0; profile.bestRhythm = 0; profile.lastStudyDate = null; profile.xp = 0; await put("profile", profile);
  attempts = []; bookmarks = []; showToast("Progress reset"); renderGuide();
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
  if (profile?.remoteId && profile.remoteId !== user.public_id) {
    await clearStore("profile"); await clearStore("attempts"); await clearStore("bookmarks"); attempts = []; bookmarks = [];
  }
  const stats = user.stats || {};
  profile = { id: "local-user", remoteId: user.public_id, name: user.username, email: user.email, xp: stats.xp ?? profile?.xp ?? 0, rhythm: stats.current_streak ?? profile?.rhythm ?? 0, bestRhythm: stats.best_streak ?? profile?.bestRhythm ?? 0, lastStudyDate: profile?.lastStudyDate || null, createdAt: profile?.createdAt || Date.now() };
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
  try { await api.logout(authToken); } catch {}
  authToken = null; currentUser = null; profile = null; attempts = []; bookmarks = []; localStorage.removeItem("seomtorch-auth-token"); localStorage.removeItem("seomtorch-auth-user"); renderAuth();
}

function render() {
  if (!authToken || !currentUser || !profile) return renderAuth();
  if (route === "home") return renderHome();
  if (route === "practice") return renderPractice();
  if (route === "session") return renderSession();
  if (route === "progress") return renderProgress();
  if (route === "guide") return renderGuide();
}

async function init() {
  try {
    db = await openDatabase();
    await Promise.all([loadQuestions(), loadData()]);
    const authenticated = await restoreAuth();
    if (authenticated) await syncPendingAttempts();
    render();
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  } catch (error) {
    console.error(error);
    app.innerHTML = `<main class="onboard-form" style="min-height:100dvh"><div><p class="eyebrow">Unable to start</p><h1>Seomtorch needs a local web server.</h1><p class="lede">Open this project through localhost or a secure website so its question bank and offline storage can load correctly.</p><p><code>npx serve .</code></p></div></main>`;
  }
}

init();
