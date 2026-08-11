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
  { group: "Practice and review", q: "How are questions selected?", a: "Sessions prioritise questions you have not seen, topics where your accuracy is lower, and questions you previously missed. Recently answered questions receive less priority, which reduces unnecessary repetition." },
  { group: "Practice and review", q: "Which subjects are available?", a: "English Language and General Paper are the two main preparation areas. A smaller Mathematics bank remains available as an additional practice option." },
  { group: "Practice and review", q: "Can I practise one topic only?", a: "Yes. Open Practice, select English Language or General Paper, then choose a topic. You can also choose All topics for a mixed session." },
  { group: "Practice and review", q: "How do timed sessions work?", a: "Choose any question count from 10 to 100 and enter the number of minutes you want to study. One overall countdown runs across the complete session." },
  { group: "Practice and review", q: "Can I practise every subject together?", a: "Yes. Choose All subjects to build one balanced session. Questions are grouped into clear subject sections under one overall timer." },
  { group: "Practice and review", q: "What does Save for review do?", a: "It bookmarks the current question in your account, making the saved list available when you sign in on another device." },
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
      <header class="topbar"><span class="mobile-brand">Seomtorch</span><div class="top-stat"><strong>${attempts.length}</strong><span>answered</span></div><div class="top-stat"><strong>${accuracy()}%</strong><span>accuracy</span></div><div class="top-xp" title="Level ${xp.level} · ${xp.remaining} XP to next level"><small>LV ${xp.level}</small><strong>${xp.xp} XP</strong></div><div class="top-streak" title="${profile.rhythm || 0}-day streak"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.5c.5 3.2-.8 4.7-2.1 6.1-1.1 1.2-2.1 2.3-1.7 4.3-1.3-.7-2-2-1.9-3.7C5.3 11 4 13.5 4.3 16.1 4.7 19.6 7.6 22 11.2 22c4.8 0 8-3.1 8-7.7 0-4.1-2.5-8.3-6-11.8Z"/></svg><span><small>Streak</small><strong>${profile.rhythm || 0}</strong></span></div><button class="avatar" data-route="profile" title="Open ${escapeHtml(profile.name)}'s profile">${initials()}</button></header>
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
  document.querySelectorAll("[data-subject]").forEach(button => button.addEventListener("click", () => { route = "practice"; selectedSubject = button.dataset.subject; render(); }));
}

function topicAccuracy(subject, topic) {
  const list = attempts.filter(item => item.subject === subject && questionById(item.questionId)?.topic === topic);
  return list.length ? `${accuracy(list)}% accuracy · ${list.length} attempts` : "Not attempted yet";
}

