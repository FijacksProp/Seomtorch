const SUBJECTS = [
  { id: "mathematics", name: "Mathematics", description: "Numbers, algebra and applied reasoning" },
  { id: "biology", name: "Biology", description: "Living systems and the natural world" },
  { id: "english", name: "English Language", description: "Usage, comprehension and oral forms" },
];

const FAQS = [
  { group: "Getting started", q: "What is Seomtorch designed for?", a: "Seomtorch is a personal study companion for structured JAMB, WAEC, NECO and Post-UTME preparation. It helps you practise by topic, learn from corrections and see where your next study session will matter most." },
  { group: "Getting started", q: "Do I need an account or internet connection?", a: "No account is required. After the first successful load, the installable app can work offline. Your profile and practice records are kept in this browser on this device." },
  { group: "Practice and review", q: "How are questions selected?", a: "Sessions prioritise questions you have not seen, topics where your accuracy is lower, and questions you previously missed. Recently answered questions receive less priority, which reduces unnecessary repetition." },
  { group: "Practice and review", q: "Can I practise one topic only?", a: "Yes. Open Practice, select a subject, then choose a topic. You can also choose All topics for a mixed session." },
  { group: "Practice and review", q: "What does Save for review do?", a: "It bookmarks the current question locally. Bookmarked-question practice is planned for a later release; your saved list is already included when you export your data." },
  { group: "Progress and scoring", q: "How is my study rhythm calculated?", a: "A study day counts when you answer at least one question. Consecutive active days build your rhythm. Missing a day resets the current rhythm, but your best rhythm remains recorded." },
  { group: "Progress and scoring", q: "What is a focus area?", a: "A focus area is a topic with enough attempts to measure and an accuracy rate that needs attention. It is guidance for your next session, not a judgement of your ability." },
  { group: "Progress and scoring", q: "Are these scores official exam predictions?", a: "No. Your dashboard reflects only your activity in Seomtorch. Use it to guide revision, not as an official predicted examination score." },
  { group: "Data and offline use", q: "Where is my progress stored?", a: "It is stored in IndexedDB, a database built into your browser. Seomtorch has no access to progress stored on another device or browser." },
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
const DB_VERSION = 1;
const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

let db;
let questions = [];
let profile = null;
let attempts = [];
let bookmarks = [];
let route = "home";
let selectedSubject = null;
let activeSession = null;

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
      <div class="sidebar-foot"><div class="rhythm"><strong>${profile.rhythm || 0}</strong><span>day study rhythm</span></div><p>Consistency is built one useful session at a time.</p></div>
    </aside>
    <div class="content-wrap">
      <header class="topbar"><span class="mobile-brand">Seomtorch</span><div class="top-stat"><strong>${attempts.length}</strong><span>answered</span></div><div class="top-stat"><strong>${accuracy()}%</strong><span>accuracy</span></div><div class="avatar" title="${escapeHtml(profile.name)}">${initials()}</div></header>
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
      <div class="metric"><strong>${profile.rhythm || 0}</strong><span>day rhythm</span></div>
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

function startSession(subject, topic) {
  activeSession = { subject, topic, queue: weightedQuestions(subject, topic), index: 0, correct: 0, answered: false, selected: null };
  route = "session"; render();
}

function renderSession() {
  if (!activeSession || activeSession.index >= activeSession.queue.length) return renderResult();
  const question = activeSession.queue[activeSession.index];
  const isBookmarked = bookmarks.some(item => item.questionId === question.id);
  const content = `<section class="page page-narrow">
    <div class="question-header"><div class="question-topline"><span>${subjectName(question.subject)} · ${escapeHtml(question.topic)}</span><span>${activeSession.index + 1} of ${activeSession.queue.length}</span></div><div class="question-progress"><i style="width:${(activeSession.index + (activeSession.answered ? 1 : 0)) / activeSession.queue.length * 100}%"></i></div></div>
    <article class="question-paper"><p class="eyebrow">Question ${String(activeSession.index + 1).padStart(2, "0")}</p><h2>${escapeHtml(question.text)}</h2><div class="options">${question.options.map((option, index) => { let state = ""; if (activeSession.answered && index === question.correct) state = "correct"; else if (activeSession.answered && index === activeSession.selected) state = "incorrect"; return `<button class="option ${state}" data-option="${index}" ${activeSession.answered ? "disabled" : ""}><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span></button>`; }).join("")}</div>
      ${activeSession.answered ? `<div class="feedback"><div class="feedback-label ${activeSession.selected === question.correct ? "" : "wrong"}">${activeSession.selected === question.correct ? "Correct" : "Review this"}</div><p>${escapeHtml(question.explanation)}</p></div>` : ""}
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
  const attempt = { questionId: question.id, subject: question.subject, correct, selected, timestamp: Date.now() };
  attempt.id = await add("attempts", attempt); attempts.push(attempt);
  await registerStudyDay();
  render();
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
  } else {
    const item = { questionId, savedAt: Date.now() }; await put("bookmarks", item); bookmarks.push(item); showToast("Saved for later review");
  }
  render();
}

function renderResult() {
  const score = activeSession.queue.length ? Math.round(activeSession.correct / activeSession.queue.length * 100) : 0;
  const note = score >= 80 ? "A strong session. Keep the standard steady." : score >= 50 ? "Good work. Review the corrections before moving on." : "This topic needs another careful pass. That is useful information.";
  const content = `<section class="page page-narrow"><div class="session-result"><p class="eyebrow">Session complete</p><div class="result-score">${score}%</div><h2>${activeSession.correct} of ${activeSession.queue.length} correct</h2><p class="lede" style="margin-inline:auto">${note}</p><div class="button-row" style="justify-content:center;margin-top:28px"><button class="button outline" id="return-practice">Choose another topic</button><button class="button" id="retry-session">Practise this again</button></div></div></section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelector("#return-practice").addEventListener("click", () => { activeSession = null; route = "practice"; render(); });
  document.querySelector("#retry-session").addEventListener("click", () => startSession(activeSession.subject, activeSession.topic));
}

function renderProgress() {
  const topicMap = new Map();
  for (const attempt of attempts) {
    const question = questionById(attempt.questionId); if (!question) continue;
    const key = `${question.subject}|${question.topic}`; const item = topicMap.get(key) || { subject: question.subject, topic: question.topic, list: [] }; item.list.push(attempt); topicMap.set(key, item);
  }
  const focus = [...topicMap.values()].filter(item => item.list.length >= 2).map(item => ({ ...item, accuracy: accuracy(item.list) })).sort((a, b) => a.accuracy - b.accuracy).slice(0, 4);
  const content = `<section class="page"><p class="eyebrow">Progress</p><h1>Your work, made useful.</h1><p class="lede">Results are organised to help you decide what to study next—not to decorate a dashboard.</p><div class="metric-strip" style="margin-top:38px"><div class="metric"><strong>${attempts.length}</strong><span>total attempts</span></div><div class="metric"><strong>${accuracy()}%</strong><span>overall accuracy</span></div><div class="metric"><strong>${profile.bestRhythm || 0}</strong><span>best rhythm</span></div></div><div class="section-head"><h2>Academic report</h2><p>Based on local practice history</p></div><div class="report-grid"><div class="report-panel"><h3>Subject performance</h3>${SUBJECTS.map(subject => { const stat = subjectStats(subject.id); return `<div class="report-row"><span>${subject.name}<small>${stat.count} attempts</small></span><strong>${stat.count ? `${stat.accuracy}%` : "—"}</strong></div>`; }).join("")}</div><div class="report-panel"><h3>Topics needing attention</h3>${focus.length ? focus.map(item => `<div class="report-row"><span>${escapeHtml(item.topic)}<small>${subjectName(item.subject)} · ${item.list.length} attempts</small></span><strong class="${item.accuracy < 50 ? "attention" : ""}">${item.accuracy}%</strong></div>`).join("") : '<div class="empty">Complete at least two questions in a topic and Seomtorch will begin identifying useful focus areas.</div>'}</div></div></section>`;
  app.innerHTML = shell(content); bindShell();
}

function renderGuide(filter = "") {
  const normalized = filter.trim().toLowerCase();
  const matches = FAQS.filter(item => !normalized || `${item.q} ${item.a} ${item.group}`.toLowerCase().includes(normalized));
  const groups = [...new Set(matches.map(item => item.group))];
  const content = `<section class="page page-narrow"><p class="eyebrow">Guide</p><h1>Answers, without the noise.</h1><p class="lede">Find help with practice, progress and keeping your study records safe.</p><div class="search-wrap"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg><input type="search" id="faq-search" value="${escapeHtml(filter)}" placeholder="Search the guide" aria-label="Search the guide"></div><div id="faq-results">${groups.length ? groups.map(group => `<section class="faq-group"><h2>${group}</h2>${matches.filter(item => item.group === group).map(item => `<div class="faq-item"><button class="faq-question" aria-expanded="false"><span>${item.q}</span><span aria-hidden="true">+</span></button><div class="faq-answer">${item.a}</div></div>`).join("")}</section>`).join("") : '<div class="empty">No guide entries match that search.</div>'}</div><section class="settings-panel"><p class="eyebrow">Your local data</p><h2>Backup and restore</h2><p class="lede">Your progress belongs to this browser. Export a backup before clearing site data or moving to another device.</p><div class="button-row"><button class="button" id="export-data">Export data</button><label class="button outline" for="import-data">Import data</label><input class="file-input" id="import-data" type="file" accept="application/json"><button class="button danger" id="reset-data">Reset progress</button></div></section></section>`;
  app.innerHTML = shell(content); bindShell(); bindGuide();
}

function bindGuide() {
  document.querySelectorAll(".faq-question").forEach(button => button.addEventListener("click", () => { const item = button.closest(".faq-item"); item.classList.toggle("open"); button.setAttribute("aria-expanded", item.classList.contains("open")); }));
  let timer; document.querySelector("#faq-search").addEventListener("input", event => { clearTimeout(timer); timer = setTimeout(() => renderGuide(event.target.value), 180); });
  document.querySelector("#export-data").addEventListener("click", exportData);
  document.querySelector("#import-data").addEventListener("change", event => importData(event.target.files[0]));
  document.querySelector("#reset-data").addEventListener("click", resetData);
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
    await loadData(); showToast("Backup restored"); renderGuide();
  } catch { showToast("That file is not a valid Seomtorch backup"); }
}