function renderPractice() {
  if (!selectedSubject) {
    const content = `<section class="page"><p class="eyebrow">Practice</p><h1>Choose your focus.</h1><p class="lede">Build one timed session across every subject, or concentrate on a specific subject and topic.</p><div class="section-head"><h2>Practice mode</h2><p>Configure the details on the next step</p></div><div class="subject-list"><button class="subject-row all-subject-row" data-subject="all"><span class="subject-num">ALL</span><span><span class="subject-title">All subjects</span><span class="subject-meta">Balanced, grouped sections across English Language, General Paper and Mathematics</span></span><span class="mini-progress"><i style="width:${accuracy()}%"></i></span><span class="row-arrow">→</span></button>${SUBJECTS.map((subject, index) => `<button class="subject-row" data-subject="${subject.id}"><span class="subject-num">0${index + 1}</span><span><span class="subject-title">${subject.name}</span><span class="subject-meta">${subject.description}</span></span><span class="mini-progress"><i style="width:${subjectStats(subject.id).accuracy}%"></i></span><span class="row-arrow">→</span></button>`).join("")}</div></section>`;
    app.innerHTML = shell(content); bindShell();
    document.querySelectorAll("[data-subject]").forEach(button => button.addEventListener("click", () => { selectedSubject = button.dataset.subject; render(); }));
    return;
  }
  const allSubjects = selectedSubject === "all";
  const subject = allSubjects ? { name: "All subjects" } : SUBJECTS.find(item => item.id === selectedSubject);
  const topics = allSubjects ? [] : [...new Set(questions.filter(item => item.subject === selectedSubject).map(item => item.topic))];
  const content = `<section class="page"><button class="button outline" id="back-subjects">← Practice modes</button><div class="practice-heading"><p class="eyebrow">${subject.name}</p><h1>Build your session.</h1><p class="lede">Set exactly how many questions you want and how long you want to study.${allSubjects ? " Seomtorch will divide the questions into balanced subject sections." : " Then choose the topic you want to practise."}</p></div><section class="session-builder" aria-label="Session settings"><div class="session-input"><label for="question-count">Questions</label><div><input id="question-count" type="number" min="10" max="100" step="1" value="${selectedQuestionCount}" inputmode="numeric" required><span>10–100</span></div><small>Choose any whole number from 10 to 100.</small></div><div class="session-input"><label for="study-minutes">Study time</label><div><input id="study-minutes" type="number" min="1" max="600" step="1" value="${selectedStudyMinutes}" inputmode="numeric" required><span>minutes</span></div><small>Choose any whole number from 1 to 600 minutes.</small></div></section>${allSubjects ? `<section class="grouped-preview"><div class="section-head"><h2>Subject sections</h2><p>One timer for the complete session</p></div><div class="section-plan" id="section-plan"></div><button class="button start-session-button" id="start-all-session">Start grouped session →</button></section>` : `<div class="section-head"><h2>Choose a topic</h2><p>The timer begins when questions open</p></div><div class="topic-grid"><button class="topic-card" data-topic=""><strong>All topics</strong><span>Balanced mix · ${questions.filter(q => q.subject === selectedSubject).length} available</span></button>${topics.map(topic => `<button class="topic-card" data-topic="${escapeHtml(topic)}"><strong>${escapeHtml(topic)}</strong><span>${topicAccuracy(selectedSubject, topic)}</span></button>`).join("")}</div>`}</section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelector("#back-subjects").addEventListener("click", () => { selectedSubject = null; render(); });
  const questionInput = document.querySelector("#question-count");
  const timeInput = document.querySelector("#study-minutes");
  const persistConfiguration = () => { if (questionInput.validity.valid) selectedQuestionCount = Number(questionInput.value); if (timeInput.validity.valid) selectedStudyMinutes = Number(timeInput.value); if (allSubjects) renderSectionPlan(selectedQuestionCount); };
  questionInput.addEventListener("input", persistConfiguration); timeInput.addEventListener("input", persistConfiguration);
  if (allSubjects) renderSectionPlan(selectedQuestionCount);
  document.querySelector("#start-all-session")?.addEventListener("click", () => { const config = readSessionConfiguration(); if (config) startSession("all", null, config.count, config.minutes); });
  document.querySelectorAll("[data-topic]").forEach(button => button.addEventListener("click", () => { const config = readSessionConfiguration(); if (config) startSession(selectedSubject, button.dataset.topic || null, config.count, config.minutes); }));
}

function readSessionConfiguration() {
  const questionInput = document.querySelector("#question-count");
  const timeInput = document.querySelector("#study-minutes");
  if (!questionInput.reportValidity() || !timeInput.reportValidity()) return null;
  selectedQuestionCount = Number(questionInput.value); selectedStudyMinutes = Number(timeInput.value);
  return { count: selectedQuestionCount, minutes: selectedStudyMinutes };
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

async function startSession(subject, topic, count = 10, durationMinutes = 10) {
  let queue = subject === "all" ? weightedAllSubjects(count) : weightedQuestions(subject, topic, count); let remoteId = null;
  try {
    const remote = await api.startSession(authToken, { subject, topic: topic ? topicSlug(topic) : null, limit: count, duration_minutes: durationMinutes });
    remoteId = remote.session_id;
    const selected = remote.questions.map(item => questionById(item.external_id)).filter(Boolean);
    if (selected.length) queue = selected;
  } catch { showToast("Working offline. This session will sync when connected."); }
  if (queue.length < count) showToast(`${queue.length} questions are currently available in this selection.`);
  const sections = buildSessionSections(queue);
  activeSession = { subject, topic, requestedCount: count, durationMinutes, deadline: Date.now() + durationMinutes * 60000, queue, sections, showSectionIntro: subject === "all", remoteId, index: 0, correct: 0, answered: false, selected: null, questionStartedAt: Date.now(), reportedComplete: false, timedOut: false };
  route = "session"; render();
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function runSessionTimer() {
  clearInterval(sessionTimer);
  const update = () => {
    if (!activeSession || route !== "session") return clearInterval(sessionTimer);
    const remaining = Math.max(0, Math.ceil((activeSession.deadline - Date.now()) / 1000));
    const display = document.querySelector("#session-timer");
    if (display) {
      display.textContent = formatTime(remaining);
      display.closest(".session-clock")?.classList.toggle("urgent", remaining <= 60);
    }
    if (remaining === 0) {
      clearInterval(sessionTimer);
      activeSession.timedOut = true;
      activeSession.index = activeSession.queue.length;
      activeSession.answered = false;
      render();
    }
  };
  update();
  sessionTimer = setInterval(update, 1000);
}

function currentSection() {
  return activeSession?.sections.find(section => activeSession.index >= section.start && activeSession.index < section.start + section.count) || activeSession?.sections[0];
}

function renderSectionIntro() {
  const section = currentSection();
  const sectionIndex = activeSession.sections.indexOf(section);
  const content = `<section class="page page-narrow"><div class="section-intro"><p class="eyebrow">Section ${sectionIndex + 1} of ${activeSession.sections.length}</p><span class="section-kicker">Grouped practice</span><h1>${escapeHtml(section.name)}</h1><p class="lede">${section.count} questions are grouped in this section. Your overall session timer continues throughout.</p><div class="section-intro-meta"><span><small>Questions</small><strong>${section.count}</strong></span><span class="session-clock" role="timer" aria-label="Session time remaining"><small>Time left</small><strong id="session-timer">${formatTime(Math.ceil((activeSession.deadline - Date.now()) / 1000))}</strong></span></div><div class="section-track">${activeSession.sections.map((item, index) => `<i class="${index < sectionIndex ? "complete" : index === sectionIndex ? "active" : ""}" title="${escapeHtml(item.name)}"></i>`).join("")}</div><div class="button-row"><button class="button" id="begin-section">${sectionIndex ? "Continue to section" : "Begin session"} →</button><button class="button outline" id="exit-session">Exit session</button></div></div></section>`;
  app.innerHTML = shell(content); bindShell(); runSessionTimer();
  document.querySelector("#begin-section").addEventListener("click", () => { activeSession.showSectionIntro = false; activeSession.questionStartedAt = Date.now(); render(); });
  document.querySelector("#exit-session").addEventListener("click", () => { clearInterval(sessionTimer); activeSession = null; route = "practice"; render(); });
}

function renderSession() {
  if (!activeSession || activeSession.index >= activeSession.queue.length) return renderResult();
  if (activeSession.showSectionIntro) return renderSectionIntro();
  const question = activeSession.queue[activeSession.index];
  const section = currentSection();
  const sectionIndex = activeSession.sections.indexOf(section);
  const isBookmarked = bookmarks.some(item => item.questionId === question.id);
  const content = `<section class="page page-narrow">
    ${activeSession.sections.length > 1 ? `<div class="active-section"><span>Section ${sectionIndex + 1} of ${activeSession.sections.length}</span><strong>${escapeHtml(section.name)}</strong><small>${activeSession.index - section.start + 1} of ${section.count} in this section</small></div>` : ""}<div class="question-header"><div class="question-topline"><span>${subjectName(question.subject)} · ${escapeHtml(question.topic)}${question.questionYear ? ` · ${question.questionYear} source` : ""}</span><div class="session-status"><span>${activeSession.index + 1} of ${activeSession.queue.length}</span><span class="session-clock" role="timer" aria-label="Session time remaining"><small>Time left</small><strong id="session-timer">${formatTime(Math.ceil((activeSession.deadline - Date.now()) / 1000))}</strong></span></div></div><div class="question-progress"><i style="width:${(activeSession.index + (activeSession.answered ? 1 : 0)) / activeSession.queue.length * 100}%"></i></div></div>
    <article class="question-paper"><p class="eyebrow">Question ${String(activeSession.index + 1).padStart(2, "0")}</p><h2>${escapeHtml(question.text)}</h2><div class="options">${question.options.map((option, index) => { let state = ""; if (activeSession.answered && index === question.correct) state = "correct"; else if (activeSession.answered && index === activeSession.selected) state = "incorrect"; return `<button class="option ${state}" data-option="${index}" ${activeSession.answered ? "disabled" : ""}><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span></button>`; }).join("")}</div>
      ${activeSession.answered ? `<div class="feedback"><div class="feedback-head"><div class="feedback-label ${activeSession.selected === question.correct ? "" : "wrong"}">${activeSession.selected === question.correct ? "Correct" : "Review this"}</div>${activeSession.selected === question.correct ? '<span class="xp-earned">+5 XP</span>' : ""}</div><p>${escapeHtml(question.explanation)}</p></div>` : ""}
      <div class="question-actions"><button class="button outline" id="bookmark">${isBookmarked ? "Saved for review" : "Save for review"}</button>${activeSession.answered ? '<button class="button" id="next-question">Next question →</button>' : '<button class="button outline" id="exit-session">Exit session</button>'}</div>
    </article>
  </section>`;
  app.innerHTML = shell(content); bindShell();
  runSessionTimer();
  document.querySelectorAll("[data-option]").forEach(button => button.addEventListener("click", () => answerQuestion(Number(button.dataset.option))));
  document.querySelector("#bookmark").addEventListener("click", () => toggleBookmark(question.id));
  document.querySelector("#next-question")?.addEventListener("click", () => { const previousSubject = question.subject; activeSession.index++; activeSession.answered = false; activeSession.selected = null; activeSession.questionStartedAt = Date.now(); activeSession.showSectionIntro = activeSession.subject === "all" && activeSession.queue[activeSession.index]?.subject !== previousSubject; render(); });
  document.querySelector("#exit-session")?.addEventListener("click", () => { clearInterval(sessionTimer); activeSession = null; route = "practice"; render(); });
}

async function answerQuestion(selected) {
  if (activeSession.answered) return;
  const question = activeSession.queue[activeSession.index];
  const correct = selected === question.correct;
  activeSession.answered = true; activeSession.selected = selected; if (correct) activeSession.correct++;
  const attempt = { questionId: question.id, subject: question.subject, correct, selected, timestamp: Date.now(), durationMs: Date.now() - activeSession.questionStartedAt, clientId: crypto.randomUUID(), sessionId: activeSession.remoteId, synced: false };
  attempt.id = await add("attempts", attempt); attempts.push(attempt);
  profile.xp = (profile.xp || 0) + (correct ? 5 : 0);
  await put("profile", profile);
  await registerStudyDay();
  render();
  await syncAttemptRecord(attempt);
  if (route === "session" && activeSession?.queue[activeSession.index]?.id === question.id) render();
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
  syncPromise = (async () => {
    for (const attempt of attempts.filter(item => !item.synced && !item.syncError)) await syncAttemptRecord(attempt);
    const remote = await api.attempts(authToken);
    const unresolved = attempts.filter(item => !item.synced);
    const canonical = remote.attempts.map(item => ({ questionId: item.question_id, subject: item.subject, correct: item.is_correct, selected: item.selected_index, timestamp: new Date(item.answered_at).getTime(), durationMs: item.duration_ms, clientId: item.client_id, synced: true }));
    const known = new Set(canonical.map(item => item.clientId));
    await clearStore("attempts"); attempts = [];
    for (const item of [...canonical, ...unresolved.filter(item => !known.has(item.clientId))]) { const clean = { ...item }; delete clean.id; clean.id = await add("attempts", clean); attempts.push(clean); }
    applyRemoteStats(remote.stats); await put("profile", profile);

    const remoteBookmarks = await api.bookmarks(authToken);
    await clearStore("bookmarks"); bookmarks = [];
    for (const item of remoteBookmarks) { const bookmark = { questionId: item.question_id, savedAt: new Date(item.created_at).getTime() }; await put("bookmarks", bookmark); bookmarks.push(bookmark); }
  })().then(() => true).catch(() => false).finally(() => { syncPromise = null; });
  return syncPromise;
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
  clearInterval(sessionTimer);
  if (activeSession.remoteId && !activeSession.reportedComplete) { activeSession.reportedComplete = true; api.completeSession(authToken, activeSession.remoteId).catch(() => { activeSession.reportedComplete = false; }); }
  const score = activeSession.queue.length ? Math.round(activeSession.correct / activeSession.queue.length * 100) : 0;
  const note = activeSession.timedOut ? "Time is up. Review the result, then try a shorter session or return when you can give it a full window." : score >= 80 ? "A strong session. Keep the standard steady." : score >= 50 ? "Good work. Review the corrections before moving on." : "This topic needs another careful pass. That is useful information.";
  const content = `<section class="page page-narrow"><div class="session-result"><p class="eyebrow">${activeSession.timedOut ? "Time expired" : "Session complete"}</p><div class="result-score">${score}%</div><h2>${activeSession.correct} of ${activeSession.queue.length} correct</h2><p class="lede" style="margin-inline:auto">${note}</p><div class="result-meta"><span>${activeSession.queue.length} questions in session</span><span>${activeSession.durationMinutes} minute timer</span></div><div class="button-row" style="justify-content:center;margin-top:28px"><button class="button outline" id="return-practice">Choose another topic</button><button class="button" id="retry-session">Practise this again</button></div></div></section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelector("#return-practice").addEventListener("click", () => { activeSession = null; route = "practice"; render(); });
  document.querySelector("#retry-session").addEventListener("click", () => startSession(activeSession.subject, activeSession.topic, activeSession.requestedCount, activeSession.durationMinutes));
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
    for (const bookmark of data.bookmarks || []) await put("bookmarks", bookmark);
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
    await clearStore("profile"); await clearStore("attempts"); await clearStore("bookmarks"); attempts = []; bookmarks = [];
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
  try { await api.logout(authToken); } catch {}
  await clearStore("profile"); await clearStore("attempts"); await clearStore("bookmarks");
  authToken = null; currentUser = null; profile = null; attempts = []; bookmarks = []; localStorage.removeItem("seomtorch-auth-token"); localStorage.removeItem("seomtorch-auth-user"); renderAuth();
}

function render() {
  if (!authToken || !currentUser || !profile) return renderAuth();
  if (route === "home") return renderHome();
  if (route === "practice") return renderPractice();
  if (route === "session") return renderSession();
  if (route === "progress") return renderProgress();
  if (route === "profile") return renderProfile();
}

async function init() {
  try {
    db = await openDatabase();
    await Promise.all([loadQuestions(), loadData()]);
    const authenticated = await restoreAuth();
    if (authenticated) await syncPendingAttempts();
    render();
    window.addEventListener("online", async () => { if (authToken) { await syncPendingAttempts(); render(); } });
    document.addEventListener("visibilitychange", async () => { if (document.visibilityState === "visible" && authToken && route !== "session") { await syncPendingAttempts(); render(); } });
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  } catch (error) {
    console.error(error);
    app.innerHTML = `<main class="onboard-form" style="min-height:100dvh"><div><p class="eyebrow">Unable to start</p><h1>Seomtorch needs a local web server.</h1><p class="lede">Open this project through localhost or a secure website so its question bank and offline storage can load correctly.</p><p><code>npx serve .</code></p></div></main>`;
  }
}

init();