async function resetData() {
  if (!confirm("Reset all practice history and bookmarks on this device? Your name will be kept.")) return;
  await clearStore("attempts"); await clearStore("bookmarks");
  profile.rhythm = 0; profile.bestRhythm = 0; profile.lastStudyDate = null; await put("profile", profile);
  attempts = []; bookmarks = []; showToast("Progress reset"); renderGuide();
}

function renderOnboarding() {
  app.innerHTML = `<main class="onboarding"><section class="onboard-brand"><button class="brand" aria-label="Seomtorch"><span class="brand-mark"><i></i><i></i><i></i></span><span class="brand-name">Seomtorch<small>Prepare with purpose</small></span></button><div><blockquote>Preparation should feel clear, not crowded.</blockquote><p>A focused study companion built around useful practice, honest feedback and steady progress.</p></div><small>Designed for JAMB · WAEC · NECO · Post-UTME</small></section><section class="onboard-form"><div><p class="eyebrow">Welcome</p><h1>Your study desk is ready.</h1><p class="lede">Tell us what to call you. Your details and progress stay on this device.</p><form id="onboard-form"><div class="field"><label for="student-name">Your name</label><input id="student-name" type="text" maxlength="60" autocomplete="name" placeholder="e.g. Ada Okafor" required></div><button class="button" type="submit">Enter Seomtorch →</button></form></div></section></main>`;
  document.querySelector("#onboard-form").addEventListener("submit", async event => { event.preventDefault(); const name = document.querySelector("#student-name").value.trim(); if (!name) return; profile = { id: "local-user", name, rhythm: 0, bestRhythm: 0, lastStudyDate: null, createdAt: Date.now() }; await put("profile", profile); renderHome(); });
}

function render() {
  if (!profile) return renderOnboarding();
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
    render();
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  } catch (error) {
    console.error(error);
    app.innerHTML = `<main class="onboard-form" style="min-height:100dvh"><div><p class="eyebrow">Unable to start</p><h1>Seomtorch needs a local web server.</h1><p class="lede">Open this project through localhost or a secure website so its question bank and offline storage can load correctly.</p><p><code>npx serve .</code></p></div></main>`;
  }
}

init();
