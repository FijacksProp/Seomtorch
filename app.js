import { api, ApiError } from "./api-client.js";
import { jambCalculator } from "./calculator.js";

const SUBJECTS = [
  { id: "biology", name: "Biology", description: "JAMB cell biology, physiology, ecology, genetics and evolution" },
  { id: "chemistry", name: "Chemistry", description: "JAMB physical, inorganic and organic chemistry" },
  { id: "civic-education", name: "Civic Education", description: "WAEC & JAMB citizenship, human rights, democracy and governance" },
  { id: "computer-studies", name: "Computer Studies", description: "Hardware, software, networking, logic, programming and data processing" },
  { id: "economics", name: "Economics", description: "Microeconomics, macroeconomics, national income, trade and public finance" },
  { id: "english", name: "English Language", description: "Usage, comprehension and oral forms" },
  { id: "further-mathematics", name: "Further Mathematics", description: "Pure mathematics, mechanics, statistics, vectors, matrices and calculus" },
  { id: "general-paper", name: "General Paper", description: "Civics, current affairs and general knowledge" },
  { id: "government", name: "Government", description: "Political theories, Nigerian constitutional development, institutions and foreign policy" },
  { id: "history", name: "History", description: "Nigerian, African and world history from pre-colonial to modern times" },
  { id: "literature-in-english", name: "Literature in English", description: "Literary devices, African and non-African prose, drama, and poetry" },
  { id: "marketing", name: "Marketing", description: "Marketing concepts, 4Ps, distribution channels, promotion and consumer behavior" },
  { id: "mathematics", name: "Mathematics", description: "Numbers, algebra, geometry and calculus" },
  { id: "music", name: "Music", description: "JAMB music theory, African music and Western art music" },
  { id: "physics", name: "Physics", description: "JAMB mechanics, waves, electricity and modern physics" },
];
const ALL_SUBJECT_ORDER = ["biology", "chemistry", "civic-education", "computer-studies", "economics", "english", "further-mathematics", "general-paper", "government", "history", "literature-in-english", "marketing", "mathematics", "music", "physics"].map(id => SUBJECTS.find(subject => subject.id === id));

const FAQS = [
  { group: "Getting started", q: "What is Seomtorch designed for?", a: "Seomtorch is a personal study companion for structured JAMB, WAEC, NECO and Post-UTME preparation. It helps you practise by topic, learn from corrections and see where your next study session will matter most." },
  { group: "Getting started", q: "Do I need an account or internet connection?", a: "An account is required so your progress can be monitored and restored across devices. After signing in once, practice can continue offline and pending answers synchronize when the connection returns." },
  { group: "Getting started", q: "Can I install Seomtorch on my device?", a: "Yes. Use the Install app button. On iPhone or iPad, open Seomtorch in Safari, tap Share, then choose Add to Home Screen." },
  { group: "Practice and review", q: "How are questions selected?", a: "Sessions prioritise questions you have not seen, topics where your accuracy is lower, and questions you previously missed. Recently answered questions receive less priority, which reduces unnecessary repetition." },
  { group: "Practice and review", q: "Which subjects are available?", a: "Biology, Chemistry, Civic Education, Computer Studies, Economics, English Language, Further Mathematics, General Paper, Government, History, Literature in English, Marketing, Mathematics, Music and Physics are available. Question banks include verified questions with detailed written explanations." },
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
  home: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5V21H3V10.5Z"/><path d="M9 21v-6h6v6"/></svg>',
  practice: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  progress: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/><path d="M3 20h18"/></svg>',
  challenges: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"/><path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"/><path d="M4 5h16v4a6 6 0 0 1-12 0V5z"/><path d="M12 15v4"/><path d="M8 21h8"/></svg>',
  profile: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  university: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M12 3 2 9l10 6 10-6Z"/><path d="M2 9v8"/><path d="M6 11.2V17c0 1.1 2.7 3 6 3s6-1.9 6-3v-5.8"/></svg>',
  buddies: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
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
let completedTests = [];
let progressDataLoading = false;
let route = "home";
let selectedSubject = null;
let selectedQuestionCount = 10;
let selectedStudyMinutes = 10;
let activeSession = null;
let sessionTimer = null;
let syncPromise = null;
let pendingSyncCount = 0;
let deferredInstallPrompt = window.__deferredInstallPrompt || null;
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
let uniRoute = "departments"; // departments | levels | courses | course | note
let uniDeptId = null;
let uniLevel = null;
let uniCourseId = null;
let uniContentCache = {};
let uniDepartments = null;
let uniNoteFile = null;
let uniNoteTitle = null;
let uniNoteActiveBlock = 1;
let uniNoteViewMode = "step"; // "step" | "all"
let uniNoteCategoryFilter = "all";
let uniNoteGlossaryOpen = false;
let uniNotePlayingBlockId = null;
let uniNoteSpeechRate = 1.0;
let uniNoteRevealedMap = {};
let uniNoteTranscriptOpenMap = {};

/* ─── Monetization & Access Control State ──────────────────────────────── */
let subscriptionConfig = null;
let userAccessData = {
  has_all_access: false,
  unlocked_courses: [],
  is_trial: false,
  trial_days_remaining: 0,
  trial_used: false,
  expires_at: null,
};
let freeTopicsMap = {
  "ANA 201": "ul-bones",
  "ANA 203": "ge-gametes",
  "PIO 201": "pio-transport-homeostasis",
};

async function loadSubscriptionState() {
  try {
    const data = await api.subscriptionConfig(authToken);
    if (data) {
      subscriptionConfig = data;
      if (data.user_access) {
        userAccessData = data.user_access;
      }
      if (data.free_topics) {
        freeTopicsMap = { ...freeTopicsMap, ...data.free_topics };
      }
    }
  } catch (err) {
    // offline or backend not reachable
  }
}

function hasCourseAccess(courseCode) {
  if (!courseCode) return false;
  const norm = String(courseCode).trim().toUpperCase();
  const isUniCourse = ["ANA 201", "ANA 203", "PIO 201", "ANA201", "ANA203", "PIO201"].some(c => norm.includes(c));
  if (!isUniCourse) return true; // Non-university content remains free
  if (userAccessData?.has_all_access) return true;
  if (userAccessData?.is_trial) return true;
  if (userAccessData?.unlocked_courses?.some(c => norm.includes(c.toUpperCase()))) return true;
  return false;
}

function hasAllAccess() {
  return Boolean(userAccessData?.has_all_access || userAccessData?.is_trial);
}

function isTopicFree(courseCode, topicId, topicIdx = 0, sectionIdx = 0) {
  const norm = String(courseCode || "").trim().toUpperCase();
  const configured = freeTopicsMap[norm] || freeTopicsMap[norm.replace(/\s+/g, "")];
  if (configured && topicId) {
    const cId = String(configured).toLowerCase();
    const tId = String(topicId).toLowerCase();
    if (tId === cId || tId.includes(cId) || cId.includes(tId)) {
      return true;
    }
  }
  return sectionIdx === 0 && topicIdx === 0;
}

const AVATAR_PRESETS = [
  { id: "varsity-male", name: "Varsity (Male)", persona: "Varsity", gender: "male", file: "assets/avatars/varsity-male.webp" },
  { id: "varsity-female", name: "Varsity (Female)", persona: "Varsity", gender: "female", file: "assets/avatars/varsity-female.webp" },
  { id: "scholar-female", name: "Reading (Female)", persona: "Scholar", gender: "female", file: "assets/avatars/scholar-female.webp" },
  { id: "scholar-male", name: "Reading (Male)", persona: "Scholar", gender: "male", file: "assets/avatars/scholar-male.webp" },
  { id: "audio-male", name: "Focus (Male)", persona: "Focus", gender: "male", file: "assets/avatars/audio-male.webp" },
  { id: "audio-female", name: "Focus (Female)", persona: "Focus", gender: "female", file: "assets/avatars/audio-female.webp" },
  { id: "medic-female", name: "Pre-Med (Female)", persona: "Pre-Med", gender: "female", file: "assets/avatars/medic-female.webp" },
  { id: "medic-male", name: "Pre-Med (Male)", persona: "Pre-Med", gender: "male", file: "assets/avatars/medic-male.webp" },
  { id: "hijab-female", name: "Modest (Female)", persona: "Modest", gender: "female", file: "assets/avatars/hijab-female.webp" }
];

function getRandomAvatarId(gender = null) {
  const normalized = gender ? String(gender).toLowerCase().trim() : null;
  const pool = normalized ? AVATAR_PRESETS.filter(a => a.gender === normalized) : AVATAR_PRESETS;
  const list = pool.length > 0 ? pool : AVATAR_PRESETS;
  return list[Math.floor(Math.random() * list.length)].id;
}

function getAvatarSrc(avatarId) {
  if (!avatarId) return null;
  const match = AVATAR_PRESETS.find(p => p.id === avatarId || p.file === avatarId);
  if (match) return match.file;
  if (avatarId.startsWith("assets/") || avatarId.startsWith("http") || avatarId.startsWith("data:")) return avatarId;
  return `assets/avatars/${avatarId}.webp`;
}

function renderAvatarMarkup(avatarId, size = 36) {
  const src = getAvatarSrc(avatarId);
  if (src) {
    return `<img src="${escapeHtml(src)}" alt="Student avatar" class="avatar-img-element" width="${size}" height="${size}" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='grid';"><span class="avatar-fallback-initials" style="display:none;">${initials()}</span>`;
  }
  return `<span class="avatar-fallback-initials">${initials()}</span>`;
}

let buddiesMatches = { onApp: getSavedBuddies(), invites: [] };
let buddiesLoading = false;
let buddiesSearchOpen = false;

function getSavedBuddies() {
  try { return JSON.parse(localStorage.getItem("seomtorch-saved-buddies") || "[]"); }
  catch { return []; }
}

function saveBuddies(list) {
  try { localStorage.setItem("seomtorch-saved-buddies", JSON.stringify(list)); }
  catch {}
}
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  window.__deferredInstallPrompt = event;
  if (authToken && currentUser && profile && route !== "session") render();
});
window.addEventListener("pwa-install-ready", event => {
  deferredInstallPrompt = event.detail || window.__deferredInstallPrompt;
  if (authToken && currentUser && profile && route !== "session") render();
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  window.__deferredInstallPrompt = null;
  showToast("Seomtorch installed successfully");
  if (route !== "session") render();
});

function readCachedUser() {
  try { return JSON.parse(localStorage.getItem("seomtorch-auth-user") || "null"); }
  catch { localStorage.removeItem("seomtorch-auth-user"); return null; }
}

function getActiveMode() {
  return currentUser?.active_mode || localStorage.getItem("seomtorch-active-mode") || "aspirant";
}

function hasAspirantProfile() {
  return Boolean(currentUser?.has_aspirant_profile || currentUser?.aspirant_profile);
}

function hasUniversityProfile() {
  return Boolean(currentUser?.has_university_profile || currentUser?.university_profile);
}

async function handleModeSwitch(targetMode) {
  const currentMode = getActiveMode();
  if (targetMode === currentMode) return;

  if (targetMode === "university") {
    if (!hasUniversityProfile()) {
      showUniversityRegistrationModal();
      return;
    }
  } else if (targetMode === "aspirant") {
    if (!hasAspirantProfile() && currentUser?.user_type === "university") {
      showAspirantRegistrationModal();
      return;
    }
  }

  await performModeSwitch(targetMode);
}

async function performModeSwitch(targetMode) {
  const shellEl = document.querySelector(".app-shell") || document.body;
  shellEl.classList.add("portal-switching");

  await new Promise(resolve => setTimeout(resolve, 140));

  if (currentUser) {
    currentUser.active_mode = targetMode;
    localStorage.setItem("seomtorch-auth-user", JSON.stringify(currentUser));
  }
  localStorage.setItem("seomtorch-active-mode", targetMode);
  if (authToken) {
    api.switchMode(authToken, targetMode).catch(() => {});
  }
  route = "home";
  if (targetMode === "university") {
    uniRoute = "departments";
    uniDeptId = null;
    uniLevel = null;
    uniCourseId = null;
  } else {
    selectedSubject = null;
  }
  render();

  requestAnimationFrame(() => {
    const newShell = document.querySelector(".app-shell") || document.body;
    newShell.classList.remove("portal-switching");
    newShell.classList.add("portal-switched-in");
    setTimeout(() => newShell.classList.remove("portal-switched-in"), 350);
  });

  showToast(targetMode === "university" ? "Switched to University Portal" : "Switched to Aspirants Portal");
}

function showUniversityRegistrationModal(onSuccess) {
  const existingModal = document.querySelector("#mode-modal-backdrop");
  if (existingModal) existingModal.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "mode-modal-backdrop";
  backdrop.className = "mode-modal-backdrop";
  backdrop.innerHTML = `
    <div class="mode-modal">
      <span class="mode-modal-badge uni-badge">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3L2 8l10 5 10-5-10-5z"/><path d="M6 10.5v5c0 3 3 5.5 6 5.5s6-2.5 6-5.5v-5"/><path d="M22 8v6"/></svg>
        <span>Academic Enrollment</span>
      </span>
      <h2>Register Your University Details</h2>
      <p class="mode-modal-desc">Enter your institution, department and level to unlock your specialized undergraduate course modules and past questions.</p>
      <form id="uni-reg-modal-form" class="mode-modal-form">
        <div class="field">
          <label for="modal-uni-name">University / Institution *</label>
          <input id="modal-uni-name" name="university_name" type="text" placeholder="e.g. University of Ilorin (UNILORIN)" required value="${escapeHtml(currentUser?.university_profile?.university_name || "")}">
        </div>
        <div class="field">
          <label for="modal-uni-faculty">Faculty</label>
          <input id="modal-uni-faculty" name="faculty" type="text" placeholder="e.g. Basic Medical Sciences" value="${escapeHtml(currentUser?.university_profile?.faculty || "")}">
        </div>
        <div class="field">
          <label for="modal-uni-dept">Department *</label>
          <input id="modal-uni-dept" name="department" type="text" placeholder="e.g. Anatomy" required value="${escapeHtml(currentUser?.university_profile?.department || "")}">
        </div>
        <div class="field">
          <label for="modal-uni-level">Academic Level *</label>
          <select id="modal-uni-level" name="level" required>
            <option value="100" ${currentUser?.university_profile?.level === 100 ? "selected" : ""}>100 Level</option>
            <option value="200" ${(!currentUser?.university_profile?.level || currentUser?.university_profile?.level === 200) ? "selected" : ""}>200 Level</option>
            <option value="300" ${currentUser?.university_profile?.level === 300 ? "selected" : ""}>300 Level</option>
            <option value="400" ${currentUser?.university_profile?.level === 400 ? "selected" : ""}>400 Level</option>
            <option value="500" ${currentUser?.university_profile?.level === 500 ? "selected" : ""}>500 Level</option>
            <option value="600" ${currentUser?.university_profile?.level === 600 ? "selected" : ""}>600 Level</option>
          </select>
        </div>
        <div id="uni-modal-error" class="auth-error" role="alert"></div>
        <div class="button-row">
          <button type="button" class="button outline" id="close-uni-modal">Cancel</button>
          <button type="submit" class="button accent">Continue to University Portal →</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelector("#close-uni-modal").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", e => { if (e.target === backdrop) backdrop.remove(); });

  const form = backdrop.querySelector("#uni-reg-modal-form");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const err = form.querySelector("#uni-modal-error");
    btn.disabled = true;
    btn.textContent = "Saving…";
    err.textContent = "";

    const fd = new FormData(form);
    const payload = {
      university_name: String(fd.get("university_name")).trim(),
      faculty: String(fd.get("faculty")).trim(),
      department: String(fd.get("department")).trim(),
      level: Number(fd.get("level")),
      current_courses: []
    };

    try {
      if (authToken) {
        const res = await api.saveUniversityProfile(authToken, payload);
        if (res.user) currentUser = res.user;
      }
      if (!currentUser) currentUser = {};
      currentUser.has_university_profile = true;
      currentUser.university_profile = payload;
      currentUser.active_mode = "university";
      localStorage.setItem("seomtorch-auth-user", JSON.stringify(currentUser));
      localStorage.setItem("seomtorch-active-mode", "university");
      backdrop.remove();
      showToast("University profile registered!");
      if (onSuccess) onSuccess();
      else {
        route = "home";
        uniRoute = "departments";
        render();
      }
    } catch (caught) {
      err.textContent = caught instanceof ApiError ? caught.message : "Failed to save profile. Please try again.";
      btn.disabled = false;
      btn.textContent = "Continue to University Portal →";
    }
  });
}

function showAspirantRegistrationModal(onSuccess) {
  const existingModal = document.querySelector("#mode-modal-backdrop");
  if (existingModal) existingModal.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "mode-modal-backdrop";
  backdrop.className = "mode-modal-backdrop";
  backdrop.innerHTML = `
    <div class="mode-modal">
      <span class="mode-modal-badge aspirant-badge">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
        <span>Exam Preparation</span>
      </span>
      <h2>Set up Exam Aspirant Profile</h2>
      <p class="mode-modal-desc">Select your target examination and target year to access full syllabus question banks and timed mock practice.</p>
      <form id="aspirant-reg-modal-form" class="mode-modal-form">
        <div class="field">
          <label for="modal-exam-type">Target Examination *</label>
          <select id="modal-exam-type" name="exam_type" required>
            <option value="jamb">JAMB UTME</option>
            <option value="waec">WAEC SSCE</option>
            <option value="neco">NECO SSCE</option>
            <option value="post_utme">POST-UTME</option>
          </select>
        </div>
        <div class="field">
          <label for="modal-target-year">Target Year *</label>
          <input id="modal-target-year" name="target_year" type="number" min="2024" max="2035" value="2026" required>
        </div>
        <div class="field">
          <label>Target Subjects <span>(Optional)</span></label>
          <div class="subject-pills-select">
            ${["english", "mathematics", "biology", "chemistry", "physics", "economics", "government", "literature-in-english", "computer-studies"].map(sId => {
              const sObj = SUBJECTS.find(s => s.id === sId) || { name: sId };
              return `<label class="subject-pill-label"><input type="checkbox" name="preferred_subjects" value="${sId}"> ${sObj.name}</label>`;
            }).join("")}
          </div>
        </div>
        <div id="aspirant-modal-error" class="auth-error" role="alert"></div>
        <div class="button-row">
          <button type="button" class="button outline" id="close-aspirant-modal">Cancel</button>
          <button type="submit" class="button accent">Continue to Aspirants Portal →</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelector("#close-aspirant-modal").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", e => { if (e.target === backdrop) backdrop.remove(); });

  const form = backdrop.querySelector("#aspirant-reg-modal-form");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const err = form.querySelector("#aspirant-modal-error");
    btn.disabled = true;
    btn.textContent = "Saving…";
    err.textContent = "";

    const fd = new FormData(form);
    const preferred = Array.from(form.querySelectorAll("input[name=preferred_subjects]:checked")).map(cb => cb.value);
    const payload = {
      exam_type: String(fd.get("exam_type")),
      target_year: Number(fd.get("target_year")),
      preferred_subjects: preferred
    };

    try {
      if (authToken) {
        const res = await api.saveAspirantProfile(authToken, payload);
        if (res.user) currentUser = res.user;
      }
      if (!currentUser) currentUser = {};
      currentUser.has_aspirant_profile = true;
      currentUser.aspirant_profile = payload;
      currentUser.active_mode = "aspirant";
      localStorage.setItem("seomtorch-auth-user", JSON.stringify(currentUser));
      localStorage.setItem("seomtorch-active-mode", "aspirant");
      backdrop.remove();
      showToast("Aspirants profile registered!");
      if (onSuccess) onSuccess();
      else {
        route = "home";
        selectedSubject = null;
        render();
      }
    } catch (caught) {
      err.textContent = caught instanceof ApiError ? caught.message : "Failed to save profile. Please try again.";
      btn.disabled = false;
      btn.textContent = "Continue to Aspirants Portal →";
    }
  });
}

function saveActiveSession() {
  if (!activeSession || activeSession.finished) {
    localStorage.removeItem("seomtorch-active-session");
    return;
  }
  try {
    localStorage.setItem("seomtorch-active-session", JSON.stringify(activeSession));
  } catch (err) {
    console.warn("Could not persist active session:", err);
  }
}

function clearActiveSession() {
  localStorage.removeItem("seomtorch-active-session");
}

function restoreActiveSession() {
  try {
    const raw = localStorage.getItem("seomtorch-active-session");
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.queue || session.queue.length === 0 || session.finished) {
      localStorage.removeItem("seomtorch-active-session");
      return null;
    }
    // Re-hydrate full question data from question bank
    session.queue = session.queue.map(q => {
      const full = questionById(q.id);
      return full ? { ...full, ...q } : q;
    });
    return session;
  } catch {
    localStorage.removeItem("seomtorch-active-session");
    return null;
  }
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
  if (profile && !profile.avatar) {
    profile.avatar = getRandomAvatarId();
    await put("profile", profile);
  }
  attempts = await getAll("attempts");
  bookmarks = await getAll("bookmarks");
  try {
    const testMeta = await get("meta", "completed_tests");
    completedTests = Array.isArray(testMeta?.list) ? testMeta.list : [];
  } catch { completedTests = []; }
}

function today() { return new Date().toISOString().slice(0, 10); }
function yesterday() { const date = new Date(); date.setDate(date.getDate() - 1); return date.toISOString().slice(0, 10); }
function firstName() { return profile?.name?.trim().split(/\s+/)[0] || "Student"; }
function initials() { return profile?.name?.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "ST"; }
function accuracy(list = attempts) { return list.length ? Math.round(list.filter(item => item.correct).length / list.length * 100) : 0; }
function subjectName(id) {
  if (!id) return "General Practice";
  const str = String(id).trim();
  const lower = str.toLowerCase();
  if (lower === "ana201" || lower === "ana 201") return "ANA 201: Upper & Lower Limb";
  if (lower === "ana202" || lower === "ana 202") return "ANA 202: Neuroanatomy";
  if (lower === "ana203" || lower === "ana 203") return "ANA 203: Systemic Embryology";
  if (lower === "pio201" || lower === "pio 201") return "PIO 201: Medical Physiology";
  const match = SUBJECTS.find(subject => subject.id.toLowerCase() === lower);
  if (match) return match.name;
  return (lower.startsWith("ana") || lower.startsWith("pio")) ? str.toUpperCase() : str;
}
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
  const isUni = Boolean(question?.isUniversity || question?.courseCode);
  if (isUni) {
    const courseCode = question.courseCode || question.subject;
    const isFree = isTopicFree(courseCode, question.topicId || question.topic);
    if (!hasCourseAccess(courseCode) && !isFree) {
      return `<div class="explanation-content">
        <div class="explanation-locked-box" style="padding:14px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-top:8px;">
          <strong style="display:flex;align-items:center;gap:6px;color:#92400e;font-size:13px;">🔒 Detailed Explanation Locked</strong>
          <p style="margin:4px 0 10px;font-size:12px;color:#78350f;">Full worked solutions and clinical rationales for this topic are included with Course Access.</p>
          <button type="button" class="button small outline" style="border-color:#b45309;color:#92400e;" onclick="window.showUpgradeModal({trigger:'locked_explanation',courseCode:'${escapeHtml(courseCode || '')}'})">Unlock Explanations</button>
        </div>
      </div>`;
    }
  }
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

function showToast(message, options = {}) {
  if (!toastRegion) return;

  const existingToasts = toastRegion.querySelectorAll(".toast:not(.toast-out)");
  if (existingToasts.length >= 2) {
    dismissToast(existingToasts[0]);
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  let iconHtml = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  `;
  if (typeof message === "string") {
    if (message.includes("🔒") || message.toLowerCase().includes("lock")) {
      iconHtml = `
        <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      `;
    } else if (message.toLowerCase().includes("error") || message.toLowerCase().includes("failed") || message.toLowerCase().includes("prohibited")) {
      iconHtml = `
        <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      `;
    }
  }

  toast.innerHTML = `<span class="toast-icon">${iconHtml}</span><span class="toast-text">${escapeHtml(message)}</span>`;

  let timer = null;
  const dismiss = () => {
    if (toast.classList.contains("toast-out")) return;
    toast.classList.add("toast-out");
    clearTimeout(timer);
    setTimeout(() => toast.remove(), 220);
  };

  toast.addEventListener("click", dismiss);

  let touchStartY = 0;
  toast.addEventListener("touchstart", (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  toast.addEventListener("touchend", (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    if (touchStartY - touchEndY > 14) {
      dismiss();
    }
  }, { passive: true });

  toastRegion.appendChild(toast);
  timer = setTimeout(dismiss, options.duration || 3000);
}

function dismissToast(toastEl) {
  if (!toastEl || toastEl.classList.contains("toast-out")) return;
  toastEl.classList.add("toast-out");
  setTimeout(() => toastEl.remove(), 220);
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
    showConfirmDialog({ title: "Leave this active session?", message: "Your timer is still running. Leaving now will end this session and preserve only answers you have already confirmed.", confirmLabel: "Leave session", cancelLabel: "Keep studying", tone: "warning", onConfirm: () => { clearInterval(sessionTimer); activeSession.finished = true; route = nextRoute; clearActiveSession(); if (nextRoute !== "practice") selectedSubject = null; render(); } });
    return;
  }
  if (route === "session" && activeSession && !activeSession.started) clearActiveSession();
  if (nextRoute === "challenges") { selectedChallengeId = null; challengesData = null; }
  if (nextRoute === "university") { uniRoute = "departments"; uniDeptId = null; uniLevel = null; uniCourseId = null; }
  route = nextRoute;
  if (nextRoute !== "practice") selectedSubject = null;
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function shell(content) {
  const xp = xpState();
  const testStats = profile.tests || { tests_taken: 0, average_score: 0 };
  const mode = getActiveMode();
  const nav = mode === "university"
    ? [["home", "Home"], ["university", "Courses"], ["buddies", "Buddies"], ["progress", "Insights"], ["profile", "Profile"]]
    : [["home", "Home"], ["practice", "Practice"], ["challenges", "Challenges"], ["buddies", "Buddies"], ["progress", "Insights"], ["profile", "Profile"]];

  return `<div class="layout ${mode === 'university' ? 'layout-uni' : ''}">
    <aside class="sidebar">
      <button class="brand" data-route="home" aria-label="Seomtorch home">
        <span class="brand-symbol" aria-hidden="true"><img src="assets/seomtorch_logo.png" alt=""></span>
        <span class="brand-name">Seomtorch</span>
      </button>

      <nav class="nav" aria-label="Primary navigation">
        ${nav.map(([id, label]) => `<button class="nav-button ${route === id ? "active" : ""}" data-route="${id}">${ICONS[id] || ICONS.university}<span>${label}</span></button>`).join("")}
      </nav>

      <div class="mode-switcher-container">
        <div class="mode-switcher-pill" role="tablist" aria-label="Portal mode">
          <button type="button" class="mode-pill-btn ${mode === 'aspirant' ? 'active' : ''}" data-switch-mode="aspirant" role="tab" aria-selected="${mode === 'aspirant'}" title="Switch to Aspirants Portal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
            <span>Aspirant</span>
          </button>
          <button type="button" class="mode-pill-btn ${mode === 'university' ? 'active' : ''}" data-switch-mode="university" role="tab" aria-selected="${mode === 'university'}" title="Switch to University Portal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M4 18h16M4 10h16M12 3L2 8h20z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/></svg>
            <span>University</span>
          </button>
        </div>
      </div>

      <div class="sidebar-foot">
        <div class="streak-panel">
          <svg class="streak-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.5c.5 3.2-.8 4.7-2.1 6.1-1.1 1.2-2.1 2.3-1.7 4.3-1.3-.7-2-2-1.9-3.7C5.3 11 4 13.5 4.3 16.1 4.7 19.6 7.6 22 11.2 22c4.8 0 8-3.1 8-7.7 0-4.1-2.5-8.3-6-11.8Z"/><path d="M12 19.2c-1.7 0-2.9-1.1-3-2.7-.1-1.2.5-2.3 1.5-3.2.1 1 .6 1.5 1.1 1.8-.2-1.7.7-2.7 1.6-3.7 1.2 1.5 1.8 3.1 1.7 4.6-.1 1.9-1.2 3.2-2.9 3.2Z"/></svg>
          <div><span>Current streak</span><strong>${profile.rhythm || 0}<small> day${profile.rhythm === 1 ? "" : "s"}</small></strong></div>
        </div>
        <div class="xp-panel">
          <div><strong>Level ${xp.level}</strong><span>${xp.xp} XP</span></div>
          <div class="xp-track"><i style="width:${xp.percent}%"></i></div>
          <small>${xp.remaining} XP to next level</small>
        </div>
        ${mode === 'aspirant' ? `<button class="button outline small jamb-calc-sidebar-btn" id="sidebar-calc-toggle" type="button" style="width:100%; margin-top:14px; margin-bottom:6px; display:inline-flex; align-items:center; justify-content:center; gap:7px; font-size:11px; font-weight:700;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg><span>JAMB Calculator</span></button>` : ''}
      </div>
    </aside>
    <div class="content-wrap">
      <div class="app-header-sticky">
        <header class="topbar">
          <span class="mobile-brand">
            <img src="assets/seomtorch_logo.png" alt="">
            <b>Seomtorch</b>
          </span>
          <span class="sync-indicator ${pendingSyncCount > 0 ? 'pending' : navigator.onLine ? 'synced' : 'offline'}" title="${pendingSyncCount > 0 ? `${pendingSyncCount} items pending sync` : navigator.onLine ? 'Synced' : 'Offline'}">
            <i></i>${pendingSyncCount > 0 ? `<small>${pendingSyncCount}</small>` : ''}
          </span>
          <div class="topbar-pills">
            <div class="top-badge-pill" title="Tests completed">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              <span>${testStats.tests_taken || 0} tests</span>
            </div>
            <div class="top-badge-pill" title="Average test score">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              <span>${testStats.average_score}% score</span>
            </div>
            <div class="top-badge-pill top-xp-level-pill" title="Level ${xp.level} · ${xp.remaining} XP to next level">
              <span>Level ${xp.level} · ${xp.xp} XP</span>
              <div class="level-badge-ring">
                <svg viewBox="0 0 36 36" class="level-radial-chart">
                  <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                  <path class="circle-fill" stroke-dasharray="${Math.max(6, xp.percent)}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                </svg>
                <span class="level-badge-number">${xp.level}</span>
              </div>
            </div>
            <button class="topbar-avatar-btn" data-route="profile" title="Open ${escapeHtml(profile.name)}'s profile">
              <span class="avatar">${renderAvatarMarkup(profile.avatar, 36)}</span>
              <svg class="avatar-caret-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
        </header>
        <div class="portal-switch-bar" role="tablist" aria-label="Portal selection">
          <div class="portal-switch-track">
            <button type="button" class="portal-switch-tab ${mode === 'aspirant' ? 'active' : ''}" data-switch-mode="aspirant" role="tab" aria-selected="${mode === 'aspirant'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
              <span>Aspirants (JAMB / SSCE)</span>
            </button>
            <button type="button" class="portal-switch-tab ${mode === 'university' ? 'active' : ''}" data-switch-mode="university" role="tab" aria-selected="${mode === 'university'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M4 18h16M4 10h16M12 3L2 8h20z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/></svg>
              <span>University Degree</span>
            </button>
          </div>
        </div>
      </div>
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
  document.querySelectorAll("[data-switch-mode]").forEach(button => {
    button.addEventListener("click", () => handleModeSwitch(button.dataset.switchMode));
  });
  document.querySelectorAll("#sidebar-calc-toggle, #session-calc-toggle, #mobile-calc-fab").forEach(btn => {
    btn.addEventListener("click", () => jambCalculator.toggle());
  });
}

async function installApp() {
  if (isStandalone()) {
    showToast("Seomtorch is already installed as an app.");
    return;
  }
  const promptEvent = deferredInstallPrompt || window.__deferredInstallPrompt;
  if (promptEvent) {
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === "accepted") {
        deferredInstallPrompt = null;
        window.__deferredInstallPrompt = null;
        showToast("Installing Seomtorch...");
      }
      return;
    } catch (err) {
      console.warn("Direct install prompt error:", err);
    }
  }
  if (isIos()) {
    showToast("Tap Safari Share (square with arrow), then 'Add to Home Screen'");
    return;
  }
  showToast("Preparing direct app installation... Tap again in a moment.");
}

function lastTopic() {
  const last = [...attempts].sort((a, b) => b.timestamp - a.timestamp)[0];
  return last ? questionById(last.questionId) : null;
}

function subjectStats(subjectId) {
  const list = attempts.filter(item => item.subject === subjectId);
  return { count: list.length, accuracy: accuracy(list) };
}

function renderUniHome() {
  const uniProf = currentUser?.university_profile || {};
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
  const uniName = uniProf.university_name || "University Studies";
  const deptTitle = uniProf.department ? `Department of ${uniProf.department}` : "Undergraduate Studies";
  const levelText = uniProf.level ? `${uniProf.level} Level` : "Undergraduate";

  const content = `<section class="page">
    <div class="uni-workspace-masthead">
      <div class="uni-institution-strip">
        <svg class="uni-crest-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M12 3L2 8l10 5 10-5-10-5z"/><path d="M6 10.5v5c0 3 3 5.5 6 5.5s6-2.5 6-5.5v-5"/><path d="M22 8v6"/>
        </svg>
        <span class="uni-inst-name">${escapeHtml(uniName)}</span>
        <span class="uni-sep-dot">·</span>
        <span class="uni-level-pill">${escapeHtml(levelText)}</span>
      </div>

      <div class="uni-dept-block">
        <span class="uni-dept-prefix">Academic Program</span>
        <h2 class="uni-dept-title">${escapeHtml(deptTitle)}</h2>
        ${uniProf.faculty ? `<span class="uni-fac-name">Faculty of ${escapeHtml(uniProf.faculty)}</span>` : ""}
      </div>

      <div class="uni-masthead-divider"></div>

      <div class="uni-greeting-group">
        <h1>${greeting}, ${escapeHtml(firstName())}.</h1>
        <p>Review course materials, practise departmental questions, and track topic mastery.</p>
      </div>

      <div class="uni-masthead-actions">
        <button class="button accent" id="uni-home-open-courses">
          <span>Explore Department Courses</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <button class="button outline" id="uni-home-edit-profile">
          <span>Update Academic Info</span>
        </button>
      </div>
    </div>

    <div class="section-head">
      <h2>Active Department Modules</h2>
      <p>Current semester practice banks</p>
    </div>

    <div class="uni-featured-card">
      <div>
        <span class="uni-featured-badge">Featured Course · 200 Level</span>
        <h3 class="uni-featured-title">ANA 201: Upper and Lower Limb</h3>
        <p class="uni-featured-desc">High-Yield clinical practice covering Bones, Muscles, Joints, Brachial Plexus, and specialized anatomical regions with detailed rationale.</p>
      </div>
      <button class="button accent" id="uni-home-jump-ana201">Open ANA 201 →</button>
    </div>

    <div class="section-head">
      <h2>Departments Catalog</h2>
      <p>Browse courses by department</p>
    </div>

    <div class="uni-quick-grid">
      <div class="uni-portal-status-card">
        <div>
          <div class="uni-dept-svg-mark anatomy">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20M7 7l10 10M17 7L7 17"/></svg>
          </div>
          <strong>Human Anatomy</strong>
          <p>Gross anatomy, neuroanatomy, embryology and histology with detailed anatomical landmarks and clinical correlations.</p>
        </div>
        <button class="button outline small" data-uni-browse-dept="anatomy">Browse Anatomy Courses →</button>
      </div>

      <div class="uni-portal-status-card">
        <div>
          <div class="uni-dept-svg-mark physiology">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <strong>Human Physiology</strong>
          <p>Cellular physiology, cardiovascular, respiratory, renal, and neuro-endocrine system mechanics.</p>
        </div>
        <button class="button outline small" data-uni-browse-dept="physiology">Browse Physiology Courses →</button>
      </div>
    </div>
  </section>`;

  app.innerHTML = shell(content);
  bindShell();

  document.querySelector("#uni-home-open-courses")?.addEventListener("click", () => {
    route = "university";
    uniRoute = "departments";
    uniDeptId = null;
    render();
  });
  document.querySelector("#uni-home-jump-ana201")?.addEventListener("click", () => {
    route = "university";
    uniRoute = "course";
    uniDeptId = "anatomy";
    uniLevel = 200;
    uniCourseId = "ana201";
    render();
  });
  document.querySelector("#uni-home-edit-profile")?.addEventListener("click", () => {
    showUniversityRegistrationModal(() => render());
  });
  document.querySelectorAll("[data-uni-browse-dept]").forEach(btn => {
    btn.addEventListener("click", () => {
      route = "university";
      uniRoute = "levels";
      uniDeptId = btn.dataset.uniBrowseDept;
      render();
    });
  });
}

function renderHome() {
  if (getActiveMode() === "university") {
    return renderUniHome();
  }
  const recent = lastTopic();
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
  const displayName = currentUser?.username || firstName();
  const todayAttempts = attempts.filter(item => new Date(item.timestamp).toISOString().slice(0, 10) === today());
  const testStats = profile.tests || { tests_today: 0, average_score: 0 };
  const urgentChallenge = challengesData?.find(item => item.can_respond) || challengesData?.find(item => item.can_start);

  const content = `<section class="page page-home">
    <div class="home-greeting-block">
      <h1 class="home-greeting-title">${greeting}, ${escapeHtml(displayName)}.</h1>
      <p class="home-greeting-sub">A clear view of what you have done, where to focus, and what to tackle next.</p>
    </div>

    ${urgentChallenge ? `<article class="challenge-nudge"><div><span>${urgentChallenge.can_respond ? "Challenge invitation" : urgentChallenge.my_status === "started" ? "Attempt in progress" : "Challenge ready"}</span><h2>${escapeHtml(urgentChallenge.title)}</h2><p>${escapeHtml(urgentChallenge.creator.username)} · ${urgentChallenge.question_count} questions · ${urgentChallenge.duration_minutes} minutes</p></div><button class="button" id="open-urgent-challenge">${urgentChallenge.can_respond ? "Review invitation" : urgentChallenge.my_status === "started" ? "Continue attempt" : "Open challenge"} →</button></article>` : ""}

    <!-- Hero Card: "Start with a focused session" -->
    <article class="hero-focus-card">
      <div class="hero-focus-content">
        <span class="hero-focus-tag">${recent ? "CONTINUE WHERE YOU STOPPED" : "BEGIN YOUR PREPARATION"}</span>
        <h2 class="hero-focus-heading">${recent ? escapeHtml(recent.topic) : "Start with a focused session"}</h2>
        <p class="hero-focus-desc">${recent ? `${subjectName(recent.subject)} · personalised question selection` : "Pick a subject, set your focus, and build knowledge that lasts."}</p>
        <button class="hero-focus-btn" id="continue-study">
          <span>${recent ? "Continue studying" : "Choose a subject"}</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </article>

    <!-- Daily Challenge Banner ("5-Minute Sprint") -->
    <article class="sprint-banner-card">
      <div class="sprint-banner-left">
        <div class="sprint-lightning-circle">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="#D97706"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
        <div class="sprint-banner-text">
          <span class="sprint-banner-kicker">DAILY CHALLENGE</span>
          <h3 class="sprint-banner-title">5-Minute Sprint</h3>
          <p class="sprint-banner-desc">5 quick questions worth up to 25 XP. ${dailySprintCompleted ? 'Completed today ✓' : 'Ready to attempt'}</p>
        </div>
      </div>
      <button class="sprint-banner-btn ${dailySprintCompleted ? 'completed' : ''}" id="start-sprint">
        <span>${dailySprintCompleted ? 'Sprint completed ✓' : 'Start sprint →'}</span>
      </button>
    </article>

    <!-- "Today, at a glance" Stats Grid -->
    <div class="section-heading-clean">
      <h2>Today, at a glance</h2>
    </div>
    <div class="glance-metrics-grid">
      <div class="glance-metric-card">
        <div class="glance-card-top">
          <svg class="glance-icon icon-clipboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          <span class="glance-card-label">Tests completed today</span>
        </div>
        <strong class="glance-card-val">${testStats.tests_today || 0}</strong>
        <div class="glance-card-foot"><span class="glance-dot">●</span> Today</div>
      </div>

      <div class="glance-metric-card accent-card">
        <div class="glance-card-top">
          <svg class="glance-icon icon-trend" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
          <span class="glance-card-label">Average test score</span>
        </div>
        <strong class="glance-card-val">${testStats.average_score}%</strong>
        <div class="glance-card-foot trend-positive"><span>↑</span> ${testStats.average_score > 0 ? '6% vs yesterday' : '● Today'}</div>
      </div>

      <div class="glance-metric-card">
        <div class="glance-card-top">
          <svg class="glance-icon icon-question" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span class="glance-card-label">Questions today</span>
        </div>
        <strong class="glance-card-val">${todayAttempts.length}</strong>
        <div class="glance-card-foot"><span class="glance-dot">●</span> Today</div>
      </div>

      <div class="glance-metric-card">
        <div class="glance-card-top">
          <svg class="glance-icon icon-flame" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 23c4.97 0 9-4.03 9-9 0-4.5-3.5-7.5-5-9.5-1.5 2-3 3-4.5 3-2 0-3.5-1.5-3.5-3.5 0-.5.1-1 .2-1.5C5.2 4.7 3 8.6 3 14c0 4.97 4.03 9 9 9z"/></svg>
          <span class="glance-card-label">Current streak</span>
        </div>
        <strong class="glance-card-val">${profile.rhythm || 0} days</strong>
        <div class="glance-card-foot">${profile.rhythm > 0 ? 'Active streak!' : 'Keep going!'}</div>
      </div>
    </div>

    <!-- Subjects Section -->
    <div class="section-heading-clean subjects-head-row">
      <h2>Subjects</h2>
      <span class="subjects-avail-count">${questions.length ? questions.length.toLocaleString() : "32,777"} questions available</span>
    </div>
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
    saveActiveSession();
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
  const mode = activeSession.isMixed ? `${activeSession.courseCode || activeSession.subject} · Mixed Timed Practice` : activeSession.subject === "all" ? "All subjects" : activeSession.subject === "saved" ? "Saved for review" : subjectName(activeSession.subject);
  const isNormal = activeSession.mode === "normal";
  const content = `<section class="page page-narrow"><div class="session-ready"><p class="eyebrow">Ready when you are</p><h1>Your session is prepared.</h1><p class="lede">${isNormal ? "This guided session is untimed. You will see feedback after each answer." : "The countdown has not started. Once you begin, you may skip between questions and return using the numbered navigator."}</p><div class="ready-summary"><article><span>Focus</span><strong>${escapeHtml(mode)}</strong></article><article><span>Questions</span><strong>${activeSession.queue.length}</strong></article><article><span>Study time</span><strong>${isNormal ? "Untimed" : `${activeSession.durationMinutes} minutes`}</strong></article></div>${activeSession.sections.length > 1 ? `<div class="ready-sections">${activeSession.sections.map((section, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(section.name)}</strong><small>${section.count} questions</small></div>`).join("")}</div>` : ""}<div class="button-row"><button class="button" id="begin-session">Begin session →</button><button class="button outline" id="cancel-session">Change selections</button></div></div></section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelector("#begin-session").addEventListener("click", () => { activeSession.started = true; activeSession.deadline = isNormal ? null : Date.now() + activeSession.durationMinutes * 60000; activeSession.questionStartedAt = Date.now(); saveActiveSession(); render(); });
  document.querySelector("#cancel-session").addEventListener("click", () => { const wasUni = activeSession?.isUniversity; activeSession = null; clearActiveSession(); route = wasUni ? "university" : "practice"; render(); });
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
  const content = `<section class="page session-page"><aside class="question-navigator"><div><p class="eyebrow">Question navigator</p><strong>${confirmed} of ${activeSession.queue.length} answered</strong><span>Select any number to move between questions.</span></div><div class="question-number-grid">${activeSession.answers.map((item, index) => `<button class="question-number ${index === activeSession.index ? "current" : ""} ${item.selected !== null ? "selected" : ""}" data-question-index="${index}" aria-label="Question ${index + 1}${item.selected !== null ? ", selected" : ", unanswered"}">${index + 1}</button>`).join("")}</div><div class="navigator-key"><span><i class="selected"></i>Selected</span><span><i class="unanswered"></i>Unanswered</span></div><button class="button outline finish-session" id="finish-session">Finish session</button></aside><div class="session-workspace">${activeSession.sections.length > 1 ? `<div class="active-section"><span>Section ${sectionIndex + 1} of ${activeSession.sections.length}</span><strong>${escapeHtml(section.name)}</strong><small>${activeSession.index - section.start + 1} of ${section.count} in this section</small></div>` : ""}<div class="question-header"><div class="question-topline"><span>${subjectName(question.subject)} · ${escapeHtml(question.topic)}${question.questionYear ? ` · ${question.questionYear} source` : ""}</span><div class="session-status"><span>${activeSession.index + 1} of ${activeSession.queue.length}</span><span class="session-clock" role="timer" aria-label="Session time remaining"><small>Time left</small><strong id="session-timer">${formatTime(Math.ceil((activeSession.deadline - Date.now()) / 1000))}</strong></span><button class="session-calculator-btn" id="session-calc-toggle" type="button" aria-label="JAMB Calculator" title="JAMB Calculator (Alt+C)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg><span>Calculator</span></button></div></div><div class="question-progress"><i style="width:${confirmed / activeSession.queue.length * 100}%"></i></div></div><article class="question-paper" style="${passage ? 'display:flex; flex-direction:column; gap:1rem;' : ''}">
  ${passage ? `<details class="passage-details"><summary>View reading passage</summary><div class="passage-content">${renderMath(escapeHtml(passage))}</div></details>` : ""}
  ${renderQuestionImage(question)}
  <div><p class="eyebrow">Question ${String(activeSession.index + 1).padStart(2, "0")}</p><h2>${renderMath(escapeHtml(question.text))}</h2></div><div class="options">${question.options.map((option, index) => { let state = ""; if (activeSession.mode === "challenge" && answer.confirmed && index === answer.selected) state = "selected"; else if (answer.confirmed && index === question.correct) state = "correct"; else if (answer.confirmed && index === answer.selected) state = "incorrect"; else if (!answer.confirmed && index === answer.selected) state = "selected"; return `<button class="option ${state}" data-option="${index}" ${answer.confirmed ? "disabled" : ""}><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${renderMath(escapeHtml(option))}</span></button>`; }).join("")}</div>${answer.confirmed && activeSession.mode !== "challenge" ? `<div class="feedback"><div class="feedback-head"><div class="feedback-label ${answer.correct ? "" : "wrong"}">${answer.correct ? "Correct" : "Review this"}</div>${answer.correct ? '<span class="xp-earned">+5 XP</span>' : ""}</div>${renderExplanation(question)}</div>` : answer.confirmed ? '<p class="selection-note">This answer was already recorded and is locked.</p>' : answer.selected !== null ? '<p class="selection-note">Your selection is not recorded until you finish the session.</p>' : ""}<div class="question-actions"><button class="button outline" id="previous-question" ${activeSession.index === 0 ? "disabled" : ""}>← Previous</button><button class="button outline" id="bookmark">${isBookmarked ? "Remove from saved" : "Save for review"}</button><button class="button" id="next-question">${activeSession.index === activeSession.queue.length - 1 ? "Review session" : answer.selected !== null ? "Next question →" : "Skip for now →"}</button></div></article></div><button class="mobile-calc-fab" id="mobile-calc-fab" type="button" aria-label="Open JAMB Calculator" title="JAMB Calculator"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg><span>Calculator</span></button></section>`;
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
  activeSession.index = index; activeSession.questionStartedAt = Date.now(); saveActiveSession(); render();
}

function selectAnswer(selected) {
  const answer = activeSession.answers[activeSession.index];
  if (answer.confirmed) return;
  const question = activeSession.queue[activeSession.index];
  answer.selected = selected;
  saveActiveSession();
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
  saveActiveSession();
  const attemptSubject = question.subject || activeSession?.subject || "general";
  const attemptTopic = question.topic || question.section || activeSession?.topic || "";
  const attempt = { questionId: question.id, subject: attemptSubject, topic: attemptTopic, correct, selected, timestamp: Date.now(), durationMs: Date.now() - activeSession.questionStartedAt, clientId: crypto.randomUUID(), sessionId: activeSession.remoteId, synced: false };
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

function recordCompletedSessionToHistory(session) {
  if (!session || session.recordedToLocalHistory) return;
  const answered = session.answers ? session.answers.filter(item => item.confirmed || item.selected !== null).length : 0;
  if (answered === 0) return;
  session.recordedToLocalHistory = true;
  const correct = typeof session.correct === "number" ? session.correct : (session.answers ? session.answers.filter(item => item.correct).length : 0);
  const total = session.queue ? session.queue.length : answered;
  const score = total ? Math.round((correct / total) * 100) : 0;
  const completedRecord = {
    id: session.remoteId || `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    focus: session.isUniversity
      ? `${session.subject} · ${session.topic || "Practice"}`
      : (session.topic ? `${subjectName(session.subject)} · ${session.topic}` : (subjectName(session.subject) || "General Practice")),
    subject: session.subject || "general",
    topic: session.topic || "",
    score,
    correct,
    answered,
    total,
    completed_at: new Date().toISOString(),
    duration_minutes: session.durationMinutes || 0,
    mode: session.mode || "normal",
    mode_label: session.mode === "timed" ? "Timed Practice" : (session.mode === "sprint" ? "Daily Sprint" : (session.mode === "challenge" ? "Friend Challenge" : "Guided Practice")),
    isUniversity: Boolean(session.isUniversity)
  };
  completedTests = [completedRecord, ...completedTests.filter(t => t.id !== completedRecord.id)].slice(0, 100);
  put("meta", { key: "completed_tests", list: completedTests }).catch(() => {});
  if (profile) {
    profile.tests = {
      tests_taken: completedTests.length,
      average_score: Math.round(completedTests.reduce((s, t) => s + (Number(t.score) || 0), 0) / completedTests.length)
    };
    put("profile", profile).catch(() => {});
  }
}

function finishNormalSession() {
  recordCompletedSessionToHistory(activeSession);
  activeSession.finished = true;
  clearActiveSession();
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
  clearActiveSession();
  syncPendingAttempts();
  if (timedOut) {
    showConfirmDialog({ title: "Time’s up.", message: "Your study time has ended. Selected answers have been recorded; questions without a selection remain unanswered.", confirmLabel: "View results", tone: "timeup", dismissible: false, onConfirm: () => { activeSession.timeUpAcknowledged = true; render(); } });
  } else {
    render();
  }
}

async function syncAttemptRecord(attempt) {
  if (!authToken || attempt.synced || activeSession?.isUniversity || String(attempt.questionId || "").startsWith("ana201-")) return;
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
    const canonical = remote.attempts.map(item => ({
      questionId: item.question_id,
      subject: item.subject,
      topic: item.topic || questionById(item.question_id)?.topic || "",
      correct: item.is_correct,
      selected: item.selected_index,
      timestamp: new Date(item.answered_at).getTime(),
      durationMs: item.duration_ms,
      clientId: item.client_id,
      synced: true
    }));
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

  recordCompletedSessionToHistory(activeSession);

  let topicBreakdownHtml = "";
  const isUniSession = Boolean(activeSession.isUniversity);
  const userHasSessionAccess = hasCourseAccess(activeSession.subject);

  if (activeSession.isMixed && userHasSessionAccess) {
    const topicStats = new Map();
    activeSession.queue.forEach((q, idx) => {
      const topicName = q.topic || "Course Topic";
      if (!topicStats.has(topicName)) {
        topicStats.set(topicName, { total: 0, correct: 0 });
      }
      const st = topicStats.get(topicName);
      st.total++;
      if (activeSession.answers[idx]?.correct) {
        st.correct++;
      }
    });

    const rows = Array.from(topicStats.entries()).map(([tName, st]) => {
      const pct = st.total ? Math.round(st.correct / st.total * 100) : 0;
      const tone = pct >= 80 ? "good" : pct >= 50 ? "fair" : "low";
      return `<div class="uni-result-topic-row">
        <div class="uni-result-topic-info">
          <strong>${escapeHtml(tName)}</strong>
          <span>${st.correct} of ${st.total} correct</span>
        </div>
        <div class="uni-result-topic-meter">
          <div class="uni-result-topic-bar"><span style="width:${pct}%" class="${tone}"></span></div>
          <span class="uni-result-topic-pct ${tone}">${pct}%</span>
        </div>
      </div>`;
    }).join("");

    topicBreakdownHtml = `<div class="uni-result-breakdown">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">Performance by Topic</p>
          <h2>Topic Mastery Breakdown</h2>
        </div>
        <p>Review which areas need focused study</p>
      </div>
      <div class="uni-result-topic-list">${rows}</div>
    </div>`;
  } else if (isUniSession && !userHasSessionAccess) {
    topicBreakdownHtml = `<div class="uni-result-breakdown locked-teaser">
      <div class="section-head compact" style="margin-bottom:12px">
        <div>
          <p class="eyebrow"><span class="teaser-lock-badge">PRO ANALYTICS</span></p>
          <h2>Topic Mastery &amp; Weak-Area Diagnostic</h2>
        </div>
      </div>
      <div class="uni-result-teaser-container">
        <div class="uni-result-topic-list blurred" aria-hidden="true">
          <div class="uni-result-topic-row">
            <div class="uni-result-topic-info"><strong>High-Yield Anatomy / Physiology Diagnostic</strong><span>3 of 8 correct</span></div>
            <div class="uni-result-topic-meter"><div class="uni-result-topic-bar"><span style="width:37%" class="low"></span></div><span class="uni-result-topic-pct low">37%</span></div>
          </div>
          <div class="uni-result-topic-row">
            <div class="uni-result-topic-info"><strong>Clinical Scenarios &amp; Mechanisms</strong><span>7 of 10 correct</span></div>
            <div class="uni-result-topic-meter"><div class="uni-result-topic-bar"><span style="width:70%" class="fair"></span></div><span class="uni-result-topic-pct fair">70%</span></div>
          </div>
          <div class="uni-result-topic-row">
            <div class="uni-result-topic-info"><strong>Weak Topic Priority Focus</strong><span>2 of 7 correct</span></div>
            <div class="uni-result-topic-meter"><div class="uni-result-topic-bar"><span style="width:28%" class="low"></span></div><span class="uni-result-topic-pct low">28%</span></div>
          </div>
        </div>
        <div class="uni-result-teaser-overlay">
          <span class="teaser-icon">🔒</span>
          <h3>Unlock Your Weak Topics</h3>
          <p>Review full performance diagnostics across all topics to target exactly what to revise before exams.</p>
          <button type="button" class="button accent" id="teaser-upgrade-btn">Unlock Full Access</button>
        </div>
      </div>
    </div>`;
  }

  const review = activeSession.answers.map((answer, index) => {
    const question = activeSession.queue[index];
    if (!answer.confirmed) return "";
    const topicTag = (activeSession.isMixed && question.topic) ? `<span class="result-topic-tag">${escapeHtml(question.topic)}</span>` : "";
    return `<article class="result-review-item ${answer.correct ? "correct" : "incorrect"}">
      <div><span>Question ${index + 1}${topicTag}</span><strong>${answer.correct ? "Correct" : "Review"}</strong></div>
      <p>${renderMath(escapeHtml(question.text))}</p>
      <small>Your answer: ${escapeHtml(question.options[answer.selected] || "—")}</small>
      ${answer.correct ? "" : `<small>Correct answer: ${escapeHtml(question.options[question.correct] || "—")}</small>`}
      ${renderExplanation(question)}
    </article>`;
  }).join("");

  const returnLabel = activeSession.isUniversity ? "Back to Course" : "Choose another topic";
  const retryLabel = activeSession.isUniversity ? "Practise again" : "Practise this again";
  const content = `<section class="page page-narrow">
    <div class="session-result">
      <p class="eyebrow">${activeSession.timedOut ? "Time expired" : "Session complete"}</p>
      <div class="result-score">${score}%</div>
      <h2>${activeSession.correct} of ${activeSession.queue.length} correct</h2>
      <p class="lede" style="margin-inline:auto">${note}</p>
      <div class="result-meta">
        <span>${answered} answered</span>
        <span>${unanswered} unanswered</span>
        <span>${activeSession.mode === "normal" ? "Untimed practice" : `${activeSession.durationMinutes} minute timer`}</span>
      </div>
      <div class="button-row" style="justify-content:center;margin-top:28px">
        <button class="button outline" id="return-practice">${returnLabel}</button>
        ${activeSession.mode === "sprint" ? "" : `<button class="button" id="retry-session">${retryLabel}</button>`}
      </div>
    </div>
    ${topicBreakdownHtml}
    ${review ? `<div class="result-review"><div class="section-head"><h2>Solutions</h2><p>Review every recorded answer</p></div>${review}</div>` : ""}
  </section>`;
  app.innerHTML = shell(content); bindShell();
  bindQuestionMedia();
  const sessionCopy = { ...activeSession };
  document.querySelector("#teaser-upgrade-btn")?.addEventListener("click", () => {
    api.logMonetizationEvent(authToken, "analytics_teaser_viewed", { course: activeSession?.subject }).catch(() => {});
    showUpgradeModal({ trigger: "result_analytics_teaser", courseCode: activeSession?.subject });
  });
  document.querySelector("#return-practice").addEventListener("click", () => {
    const wasUni = sessionCopy.isUniversity;
    activeSession = null;
    route = wasUni ? "university" : "practice";
    render();
  });
  document.querySelector("#retry-session")?.addEventListener("click", () => {
    if (sessionCopy.isUniversity) {
      if (sessionCopy.isMixed && sessionCopy.courseData) {
        startUniMixedPractice(sessionCopy.courseData, sessionCopy.requestedCount, sessionCopy.durationMinutes);
      } else {
        startUniPractice(sessionCopy.subject, sessionCopy.topic, sessionCopy.dataFile, sessionCopy.requestedCount, sessionCopy.durationMinutes);
      }
    } else {
      startSession(sessionCopy.subject, sessionCopy.topic, sessionCopy.requestedCount, sessionCopy.durationMinutes, sessionCopy.mode);
    }
  });
}

function renderChallengeSubmission() {
  const result = activeSession.challengeResult;
  const shareBtn = result?.results_unlocked ? `<button class="button outline challenge-share-btn" id="share-submission-win"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg><span>Share Win</span></button>` : "";
  const content = result ? `<section class="page page-narrow"><div class="challenge-submitted"><span class="submission-mark"><i></i><i></i><i></i></span><p class="eyebrow">Challenge submitted</p><h1>${escapeHtml(activeSession.challengeTitle)}</h1><div class="submitted-score"><strong>${result.my_result?.correct ?? activeSession.correct}<small> / ${result.question_count}</small></strong><span>${result.my_result?.accuracy ?? Math.round(activeSession.correct / result.question_count * 100)}% accuracy</span></div><p class="lede">${result.results_unlocked ? "The private group result is ready. See how everyone progressed and the recognition each participant earned." : "Your work is recorded. Other scores remain hidden until everyone finishes or the challenge deadline passes."}</p><div class="button-row"><button class="button" id="view-challenge-result">${result.results_unlocked ? "View group result" : "Return to challenges"} →</button>${shareBtn}<button class="button outline" data-route="home">Return home</button></div></div></section>` : `<section class="page page-narrow"><div class="challenge-submitted sending"><span class="submission-mark"><i></i><i></i><i></i></span><p class="eyebrow">Securing your paper</p><h1>Submitting your challenge.</h1><p class="lede">Your confirmed answers are being synchronized before the result is sealed.</p></div></section>`;
  app.innerHTML = shell(content); bindShell();
  document.querySelector("#view-challenge-result")?.addEventListener("click", () => { challengesData = challengesData ? challengesData.map(item => item.id === result.id ? result : item) : [result]; selectedChallengeId = result.id; activeSession = null; route = "challenges"; renderChallenges(); });
  document.querySelector("#share-submission-win")?.addEventListener("click", () => openChallengeShareModal(result));
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

function getSynthesizedProgressData() {
  const remoteTests = Array.isArray(progressData?.tests?.recent_tests) ? progressData.tests.recent_tests : [];
  const testMap = new Map();
  remoteTests.forEach(t => {
    testMap.set(String(t.id), {
      id: String(t.id),
      focus: t.focus || "Practice",
      score: Number(t.score) || 0,
      correct: Number(t.correct) || 0,
      answered: Number(t.answered) || Number(t.total) || 0,
      total: Number(t.total) || 0,
      completed_at: t.completed_at || new Date().toISOString(),
      duration_minutes: t.duration_minutes || 0,
      mode: t.mode || "normal",
      mode_label: t.mode_label || "Practice"
    });
  });

  completedTests.forEach(t => {
    const key = String(t.id);
    if (!testMap.has(key)) {
      testMap.set(key, {
        id: key,
        focus: t.focus || "Practice",
        score: Number(t.score) || 0,
        correct: Number(t.correct) || 0,
        answered: Number(t.answered) || Number(t.total) || 0,
        total: Number(t.total) || 0,
        completed_at: t.completed_at || new Date().toISOString(),
        duration_minutes: t.duration_minutes || 0,
        mode: t.mode || "normal",
        mode_label: t.mode_label || (t.mode === "timed" ? "Timed Practice" : "Guided Practice")
      });
    }
  });

  let allTests = Array.from(testMap.values()).sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

  // If student has answered questions in practice but no formal test session was completed yet,
  // synthesize a first practice summary so they immediately see live progress charts!
  if (allTests.length === 0 && attempts.length > 0) {
    const correctCount = attempts.filter(a => a.correct).length;
    const scorePct = Math.round((correctCount / attempts.length) * 100);
    const lastAttempt = attempts[attempts.length - 1];
    const subjTitle = subjectName(lastAttempt?.subject || "General");
    allTests.push({
      id: "synthetic-initial-practice",
      focus: `${subjTitle} · Guided Practice`,
      score: scorePct,
      correct: correctCount,
      answered: attempts.length,
      total: attempts.length,
      completed_at: new Date(lastAttempt?.timestamp || Date.now()).toISOString(),
      duration_minutes: 0,
      mode: "normal",
      mode_label: "Guided Practice"
    });
  }

  const scores = allTests.map(t => t.score);
  const testsTaken = allTests.length;
  const avgScore = testsTaken ? Math.round(scores.reduce((a, b) => a + b, 0) / testsTaken) : 0;
  const bestScore = testsTaken ? Math.max(...scores) : 0;

  const newest = scores.slice(0, 3);
  const previous = scores.slice(3, 6);
  const improvement = (newest.length === 3 && previous.length === 3)
    ? Math.round((newest.reduce((a, b) => a + b, 0) / 3) - (previous.reduce((a, b) => a + b, 0) / 3))
    : null;

  const modeGroups = {};
  allTests.forEach(t => {
    const m = t.mode || "normal";
    if (!modeGroups[m]) modeGroups[m] = { count: 0, totalScore: 0, label: t.mode_label || m };
    modeGroups[m].count++;
    modeGroups[m].totalScore += t.score;
  });
  const byMode = Object.entries(modeGroups).map(([mode, data]) => ({
    mode,
    label: data.label,
    count: data.count,
    average_score: Math.round(data.totalScore / data.count)
  }));

  const trend = allTests.slice(0, 8).reverse().map(t => ({
    focus: t.focus,
    score: t.score,
    completed_at: t.completed_at
  }));

  // Build Subjects & Topics comprehensively from attempts + remote
  const subjectMap = new Map();
  const topicMap = new Map();

  // 1. Populate from remote progressData if present
  (progressData?.subjects || []).forEach(s => {
    subjectMap.set(s.name, { name: s.name, total: Number(s.total) || 0, correct: Number(s.correct) || 0 });
  });
  (progressData?.topics || []).forEach(t => {
    topicMap.set(t.name, { name: t.name, subject: t.subject || "Course", total: Number(t.total) || 0, correct: Number(t.correct) || 0 });
  });

  // 2. Aggregate local attempts (whether synced or unsynced, university or aspirant)
  attempts.forEach(att => {
    const rawSubj = att.subject || "general";
    const displayName = subjectName(rawSubj);
    
    // If backend hasn't provided this subject, or if backend count is 0, initialize
    if (!subjectMap.has(displayName)) {
      subjectMap.set(displayName, { name: displayName, total: 0, correct: 0 });
    }
    const sObj = subjectMap.get(displayName);
    const backendSubjectTotal = (progressData?.subjects || []).find(s => s.name === displayName)?.total || 0;
    // Count local attempt if it's unsynced OR if backend has 0 recorded for this subject
    if (!att.synced || backendSubjectTotal === 0) {
      sObj.total++;
      if (att.correct) sObj.correct++;
    }

    const questionObj = questionById(att.questionId);
    let tName = att.topic ? String(att.topic).trim() : (questionObj?.topic ? String(questionObj.topic).trim() : "");
    if (!tName && att.questionId) {
      const parts = String(att.questionId).split("-");
      if (parts.length >= 2) {
        tName = parts[1].replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      }
    }

    if (tName) {
      if (!topicMap.has(tName)) {
        topicMap.set(tName, { name: tName, subject: rawSubj, total: 0, correct: 0 });
      }
      const tObj = topicMap.get(tName);
      const backendTopicTotal = (progressData?.topics || []).find(t => t.name === tName)?.total || 0;
      if (!att.synced || backendTopicTotal === 0) {
        tObj.total++;
        if (att.correct) tObj.correct++;
      }
    }
  });

  const subjectsList = Array.from(subjectMap.values())
    .filter(s => s.total > 0)
    .map(s => ({
      name: s.name,
      total: s.total,
      correct: s.correct,
      accuracy: Math.round((s.correct / s.total) * 100)
    }));

  const topicsList = Array.from(topicMap.values())
    .filter(t => t.total > 0)
    .map(t => ({
      name: t.name,
      subject: t.subject,
      total: t.total,
      correct: t.correct,
      accuracy: Math.round((t.correct / t.total) * 100)
    }));

  const totalAttempts = Math.max(progressData?.stats?.total_attempts || 0, attempts.length);
  const correctAttempts = attempts.filter(a => a.correct).length;
  const overallAcc = attempts.length ? Math.round((correctAttempts / attempts.length) * 100) : (progressData?.stats?.accuracy || 0);

  return {
    tests: {
      tests_taken: testsTaken,
      average_score: avgScore,
      best_score: bestScore,
      improvement,
      completion_rate: testsTaken ? 100 : 0,
      questions_in_tests: allTests.reduce((sum, t) => sum + (Number(t.answered) || Number(t.total) || 0), 0),
      trend,
      by_mode: byMode,
      recent_tests: allTests.slice(0, 10)
    },
    subjects: subjectsList,
    topics: topicsList,
    stats: {
      total_attempts: totalAttempts,
      accuracy: overallAcc
    }
  };
}

function renderProgress() {
  if (authToken && !progressData && !progressDataLoading) {
    loadProgress();
  }
  if (!progressData && !completedTests.length && !attempts.length) {
    app.innerHTML = shell(`<section class="page"><p class="eyebrow">Progress</p><h1>Your test record.</h1><p class="lede">Preparing completed papers, score trends and subject analysis.</p><div class="progress-loading"><i></i><i></i><i></i></div></section>`);
    bindShell(); loadProgress(); return;
  }
  const xp = xpState();
  const data = getSynthesizedProgressData();
  const tests = data.tests;
  const movement = tests.improvement === null ? "Building" : `${tests.improvement >= 0 ? "+" : ""}${tests.improvement}`;
  const hasAnyActivity = data.stats.total_attempts > 0 || tests.tests_taken > 0;
  const zeroStateHtml = !hasAnyActivity ? `
    <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-lg); padding:36px 20px; text-align:center; margin-bottom:28px;">
      <div style="width:60px; height:60px; margin:0 auto 16px; border-radius:50%; background:var(--forest-soft); color:var(--forest); display:grid; place-items:center;">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </div>
      <h2 style="font-family:var(--serif); font-size:24px; margin:0 0 8px; color:var(--ink);">Your Performance Diagnostics are Ready</h2>
      <p style="color:var(--muted); max-width:460px; margin:0 auto 20px; font-size:13.5px; line-height:1.5;">Answer questions in Practice mode, try a Timed Mock Exam, or take a Daily Sprint. Your subject mastery, topic diagnostics, and score trajectory will update here automatically.</p>
      <button class="button" data-route="practice">Start Practice Now →</button>
    </div>
  ` : "";

  const content = `<section class="page progress-page">
    <p class="eyebrow">Insights & Diagnostics</p>
    <h1>Your test record.</h1>
    <p class="lede">Completed papers lead the analysis. Individual answers remain available as supporting evidence.</p>
    ${zeroStateHtml}
    <div class="metric-strip four test-metrics">
      <div class="metric"><strong>${tests.tests_taken}</strong><span>tests taken</span></div>
      <div class="metric"><strong>${tests.average_score}%</strong><span>average test score</span></div>
      <div class="metric"><strong>${tests.best_score}%</strong><span>best test score</span></div>
      <div class="metric ${tests.improvement !== null && tests.improvement >= 0 ? "xp-metric" : ""}"><strong>${movement}${tests.improvement === null ? "" : "<small> pts</small>"}</strong><span>recent movement</span></div>
    </div>
    <div class="test-analysis-grid">
      <section class="report-panel test-trend">
        <div class="section-head compact"><div><p class="eyebrow">Last ${tests.trend.length} tests</p><h2>Score movement</h2></div><p>${tests.completion_rate}% completion rate</p></div>
        ${tests.trend.length ? `<div class="trend-bars">${tests.trend.map((item, index) => `<div title="${escapeHtml(item.focus)} · ${item.score}%"><span style="height:${Math.max(4, item.score)}%"></span><small>${index + 1}</small></div>`).join("")}</div>` : '<div class="empty">Your score movement will appear after your first completed test.</div>'}
      </section>
      <section class="report-panel">
        <div class="section-head compact"><div><p class="eyebrow">Test formats</p><h2>How you practise</h2></div></div>
        <div class="test-mode-list">${tests.by_mode.length ? tests.by_mode.map(item => `<div><span><strong>${escapeHtml(item.label)}</strong><small>${item.count} test${item.count === 1 ? "" : "s"}</small></span><b>${item.average_score}%</b></div>`).join("") : '<div class="empty">No completed formats yet.</div>'}</div>
      </section>
    </div>
    <div class="section-head"><h2>Test history</h2><p>${tests.questions_in_tests} questions answered within completed tests</p></div>
    <div class="test-history">${tests.recent_tests.length ? tests.recent_tests.map(item => `<article><time>${new Date(item.completed_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</time><div><strong>${escapeHtml(item.focus)}</strong><small>${escapeHtml(item.mode_label)} · ${item.answered}/${item.total} answered</small></div><span>${item.score}%</span></article>`).join("") : '<div class="empty">Complete a test and it will appear here.</div>'}</div>
    <div class="section-head"><h2>Academic detail</h2><p>${data.stats.total_attempts} individual answers recorded</p></div>
    <div class="report-grid">
      <div class="report-panel">
        <h3>Subject & Course Performance</h3>
        ${data.subjects.map(item => `<div class="report-row"><span>${escapeHtml(item.name)}<small>${item.total} answer${item.total === 1 ? "" : "s"}</small></span><strong>${item.accuracy}%</strong></div>`).join("") || '<div class="empty">No subject or course results yet.</div>'}
      </div>
      <div class="report-panel">
        <h3>Topics Needing Attention</h3>
        ${data.topics.filter(item => item.total >= 1).sort((a, b) => a.accuracy - b.accuracy).slice(0, 8).map(item => `<div class="report-row"><span>${escapeHtml(item.name)}<small>${subjectName(item.subject)} · ${item.total} answers</small></span><strong class="${item.accuracy < 50 ? "attention" : ""}">${item.accuracy}%</strong></div>`).join("") || '<div class="empty">Complete questions in any topic to identify focus areas.</div>'}
      </div>
    </div>
    <div class="supporting-stat"><span>Supporting activity</span><strong>${data.stats.total_attempts} questions answered · ${data.stats.accuracy}% answer accuracy · ${xp.xp} XP</strong></div>
  </section>`;
  app.innerHTML = shell(content); bindShell();
}

async function loadProgress() {
  if (progressDataLoading) return;
  progressDataLoading = true;
  try {
    progressData = await api.progress(authToken);
    applyRemoteStats(progressData.stats);
    await put("profile", profile);
    if (route === "progress") renderProgress();
  } catch { if (route === "progress" && !completedTests.length && !attempts.length) showToast("Test analysis could not be loaded"); }
  finally { progressDataLoading = false; }
}

function renderProfile(filter = "") {
  const normalized = filter.trim().toLowerCase();
  const matches = FAQS.filter(item => !normalized || `${item.q} ${item.a} ${item.group}`.toLowerCase().includes(normalized));
  const groups = [...new Set(matches.map(item => item.group))];
  const xp = xpState();
  const testStats = profile.tests || { tests_taken: 0, average_score: 0 };
  const joined = currentUser?.date_joined ? new Date(currentUser.date_joined).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "—";
  const content = `<section class="page profile-page"><div class="profile-hero"><div class="profile-avatar-wrap" id="profile-avatar-trigger" role="button" tabindex="0" title="Click to customize your avatar">${renderAvatarMarkup(profile.avatar, 86)}<span class="profile-avatar-edit-badge" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span></div><div><p class="eyebrow">Student profile</p><h1>${escapeHtml(currentUser?.username || profile.name)}</h1><p>${escapeHtml(currentUser?.email || profile.email)} · Member since ${joined}</p></div><button class="button outline" id="refresh-account">Refresh account</button></div><div class="profile-grid"><section class="profile-card identity-card"><span class="card-label">Student ID</span><strong>${escapeHtml(currentUser?.public_id || "—")}</strong><p>${currentUser?.phone_number ? `Phone: <strong>${escapeHtml(currentUser.phone_number)}</strong> · ` : ""}Share your ID for challenges or connect in <a href="#" data-route="buddies" style="text-decoration:underline; font-weight:600;">Buddies</a>.</p></section><section class="profile-card level-card"><span class="card-label">Level ${xp.level}</span><strong>${xp.xp} <small>XP</small></strong><div class="xp-track light"><i style="width:${xp.percent}%"></i></div><p>${xp.remaining} XP until level ${xp.level + 1}</p></section></div><div class="metric-strip four profile-metrics"><div class="metric"><strong>${attempts.length}</strong><span>answers recorded</span></div><div class="metric"><strong>${accuracy()}%</strong><span>overall accuracy</span></div><div class="metric streak-metric"><strong>${profile.rhythm || 0}<small> days</small></strong><span>current streak</span></div><div class="metric"><strong>${profile.bestRhythm || 0}<small> days</small></strong><span>best streak</span></div></div><div class="section-head"><h2>Academic Portals & Registrations</h2><p>Your enrollment across student portals</p></div><div class="uni-quick-grid" style="margin-bottom:28px;"><div class="uni-portal-status-card"><div><div class="uni-dept-svg-mark anatomy"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg></div><strong>Aspirants Portal</strong><p>${hasAspirantProfile() ? `Registered for ${(currentUser?.aspirant_profile?.exam_type || "JAMB").toUpperCase()} ${currentUser?.aspirant_profile?.target_year || ""}` : "Not registered yet. Required for JAMB & SSCE practice."}</p></div><button class="button ${hasAspirantProfile() ? 'outline' : 'accent'} small" id="profile-manage-aspirant">${hasAspirantProfile() ? "Update Exam Details" : "Register for Aspirants Portal →"}</button></div><div class="uni-portal-status-card"><div><div class="uni-dept-svg-mark physiology"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M4 18h16M4 10h16M12 3L2 8h20z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/></svg></div><strong>University Portal</strong><p>${hasUniversityProfile() ? `Enrolled at ${escapeHtml(currentUser?.university_profile?.university_name || "")} · ${escapeHtml(currentUser?.university_profile?.department || "")} (${currentUser?.university_profile?.level || 200}L)` : "Not registered yet. Required for undergraduate course banks."}</p></div><button class="button ${hasUniversityProfile() ? 'outline' : 'accent'} small" id="profile-manage-university">${hasUniversityProfile() ? "Update University Details" : "Register for University Portal →"}</button></div></div>${renderAchievementSummary()}<div class="section-head"><h2>Subject record</h2><p>Synchronized account history</p></div><div class="profile-subjects">${SUBJECTS.map(subject => { const stat = subjectStats(subject.id); return `<article><span>${subject.name}</span><strong>${stat.count ? `${stat.accuracy}%` : "—"}</strong><small>${stat.count} answer${stat.count === 1 ? "" : "s"}</small></article>`; }).join("")}</div><section class="settings-panel"><p class="eyebrow">Account data</p><h2>Portable, private and recoverable.</h2><p class="lede">The server keeps the authoritative account record. This device stores an offline copy and queues answers whenever the connection drops.</p><div class="button-row"><button class="button" id="export-data">Export backup</button><label class="button outline" for="import-data">Import backup</label><input class="file-input" id="import-data" type="file" accept="application/json"><button class="button outline" id="clear-cache">Refresh device cache</button><button class="button danger" id="sign-out">Sign out</button></div></section><section class="settings-panel guide-section"><p class="eyebrow">Guide and support</p><h2>Answers, without the noise.</h2><p class="lede">Quick guidance about practice, progress and account data.</p><div class="search-wrap"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg><input type="search" id="faq-search" value="${escapeHtml(filter)}" placeholder="Search help topics" aria-label="Search help topics"></div><div id="faq-results">${groups.length ? groups.map(group => `<section class="faq-group"><h3>${group}</h3>${matches.filter(item => item.group === group).map(item => `<div class="faq-item"><button class="faq-question" aria-expanded="false"><span>${item.q}</span><span aria-hidden="true">+</span></button><div class="faq-answer">${item.a}</div></div>`).join("")}</section>`).join("") : '<div class="empty">No help entries match that search.</div>'}</div></section></section>`;
  app.innerHTML = shell(content);
  const profileMetrics = document.querySelectorAll(".profile-metrics .metric");
  if (profileMetrics[0]) profileMetrics[0].innerHTML = `<strong>${testStats.tests_taken}</strong><span>tests taken</span>`;
  if (profileMetrics[1]) profileMetrics[1].innerHTML = `<strong>${testStats.average_score}%</strong><span>average test score</span>`;
  bindShell(); bindProfile();
  document.querySelector("#profile-avatar-trigger")?.addEventListener("click", () => {
    openAvatarPickerModal(() => renderProfile(filter));
  });
  document.querySelector("#profile-avatar-trigger")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAvatarPickerModal(() => renderProfile(filter));
    }
  });
  document.querySelector("#profile-manage-aspirant")?.addEventListener("click", () => {
    showAspirantRegistrationModal(() => renderProfile(filter));
  });
  document.querySelector("#profile-manage-university")?.addEventListener("click", () => {
    showUniversityRegistrationModal(() => renderProfile(filter));
  });
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
  return `<section class="challenge-composer"><div class="composer-intro"><p class="eyebrow">Create a private challenge</p><h2>Set the paper. Invite your people.</h2><p>Everyone receives the same frozen question set. Each accepted friend gets one timed attempt inside your chosen window.</p></div><form id="challenge-form"><div class="challenge-form-grid"><div class="field"><label for="challenge-title">Challenge title</label><input id="challenge-title" name="title" maxlength="100" value="Weekend study circle" required></div><div class="field"><label for="challenge-subject">Focus</label><select id="challenge-subject" name="subject"><option value="all">All subjects</option>${SUBJECTS.map(subject => `<option value="${subject.id}">${subject.name}</option>`).join("")}</select></div><div class="field"><label for="challenge-count">Questions</label><input id="challenge-count" name="question_count" type="number" min="10" max="100" value="20" required></div><div class="field"><label for="challenge-duration">Timer in minutes</label><input id="challenge-duration" name="duration_minutes" type="number" min="1" max="180" value="20" required></div><div class="field"><label for="challenge-start">Opens</label><input id="challenge-start" name="starts_at" type="datetime-local" value="${localDateTimeValue(starts)}" required></div><div class="field"><label for="challenge-end">Completion deadline</label><input id="challenge-end" name="ends_at" type="datetime-local" value="${localDateTimeValue(ends)}" required></div></div><div class="field"><label for="challenge-message">Invitation note <span>optional</span></label><textarea id="challenge-message" name="message" maxlength="280" placeholder="A short note for the group"></textarea></div><div class="invite-builder"><label for="friend-id">Invite with Student ID or Buddies</label><div><input id="friend-id" maxlength="6" autocomplete="off" placeholder="e.g. A7B2Q9"><button class="button outline" type="button" id="add-friend">Add</button><button class="button outline" type="button" id="open-buddies-picker">From Buddies</button></div><small>Invite up to nine registered friends you know.</small><div class="invitee-list">${challengeInvitees.length ? challengeInvitees.map(item => `<span>${escapeHtml(item.username)} <small>${item.public_id}</small><button type="button" data-remove-invitee="${item.public_id}" aria-label="Remove ${escapeHtml(item.username)}">×</button></span>`).join("") : '<p>No friends added yet.</p>'}</div></div><div id="challenge-error" class="auth-error" role="alert"></div><div class="button-row"><button class="button" type="submit">Review challenge →</button><button class="button outline" type="button" id="close-composer">Cancel</button></div></form></section>`;
}

function renderChallengeDetail(item) {
  const statusCopy = item.results_unlocked ? "The group result is ready." : item.my_status === "completed" ? "Your paper is submitted. Group results unlock when everyone responds and finishes, or when the deadline passes." : item.state === "upcoming" ? `This challenge opens ${challengeTime(item.starts_at)}.` : item.state === "open" ? "Your attempt timer starts only when you confirm Begin challenge." : "This challenge window is closed.";
  const shareBtn = item.results_unlocked && item.results?.length ? `<button class="button challenge-share-btn" data-share-challenge="${item.id}" title="Share challenge win on social media"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg><span>Share Win</span></button>` : "";
  const myResult = item.my_result ? `<section class="my-challenge-result"><div class="my-challenge-result-top"><p class="eyebrow">Your work</p>${shareBtn}</div><strong>${item.my_result.correct}<small> / ${item.my_result.total}</small></strong><div><h3>${item.my_result.accuracy}% accuracy${item.my_result.bonus_xp ? ` · +${item.my_result.bonus_xp} challenge XP` : ""}</h3><p>${item.my_result.change_from_average === null ? "Your first personal comparison will appear after more practice." : item.my_result.change_from_average >= 0 ? `${item.my_result.change_from_average} points above your recent average.` : "Use the challenge review to choose your next focus."}</p></div></section>` : "";
  const resultBoard = item.results_unlocked && item.results.length ? `<section class="challenge-results"><div class="section-head"><div class="challenge-result-heading"><p class="eyebrow">Private group result</p><h2>Challenge Results</h2></div><div class="challenge-result-actions">${shareBtn}<p>Accuracy first. Time breaks ties only.</p></div></div>${item.results.map(row => `<article class="result-person ${row.public_id === currentUser.public_id ? "you" : ""}"><span class="result-position">${String(row.position).padStart(2, "0")}</span><div><h3>${escapeHtml(row.username)}${row.public_id === currentUser.public_id ? " · You" : ""}</h3><p>${escapeHtml(row.recognition)}${row.bonus_xp ? ` · +${row.bonus_xp} XP` : ""}</p></div><strong>${row.correct}/${row.total}<small>${row.accuracy}%</small></strong></article>`).join("")}</section>` : `<section class="results-quiet"><span class="quiet-lines"><i></i><i></i><i></i></span><h3>Scores stay quiet for now.</h3><p>${escapeHtml(statusCopy)}</p></section>`;
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
  document.querySelector("#toggle-challenge-composer")?.addEventListener("click", () => {
    if (!hasAllAccess()) {
      api.logMonetizationEvent(authToken, "upgrade_screen_viewed", { trigger: "create_challenge" }).catch(() => {});
      showUpgradeModal({ trigger: "create_challenge" });
      return;
    }
    challengeComposerOpen = !challengeComposerOpen;
    renderChallenges();
  });
  document.querySelector("#close-composer")?.addEventListener("click", () => { challengeComposerOpen = false; challengeInvitees = []; renderChallenges(); });
  document.querySelectorAll("[data-challenge-id]").forEach(button => button.addEventListener("click", () => { selectedChallengeId = button.dataset.challengeId; renderChallenges(); }));
  document.querySelector("#add-friend")?.addEventListener("click", addChallengeFriend);
  document.querySelector("#open-buddies-picker")?.addEventListener("click", showBuddiesPickerModal);
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
  document.querySelectorAll("[data-share-challenge]").forEach(button => button.addEventListener("click", () => openChallengeShareModal(item)));
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
    saveActiveSession();
    route = "session"; render();
  } catch (caught) { showToast(caught instanceof ApiError ? caught.message : caught.message); challengesData = null; renderChallenges(); }
}

async function generateChallengeShareCard(item) {
  const canvas = document.createElement("canvas");
  const width = 800;
  const height = 1000;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  function drawRoundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  // 1. Deep brand gradient background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#05201a");
  bgGrad.addColorStop(0.5, "#081d27");
  bgGrad.addColorStop(1, "#04141d");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Ambient radial glows
  const glow1 = ctx.createRadialGradient(700, 100, 10, 700, 100, 450);
  glow1.addColorStop(0, "rgba(16, 185, 129, 0.22)");
  glow1.addColorStop(1, "rgba(16, 185, 129, 0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, width, height);

  const glow2 = ctx.createRadialGradient(100, 900, 10, 100, 900, 400);
  glow2.addColorStop(0, "rgba(217, 119, 6, 0.16)");
  glow2.addColorStop(1, "rgba(217, 119, 6, 0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  // Outer border frame
  drawRoundRect(24, 24, width - 48, height - 48, 28);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 2. Header: Logo & Branding
  let logoDrawn = false;
  try {
    const logoImg = new Image();
    logoImg.crossOrigin = "anonymous";
    logoImg.src = "assets/seomtorch_logo.png";
    await new Promise(resolve => {
      if (logoImg.complete && logoImg.naturalWidth) return resolve();
      logoImg.onload = resolve;
      logoImg.onerror = resolve;
      setTimeout(resolve, 350);
    });
    if (logoImg.naturalWidth) {
      drawRoundRect(52, 52, 44, 44, 12);
      ctx.save();
      ctx.clip();
      ctx.drawImage(logoImg, 52, 52, 44, 44);
      ctx.restore();
      logoDrawn = true;
    }
  } catch {}

  if (!logoDrawn) {
    drawRoundRect(52, 52, 44, 44, 12);
    ctx.fillStyle = "#10b981";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 20px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("S", 74, 74);
  }

  // Brand Name & Subtitle
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 22px 'Plus Jakarta Sans', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("SEOMTORCH", 108, 64);

  ctx.fillStyle = "#fbbf24";
  ctx.font = "700 10.5px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("STUDY CIRCLE CHALLENGE", 108, 84);

  // Focus Category Pill at top right
  const pillText = (item.subject_label || "Exam Focus").toUpperCase();
  ctx.font = "700 11px 'Plus Jakarta Sans', sans-serif";
  const pillW = ctx.measureText(pillText).width + 24;
  const pillX = width - 52 - pillW;
  drawRoundRect(pillX, 56, pillW, 32, 16);
  ctx.fillStyle = "rgba(16, 185, 129, 0.2)";
  ctx.fill();
  ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#34d399";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(pillText, pillX + pillW / 2, 72);

  // Header Divider
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(52, 116);
  ctx.lineTo(width - 52, 116);
  ctx.stroke();

  // 3. Challenge Title & Format Info
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 30px 'Newsreader', 'Plus Jakarta Sans', serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  let title = item.title || "Study Circle Challenge";
  if (ctx.measureText(title).width > 680) {
    while (title.length > 5 && ctx.measureText(title + "...").width > 680) {
      title = title.slice(0, -1);
    }
    title += "...";
  }
  ctx.fillText(title, 52, 134);

  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.font = "500 13px 'DM Sans', sans-serif";
  ctx.fillText(`${item.question_count || 20} Questions · ${item.duration_minutes || 20} Min Timer · Shared Paper`, 52, 174);

  // 4. User Spotlight Box
  const myRow = item.results?.find(r => r.public_id === currentUser?.public_id) || item.my_result;
  const myPos = myRow?.position || 1;
  const myScore = myRow?.correct ?? item.my_result?.correct ?? 0;
  const myTotal = myRow?.total ?? item.my_result?.total ?? item.question_count ?? 20;
  const myAcc = myRow?.accuracy ?? item.my_result?.accuracy ?? Math.round((myScore / myTotal) * 100);
  const myXp = myRow?.bonus_xp ?? item.my_result?.bonus_xp ?? 0;

  const boxX = 52;
  const boxY = 210;
  const boxW = width - 104;
  const boxH = 205;

  drawRoundRect(boxX, boxY, boxW, boxH, 20);
  const boxGrad = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
  boxGrad.addColorStop(0, "rgba(16, 185, 129, 0.16)");
  boxGrad.addColorStop(1, "rgba(6, 38, 31, 0.65)");
  ctx.fillStyle = boxGrad;
  ctx.fill();
  ctx.strokeStyle = myPos === 1 ? "rgba(251, 191, 36, 0.6)" : "rgba(16, 185, 129, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Rank / Placement Tag
  let rankTag = "STUDY CIRCLE PARTICIPANT";
  let rankColor = "#34d399";
  if (myPos === 1) {
    rankTag = "🏆 1ST PLACE WINNER";
    rankColor = "#fbbf24";
  } else if (myPos === 2) {
    rankTag = "🥈 2ND PLACE FINISHER";
    rankColor = "#e2e8f0";
  } else if (myPos === 3) {
    rankTag = "🥉 3RD PLACE FINISHER";
    rankColor = "#fed7aa";
  } else if (myPos) {
    rankTag = `RANK #${myPos} IN CIRCLE`;
    rankColor = "#34d399";
  }

  ctx.font = "800 11px 'Plus Jakarta Sans', sans-serif";
  const rankW = ctx.measureText(rankTag).width + 20;
  drawRoundRect(boxX + 26, boxY + 22, rankW, 26, 13);
  ctx.fillStyle = myPos === 1 ? "rgba(251, 191, 36, 0.18)" : "rgba(16, 185, 129, 0.18)";
  ctx.fill();
  ctx.strokeStyle = myPos === 1 ? "rgba(251, 191, 36, 0.45)" : "rgba(16, 185, 129, 0.45)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = rankColor;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(rankTag, boxX + 36, boxY + 35);

  // User Name
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 24px 'Plus Jakarta Sans', sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(currentUser?.username || "Student", boxX + 26, boxY + 60);

  // Subtitle / Recognition
  const recog = myRow?.recognition || (myPos === 1 ? "Top accuracy & speed" : "Challenge completed");
  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.font = "500 13px 'DM Sans', sans-serif";
  ctx.fillText(recog, boxX + 26, boxY + 95);

  // Bonus XP badge if any
  if (myXp) {
    const xpText = `+${myXp} BONUS XP`;
    ctx.font = "800 11px 'Plus Jakarta Sans', sans-serif";
    const xpW = ctx.measureText(xpText).width + 18;
    drawRoundRect(boxX + 26, boxY + 128, xpW, 26, 13);
    ctx.fillStyle = "rgba(251, 191, 36, 0.18)";
    ctx.fill();
    ctx.fillStyle = "#fbbf24";
    ctx.textBaseline = "middle";
    ctx.fillText(xpText, boxX + 35, boxY + 141);
  }

  // Large Score on Right of Box
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 56px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(`${myScore}`, boxX + boxW - 84, boxY + 30);

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = "600 26px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(`/${myTotal}`, boxX + boxW - 28, boxY + 54);

  ctx.fillStyle = "#34d399";
  ctx.font = "700 18px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(`${myAcc}% Accuracy`, boxX + boxW - 28, boxY + 102);

  // 5. Group Leaderboard Section
  const boardY = 440;
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.font = "800 11px 'Plus Jakarta Sans', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("GROUP LEADERBOARD", 52, boardY);

  const results = item.results || [];
  const displayResults = results.slice(0, 5);
  const rowStartY = boardY + 24;
  const rowHeight = 58;

  displayResults.forEach((row, i) => {
    const curY = rowStartY + i * (rowHeight + 8);
    const isMe = row.public_id === currentUser?.public_id;

    drawRoundRect(52, curY, width - 104, rowHeight, 14);
    if (isMe) {
      ctx.fillStyle = "rgba(16, 185, 129, 0.16)";
      ctx.fill();
      ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Rank Medal / Number
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 15px 'Plus Jakarta Sans', sans-serif";
    if (row.position === 1) {
      ctx.fillStyle = "#fbbf24";
      ctx.fillText("🥇", 80, curY + rowHeight / 2);
    } else if (row.position === 2) {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText("🥈", 80, curY + rowHeight / 2);
    } else if (row.position === 3) {
      ctx.fillStyle = "#fed7aa";
      ctx.fillText("🥉", 80, curY + rowHeight / 2);
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.fillText(String(row.position).padStart(2, "0"), 80, curY + rowHeight / 2);
    }

    // Participant Name + Badge
    ctx.textAlign = "left";
    ctx.font = "700 15px 'Plus Jakarta Sans', sans-serif";
    ctx.fillStyle = isMe ? "#34d399" : "#ffffff";
    const nameX = 114;
    let dispName = row.username;
    while (dispName.length > 3 && ctx.measureText(dispName).width > 320) {
      dispName = dispName.slice(0, -1);
    }
    if (dispName !== row.username) dispName += "…";
    ctx.fillText(dispName, nameX, curY + 22);

    if (isMe) {
      const nameW = ctx.measureText(dispName).width;
      drawRoundRect(nameX + nameW + 8, curY + 12, 42, 18, 9);
      ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
      ctx.fill();
      ctx.fillStyle = "#34d399";
      ctx.font = "800 9px 'Plus Jakarta Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("YOU", nameX + nameW + 29, curY + 21);
    }

    // Recognition
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "500 11px 'DM Sans', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(row.recognition || "Completed", nameX, curY + 40);

    // Score on Right
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 15px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(`${row.correct}/${row.total}`, width - 126, curY + rowHeight / 2);

    // Accuracy pill
    const accText = `${row.accuracy}%`;
    ctx.font = "800 11px 'Plus Jakarta Sans', sans-serif";
    drawRoundRect(width - 114, curY + 16, 52, 26, 13);
    ctx.fillStyle = isMe ? "rgba(16, 185, 129, 0.22)" : "rgba(255, 255, 255, 0.08)";
    ctx.fill();
    ctx.fillStyle = isMe ? "#34d399" : "rgba(255, 255, 255, 0.8)";
    ctx.textAlign = "center";
    ctx.fillText(accText, width - 88, curY + 29);
  });

  if (results.length > 5) {
    const extraCount = results.length - 5;
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.font = "600 11.5px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`+ ${extraCount} more participant${extraCount === 1 ? "" : "s"} in study circle`, width / 2, rowStartY + 5 * (rowHeight + 8) + 6);
  }

  // 6. Footer & Watermark
  const footY = height - 88;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(52, footY);
  ctx.lineTo(width - 52, footY);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.font = "600 12.5px 'DM Sans', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Prepare with purpose · Challenge your circle", 52, footY + 36);

  ctx.fillStyle = "#34d399";
  ctx.font = "800 13px 'Plus Jakarta Sans', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("seomtorch.com", width - 52, footY + 36);

  const dataUrl = canvas.toDataURL("image/png");
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  return { canvas, dataUrl, blob };
}

function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function openChallengeShareModal(item) {
  document.querySelector("#challenge-share-dialog")?.remove();
  showToast("Generating share card…");

  const { dataUrl, blob } = await generateChallengeShareCard(item);

  const myRow = item.results?.find(r => r.public_id === currentUser?.public_id) || item.my_result;
  const myPos = myRow?.position;
  const posText = myPos === 1 ? "🏆 1st place" : myPos ? `Rank #${myPos}` : "completed";
  const scoreText = myRow ? `${myRow.correct}/${myRow.total} (${myRow.accuracy}%)` : "a high score";
  const shareText = `🏆 I scored ${scoreText} in the "${item.title}" challenge on Seomtorch (${posText})! Can you beat my score? Prepare with purpose on Seomtorch.`;
  const shareUrl = window.location.origin;

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + "\n" + shareUrl)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;

  const dialog = document.createElement("div");
  dialog.id = "challenge-share-dialog";
  dialog.className = "share-modal-backdrop";
  dialog.innerHTML = `
    <section class="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
      <div class="share-modal-header">
        <div>
          <p class="eyebrow">Share Challenge Win</p>
          <h2 id="share-modal-title">${escapeHtml(item.title)}</h2>
        </div>
        <button class="share-modal-close" aria-label="Close share dialog">×</button>
      </div>

      <div class="share-card-preview-wrap">
        <img src="${dataUrl}" alt="Challenge win card" class="share-card-preview-img" />
      </div>

      <div class="share-modal-actions">
        <button class="button share-primary-btn" id="btn-share-native">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          <span>Share Photo to Social</span>
        </button>
        <button class="button outline share-download-btn" id="btn-download-card">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Save Photo</span>
        </button>
        <button class="button outline share-copy-btn" id="btn-copy-share-text">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>Copy Text</span>
        </button>
      </div>

      <div class="share-social-row">
        <span class="share-social-label">Quick share:</span>
        <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" class="social-share-pill whatsapp" aria-label="Share to WhatsApp">
          WhatsApp
        </a>
        <a href="${twitterUrl}" target="_blank" rel="noopener noreferrer" class="social-share-pill twitter" aria-label="Share to X">
          X / Twitter
        </a>
        <a href="${telegramUrl}" target="_blank" rel="noopener noreferrer" class="social-share-pill telegram" aria-label="Share to Telegram">
          Telegram
        </a>
      </div>
    </section>
  `;

  document.body.appendChild(dialog);

  const close = () => {
    dialog.remove();
    document.removeEventListener("keydown", onKeyDown);
  };
  const onKeyDown = (e) => { if (e.key === "Escape") close(); };
  dialog.querySelector(".share-modal-close").addEventListener("click", close);
  dialog.addEventListener("click", (e) => { if (e.target === dialog) close(); });
  document.addEventListener("keydown", onKeyDown);

  const baseFileName = `seomtorch-${(item.title || "challenge").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-win.png`;

  // Native Web Share API
  dialog.querySelector("#btn-share-native").addEventListener("click", async () => {
    try {
      const file = new File([blob], baseFileName, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Challenge Win: ${item.title}`,
          text: shareText,
          files: [file]
        });
        showToast("Card shared successfully!");
      } else if (navigator.share) {
        await navigator.share({
          title: `Challenge Win: ${item.title}`,
          text: shareText,
          url: shareUrl
        });
        showToast("Shared successfully!");
      } else {
        triggerDownload(dataUrl, baseFileName);
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`).catch(() => {});
        showToast("Photo saved & message copied to clipboard!");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        triggerDownload(dataUrl, baseFileName);
        showToast("Photo saved to downloads!");
      }
    }
  });

  // Download Card Photo
  dialog.querySelector("#btn-download-card").addEventListener("click", () => {
    triggerDownload(dataUrl, baseFileName);
    showToast("Challenge card photo saved!");
  });

  // Copy Text
  dialog.querySelector("#btn-copy-share-text").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      showToast("Score & challenge text copied!");
    } catch {
      showToast("Unable to copy to clipboard");
    }
  });
}

// ── Study Buddies & Contacts ────────────────────────────────────────────────

function buddyInitials(name) {
  return (name || "").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "ST";
}

function whatsappInviteUrl(phone, text) {
  let clean = (phone || "").replace(/[^0-9]/g, "");
  if (clean.startsWith("0")) clean = "234" + clean.slice(1);
  const msg = text || `Hey! Join me on Seomtorch to practice past questions, track progress, and take timed challenges together. My Student ID is ${currentUser?.public_id || ""}: https://seomtorch.vercel.app`;
  return clean ? `https://wa.me/${clean}?text=${encodeURIComponent(msg)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
}

function smsInviteUrl(phone, text) {
  let clean = (phone || "").replace(/[^\+0-9]/g, "");
  const msg = text || `Join me on Seomtorch to study and take private challenges together! My Student ID is ${currentUser?.public_id || ""}: https://seomtorch.vercel.app`;
  return `sms:${clean}?body=${encodeURIComponent(msg)}`;
}

async function handleScanContacts(onComplete) {
  if (!("contacts" in navigator && "ContactsManager" in window)) {
    showToast("Contact picker is not available on this browser. Use manual search or share your invite link.");
    return;
  }
  try {
    buddiesLoading = true;
    if (route === "buddies") renderBuddies();
    const props = ["name", "tel", "email"];
    const contacts = await navigator.contacts.select(props, { multiple: true });
    if (!contacts || !contacts.length) {
      buddiesLoading = false;
      if (route === "buddies") renderBuddies();
      return;
    }
    await processContactsList(contacts);
    buddiesLoading = false;
    showToast(`Processed ${contacts.length} contact${contacts.length === 1 ? "" : "s"}`);
    if (onComplete) onComplete();
    else if (route === "buddies") renderBuddies();
  } catch (err) {
    buddiesLoading = false;
    if (route === "buddies") renderBuddies();
    if (err.name !== "AbortError") {
      showToast("Could not access contacts: " + (err.message || "Unknown error"));
    }
  }
}

async function processContactsList(contacts) {
  const phones = [];
  const emails = [];
  const contactMap = new Map();

  for (const c of contacts) {
    const name = c.name?.[0] || "";
    const cPhones = c.tel || [];
    const cEmails = c.email || [];
    for (const p of cPhones) {
      if (typeof p === "string" && p.trim()) {
        const clean = p.trim();
        phones.push(clean);
        contactMap.set("tel:" + clean, { name, tel: clean, email: cEmails[0] || "" });
      }
    }
    for (const e of cEmails) {
      if (typeof e === "string" && e.trim()) {
        const clean = e.trim().toLowerCase();
        emails.push(clean);
        contactMap.set("email:" + clean, { name, tel: cPhones[0] || "", email: clean });
      }
    }
  }

  try {
    const res = await api.matchContacts(authToken, phones, emails);
    const matchedUsers = res.matches || [];
    const matchedKeys = new Set();

    // Find and merge with saved buddies
    const currentSaved = getSavedBuddies();
    const savedIds = new Set(currentSaved.map(item => item.public_id));
    for (const m of matchedUsers) {
      if (!savedIds.has(m.public_id)) {
        currentSaved.push(m);
        savedIds.add(m.public_id);
      }
    }
    saveBuddies(currentSaved);

    // Identify non-registered contacts to invite
    const invites = [];
    const seenInviteKeys = new Set();
    for (const [key, contact] of contactMap.entries()) {
      if (!seenInviteKeys.has(key)) {
        seenInviteKeys.add(key);
        invites.push(contact);
      }
    }

    buddiesMatches = {
      onApp: currentSaved,
      invites: invites.slice(0, 50)
    };
  } catch (err) {
    showToast("Contact matching failed: " + (err.message || "Server error"));
  }
}

function renderBuddies() {
  const hasContactPicker = "contacts" in navigator && "ContactsManager" in window;
  const onApp = buddiesMatches?.onApp || [];
  const invites = buddiesMatches?.invites || [];
  const hasPhone = Boolean(currentUser?.phone_number);

  const phoneBanner = !hasPhone ? `
    <div class="buddies-phone-banner">
      <div class="buddies-banner-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      </div>
      <div class="buddies-banner-content">
        <strong>Link your phone number so your classmates can find you</strong>
        <p>When friends check their contacts on Seomtorch, they will see you as a study buddy.</p>
        <form id="form-link-phone" class="buddies-phone-form">
          <input type="tel" id="input-link-phone" placeholder="e.g. +2348012345678 or 080..." required>
          <button class="button small" type="submit">Link Phone</button>
        </form>
        <div id="phone-link-error" class="auth-error" style="margin-top:6px;"></div>
      </div>
    </div>
  ` : `
    <div class="buddies-phone-linked-pill">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <span>Linked Phone: <strong>${escapeHtml(currentUser.phone_number)}</strong></span>
      <button type="button" id="btn-edit-phone" class="button outline small" style="margin-left:auto; padding:4px 10px; font-size:11px;">Change</button>
    </div>
  `;

  const searchBox = `
    <div class="buddies-search-box ${buddiesSearchOpen ? "" : "collapsed"}" id="buddies-search-box">
      <div class="section-head" style="margin-bottom:12px;">
        <h2>Search by ID, Phone, or Email</h2>
        <p>Find registered friends or generate instant invite links</p>
      </div>
      <form id="form-manual-buddy-lookup" class="buddies-search-form">
        <input type="text" id="input-manual-lookup" placeholder="e.g. A7B2Q9, 08012345678, or friend@email.com" required>
        <button class="button" type="submit">Search / Check</button>
      </form>
      <div id="manual-lookup-result" class="manual-lookup-result"></div>
    </div>
  `;

  const onAppSection = onApp.length ? `
    <div class="section-head">
      <h2>Friends on Seomtorch (${onApp.length})</h2>
      <p>Tap Challenge to set a shared timed paper</p>
    </div>
    <div class="buddies-grid">
      ${onApp.map(buddy => `
        <article class="buddy-card">
          <span class="buddy-monogram">${buddyInitials(buddy.username)}</span>
          <div class="buddy-details">
            <h3>${escapeHtml(buddy.username)}</h3>
            <p>Student ID: <strong>${escapeHtml(buddy.public_id)}</strong></p>
          </div>
          <div class="buddy-card-actions">
            <button class="button small" data-challenge-buddy="${buddy.public_id}" data-buddy-name="${escapeHtml(buddy.username)}">Challenge →</button>
            <button class="button outline small" data-copy-buddy-id="${buddy.public_id}" title="Copy Student ID">Copy ID</button>
            <button class="remove-buddy-btn" data-remove-buddy="${buddy.public_id}" aria-label="Remove buddy" title="Remove from list">×</button>
          </div>
        </article>
      `).join("")}
    </div>
  ` : "";

  const invitesSection = invites.length ? `
    <div class="section-head">
      <h2>Contacts to Invite (${invites.length})</h2>
      <p>Invite your classmates to join your study circle</p>
    </div>
    <div class="buddies-grid invites">
      ${invites.map(c => `
        <article class="buddy-card invite-card">
          <span class="buddy-monogram invite">${buddyInitials(c.name)}</span>
          <div class="buddy-details">
            <h3>${escapeHtml(c.name || c.tel || c.email)}</h3>
            <p>${escapeHtml(c.tel || c.email || "Contact")}</p>
          </div>
          <div class="buddy-card-actions">
            ${c.tel ? `<a href="${whatsappInviteUrl(c.tel)}" target="_blank" rel="noopener noreferrer" class="button small whatsapp-invite-btn">WhatsApp</a>` : ""}
            ${c.tel ? `<a href="${smsInviteUrl(c.tel)}" class="button outline small">SMS</a>` : ""}
            ${c.email && !c.tel ? `<a href="mailto:${encodeURIComponent(c.email)}?subject=Study with me on Seomtorch&body=${encodeURIComponent('Join me on Seomtorch! My Student ID is ' + (currentUser?.public_id || '') + ': https://seomtorch.vercel.app')}" class="button outline small">Email</a>` : ""}
          </div>
        </article>
      `).join("")}
    </div>
  ` : "";

  const emptyGuide = (!onApp.length && !invites.length) ? `
    <section class="buddies-guide-card">
      <div class="guide-intro">
        <span class="guide-icon">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </span>
        <h2>How Study Circles & Buddies Work</h2>
        <p>Studying with friends keeps you consistent and sharpens your exam readiness.</p>
      </div>
      <div class="buddies-steps-grid">
        <div class="step-card">
          <span class="step-num">01</span>
          <h4>Select Contacts</h4>
          <p>Tap Select Contacts to see which classmates are already on Seomtorch.</p>
        </div>
        <div class="step-card">
          <span class="step-num">02</span>
          <h4>Invite Friends</h4>
          <p>Send 1-tap WhatsApp or SMS invites with your Student ID (<strong>${currentUser?.public_id || "—"}</strong>).</p>
        </div>
        <div class="step-card">
          <span class="step-num">03</span>
          <h4>Challenge Each Other</h4>
          <p>Sit the same frozen question set under timed conditions and compare results privately.</p>
        </div>
      </div>
      <div class="buddies-guide-actions">
        ${hasContactPicker ? `<button class="button" id="btn-scan-guide"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>Select Contacts Now</span></button>` : ""}
        <button class="button ${hasContactPicker ? 'outline' : ''}" id="btn-share-invite-guide">Share Invite via WhatsApp</button>
      </div>
    </section>
  ` : "";

  const content = `
    <section class="page buddies-page">
      <div class="buddies-head">
        <div>
          <p class="eyebrow">Study together</p>
          <h1>Study Buddies.</h1>
          <p class="lede">Connect with classmates, scan contacts to find friends on Seomtorch, and invite partners to private study circles.</p>
        </div>
        <div class="buddies-head-actions">
          ${hasContactPicker ? `
            <button class="button" id="btn-scan-contacts">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>${buddiesLoading ? "Checking contacts…" : "Select Contacts"}</span>
            </button>
          ` : ""}
          <button class="button ${hasContactPicker ? 'outline' : ''}" id="btn-share-invite-link">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            <span>Share Invite</span>
          </button>
          <button class="button outline" id="btn-toggle-search">
            ${buddiesSearchOpen ? "Close Search" : "Search ID / Phone"}
          </button>
        </div>
      </div>

      ${phoneBanner}
      ${searchBox}
      ${onAppSection}
      ${invitesSection}
      ${emptyGuide}
    </section>
  `;

  app.innerHTML = shell(content);
  bindShell();
  bindBuddies();
}

function bindBuddies() {
  document.querySelector("#btn-scan-contacts")?.addEventListener("click", () => handleScanContacts());
  document.querySelector("#btn-scan-guide")?.addEventListener("click", () => handleScanContacts());

  const shareHandler = async () => {
    const inviteUrl = "https://seomtorch.vercel.app";
    const shareText = `Hey! Join me on Seomtorch to prepare for exams and take timed study challenges together. My Student ID is ${currentUser?.public_id || ""}:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Study with me on Seomtorch", text: shareText, url: inviteUrl });
        showToast("Invite link shared!");
      } catch (err) {
        if (err.name !== "AbortError") window.open(whatsappInviteUrl(), "_blank");
      }
    } else {
      window.open(whatsappInviteUrl(), "_blank");
    }
  };

  document.querySelector("#btn-share-invite-link")?.addEventListener("click", shareHandler);
  document.querySelector("#btn-share-invite-guide")?.addEventListener("click", shareHandler);

  document.querySelector("#btn-toggle-search")?.addEventListener("click", () => {
    buddiesSearchOpen = !buddiesSearchOpen;
    renderBuddies();
  });

  document.querySelector("#btn-edit-phone")?.addEventListener("click", () => {
    if (currentUser) {
      currentUser.phone_number = "";
      renderBuddies();
    }
  });

  document.querySelector("#form-link-phone")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.querySelector("#input-link-phone");
    const error = document.querySelector("#phone-link-error");
    const phone = input.value.trim();
    if (!phone) return;
    try {
      const res = await api.updatePhone(authToken, phone);
      if (res?.user) {
        currentUser = res.user;
        localStorage.setItem("seomtorch-auth-user", JSON.stringify(currentUser));
        showToast("Phone number linked successfully!");
        renderBuddies();
      }
    } catch (err) {
      if (error) error.textContent = err.message || "Failed to link phone number";
    }
  });

  document.querySelector("#form-manual-buddy-lookup")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.querySelector("#input-manual-lookup");
    const resultContainer = document.querySelector("#manual-lookup-result");
    const query = input.value.trim();
    if (!query) return;

    resultContainer.innerHTML = '<div class="challenge-loading"><i></i><i></i><i></i><p>Searching...</p></div>';

    // 1. If 6 chars and alphanumeric, try Student ID lookup first
    if (/^[A-Za-z0-9]{6}$/.test(query)) {
      try {
        const student = await api.lookupStudent(authToken, query.toUpperCase());
        const saved = getSavedBuddies();
        if (!saved.some(b => b.public_id === student.public_id)) {
          saved.push(student);
          saveBuddies(saved);
          buddiesMatches.onApp = saved;
        }
        resultContainer.innerHTML = `
          <div class="lookup-found-card">
            <span class="buddy-monogram">${buddyInitials(student.username)}</span>
            <div>
              <strong>${escapeHtml(student.username)}</strong>
              <p>Student ID: <strong>${escapeHtml(student.public_id)}</strong></p>
            </div>
            <button class="button small" data-challenge-buddy="${student.public_id}" style="margin-left:auto;">Challenge →</button>
          </div>
        `;
        resultContainer.querySelector("[data-challenge-buddy]")?.addEventListener("click", () => {
          challengeInvitees = [student];
          challengeComposerOpen = true;
          route = "challenges";
          render();
        });
        return;
      } catch (err) {
        // Not a student ID, proceed to phone/email match
      }
    }

    // 2. Try matchContacts with phone or email
    const isEmail = query.includes("@");
    const phones = isEmail ? [] : [query];
    const emails = isEmail ? [query.toLowerCase()] : [];

    try {
      const matchRes = await api.matchContacts(authToken, phones, emails);
      if (matchRes.matches && matchRes.matches.length) {
        const student = matchRes.matches[0];
        const saved = getSavedBuddies();
        if (!saved.some(b => b.public_id === student.public_id)) {
          saved.push(student);
          saveBuddies(saved);
          buddiesMatches.onApp = saved;
        }
        resultContainer.innerHTML = `
          <div class="lookup-found-card">
            <span class="buddy-monogram">${buddyInitials(student.username)}</span>
            <div>
              <strong>${escapeHtml(student.username)}</strong>
              <p>Student ID: <strong>${escapeHtml(student.public_id)}</strong></p>
            </div>
            <button class="button small" data-challenge-buddy="${student.public_id}" style="margin-left:auto;">Challenge →</button>
          </div>
        `;
        resultContainer.querySelector("[data-challenge-buddy]")?.addEventListener("click", () => {
          challengeInvitees = [student];
          challengeComposerOpen = true;
          route = "challenges";
          render();
        });
      } else {
        resultContainer.innerHTML = `
          <div class="lookup-not-found-card">
            <p>No registered user found with that ${isEmail ? "email" : "phone / ID"}.</p>
            <div style="display:flex; gap:8px; margin-top:8px;">
              ${!isEmail ? `<a href="${whatsappInviteUrl(query)}" target="_blank" rel="noopener noreferrer" class="button small whatsapp-invite-btn">Invite via WhatsApp</a>` : ""}
              ${!isEmail ? `<a href="${smsInviteUrl(query)}" class="button outline small">Invite via SMS</a>` : ""}
              ${isEmail ? `<a href="mailto:${encodeURIComponent(query)}?subject=Study with me on Seomtorch&body=${encodeURIComponent('Join me on Seomtorch! My Student ID is ' + (currentUser?.public_id || '') + ': https://seomtorch.vercel.app')}" class="button outline small">Invite via Email</a>` : ""}
            </div>
          </div>
        `;
      }
    } catch (err) {
      resultContainer.innerHTML = `<p class="auth-error">${escapeHtml(err.message || "Search failed")}</p>`;
    }
  });

  document.querySelectorAll("[data-challenge-buddy]").forEach(btn => {
    btn.addEventListener("click", () => {
      const publicId = btn.dataset.challengeBuddy;
      const buddy = (buddiesMatches?.onApp || []).find(b => b.public_id === publicId) || { public_id: publicId, username: btn.dataset.buddyName || "Friend" };
      if (!challengeInvitees.some(i => i.public_id === publicId)) {
        challengeInvitees.push(buddy);
      }
      challengeComposerOpen = true;
      route = "challenges";
      selectedChallengeId = null;
      render();
      showToast(`Added ${buddy.username} to challenge`);
    });
  });

  document.querySelectorAll("[data-copy-buddy-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const publicId = btn.dataset.copyBuddyId;
      try {
        await navigator.clipboard.writeText(publicId);
        showToast(`Copied Student ID: ${publicId}`);
      } catch {
        showToast(`Student ID: ${publicId}`);
      }
    });
  });

  document.querySelectorAll("[data-remove-buddy]").forEach(btn => {
    btn.addEventListener("click", () => {
      const publicId = btn.dataset.removeBuddy;
      const updated = (buddiesMatches?.onApp || []).filter(b => b.public_id !== publicId);
      buddiesMatches.onApp = updated;
      saveBuddies(updated);
      renderBuddies();
      showToast("Removed from buddies");
    });
  });
}

function showBuddiesPickerModal() {
  document.querySelector("#buddies-picker-modal")?.remove();
  const saved = getSavedBuddies();
  const hasContactPicker = "contacts" in navigator && "ContactsManager" in window;

  const modal = document.createElement("div");
  modal.id = "buddies-picker-modal";
  modal.className = "dialog-backdrop";
  modal.innerHTML = `
    <section class="confirm-dialog" style="max-width:440px;" role="dialog" aria-modal="true" aria-labelledby="picker-title">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h2 id="picker-title" style="margin:0; font-size:20px;">Add from Buddies</h2>
        <button type="button" class="remove-buddy-btn" id="close-buddies-picker" style="font-size:22px;">×</button>
      </div>
      <p style="color:var(--muted); font-size:13px; margin:0 0 16px;">Choose a saved study buddy to add to your challenge.</p>
      
      ${saved.length ? `
        <div class="buddies-modal-list">
          ${saved.map(b => {
            const alreadyAdded = challengeInvitees.some(i => i.public_id === b.public_id);
            return `
              <div class="buddies-modal-row ${alreadyAdded ? 'added' : ''}">
                <span class="buddy-monogram small">${buddyInitials(b.username)}</span>
                <div style="flex:1;">
                  <strong>${escapeHtml(b.username)}</strong>
                  <small style="display:block; color:var(--muted); font-size:11px;">${b.public_id}</small>
                </div>
                <button type="button" class="button small ${alreadyAdded ? 'outline' : ''}" data-modal-add-buddy="${b.public_id}" ${alreadyAdded ? 'disabled' : ''}>
                  ${alreadyAdded ? 'Added' : 'Add +'}
                </button>
              </div>
            `;
          }).join("")}
        </div>
      ` : `
        <p style="text-align:center; padding:20px 0; color:var(--muted); font-size:13px;">No saved buddies yet.</p>
      `}

      <div style="display:flex; gap:10px; margin-top:16px;">
        ${hasContactPicker ? `<button type="button" class="button outline small" id="picker-scan-btn" style="flex:1;">Select Phone Contacts</button>` : ""}
        <button type="button" class="button outline small" id="picker-done-btn" style="margin-left:auto;">Done</button>
      </div>
    </section>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector("#close-buddies-picker")?.addEventListener("click", close);
  modal.querySelector("#picker-done-btn")?.addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });

  modal.querySelectorAll("[data-modal-add-buddy]").forEach(btn => {
    btn.addEventListener("click", () => {
      const publicId = btn.dataset.modalAddBuddy;
      const b = saved.find(item => item.public_id === publicId);
      if (b && !challengeInvitees.some(i => i.public_id === publicId)) {
        if (challengeInvitees.length >= 9) {
          showToast("A challenge can include up to nine invited friends.");
          return;
        }
        challengeInvitees.push(b);
        btn.textContent = "Added";
        btn.classList.add("outline");
        btn.disabled = true;
        renderInviteeList();
        showToast(`Added ${b.username}`);
      }
    });
  });

  modal.querySelector("#picker-scan-btn")?.addEventListener("click", async () => {
    close();
    await handleScanContacts(() => {
      showBuddiesPickerModal();
    });
  });
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
  app.innerHTML = `<main class="onboarding auth-screen"><section class="onboard-brand"><span class="brand"><span class="brand-symbol" aria-hidden="true"><img src="assets/seomtorch_logo.png" alt=""></span><span class="brand-name">Seomtorch<small>Prepare with purpose</small></span></span><div><blockquote>Your progress should follow you.</blockquote><p>Sign in to keep every answer, streak and milestone connected to your account.</p></div><small>Biology · Chemistry · Civic Education · Computer Studies · Economics · English Language · General Paper · Government · History · Literature in English · Marketing · Mathematics · Music · Physics · University Courses</small></section><section class="onboard-form"><div><div class="auth-tabs"><button class="${!register ? "active" : ""}" data-auth-mode="signin">Sign in</button><button class="${register ? "active" : ""}" data-auth-mode="register">Register</button></div><p class="eyebrow">${register ? "Create your account" : "Welcome back"}</p><h1>${register ? "Begin your preparation." : "Return to your study desk."}</h1><p class="lede">${register ? "Select your path and create a secure profile." : "Sign in with your email address and password."}</p><form id="auth-form" class="auth-form">${register ? '<div class="field"><label for="auth-username">Username</label><input id="auth-username" name="username" type="text" maxlength="150" autocomplete="username" required></div>' : ""}<div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" required></div><div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" minlength="8" autocomplete="${register ? "new-password" : "current-password"}" required></div>${register ? `<div class="field"><label style="font-weight:700;margin-bottom:8px;display:block;">Gender:</label><div class="reg-gender-selector"><label class="reg-gender-option"><input type="radio" name="gender" value="male" checked><div class="reg-gender-card"><span class="reg-gender-symbol">♂</span><div><strong>Male</strong><small>Allocates male avatar</small></div></div></label><label class="reg-gender-option"><input type="radio" name="gender" value="female"><div class="reg-gender-card female"><span class="reg-gender-symbol">♀</span><div><strong>Female</strong><small>Allocates female avatar</small></div></div></label></div></div><div class="field"><label style="font-weight:700;margin-bottom:8px;display:block;">Choose your primary portal:</label><div class="reg-path-selector"><label class="reg-path-option"><input type="radio" name="user_type" value="aspirant" checked><div class="reg-path-card"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg><strong>Exam Aspirant</strong><small>JAMB, WAEC, NECO & Post-UTME</small></div></label><label class="reg-path-option"><input type="radio" name="user_type" value="university"><div class="reg-path-card uni-path"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 2L2 7h20L12 2z"/></svg><strong>University Student</strong><small>Undergraduate Degree (100L - 600L)</small></div></label></div></div><div id="reg-aspirant-fields"><div class="field"><label for="auth-exam-type">Target Examination</label><select id="auth-exam-type" name="exam_type"><option value="jamb">JAMB UTME</option><option value="waec">WAEC SSCE</option><option value="neco">NECO SSCE</option><option value="post_utme">POST-UTME</option></select></div><div class="field"><label for="auth-target-year">Target Year</label><input id="auth-target-year" name="target_year" type="number" min="2024" max="2035" value="2026"></div></div><div id="reg-uni-fields" style="display:none;"><div class="field"><label for="auth-uni-name">University / Institution *</label><input id="auth-uni-name" name="university_name" type="text" placeholder="e.g. University of Lagos (UNILAG)"></div><div class="field"><label for="auth-uni-dept">Department *</label><input id="auth-uni-dept" name="department" type="text" placeholder="e.g. Anatomy"></div><div class="field"><label for="auth-uni-level">Level</label><select id="auth-uni-level" name="level"><option value="100">100 Level</option><option value="200" selected>200 Level</option><option value="300">300 Level</option><option value="400">400 Level</option><option value="500">500 Level</option><option value="600">600 Level</option></select></div></div>` : ""}<div id="auth-error" class="auth-error" role="alert"></div><button class="button auth-submit" type="submit">${register ? "Create account" : "Sign in"} →</button></form></div></section></main>${!isStandalone() ? '<button class="pwa-install-fab" data-install-app>Install app</button>' : ''}`;
  document.querySelectorAll("[data-auth-mode]").forEach(button => button.addEventListener("click", () => { authMode = button.dataset.authMode; renderAuth(); }));
  document.querySelectorAll("[data-install-app]").forEach(button => button.addEventListener("click", installApp));
  if (register) {
    const radioInputs = document.querySelectorAll("input[name=user_type]");
    const aspFields = document.querySelector("#reg-aspirant-fields");
    const uniFields = document.querySelector("#reg-uni-fields");
    radioInputs.forEach(r => r.addEventListener("change", () => {
      const isUni = document.querySelector("input[name=user_type]:checked")?.value === "university";
      if (aspFields) aspFields.style.display = isUni ? "none" : "block";
      if (uniFields) uniFields.style.display = isUni ? "block" : "none";
    }));
  }
  document.querySelector("#auth-form").addEventListener("submit", submitAuth);
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget; const button = form.querySelector("button[type=submit]"); const error = document.querySelector("#auth-error");
  const body = Object.fromEntries(new FormData(form)); button.disabled = true; button.textContent = "Please wait…"; error.textContent = "";
  try {
    let data;
    if (authMode === "register") {
      const userType = body.user_type || "aspirant";
      const gender = (body.gender || "male").toLowerCase();
      data = await api.register({
        email: body.email,
        username: body.username,
        password: body.password,
        user_type: userType,
        gender: gender
      });
      // Register initial profile according to their selected path
      if (userType === "university") {
        try {
          await api.saveUniversityProfile(data.token, {
            university_name: body.university_name || "University",
            faculty: body.department || "Faculty",
            department: body.department || "General Studies",
            level: Number(body.level || 200),
            current_courses: []
          });
          data.user.has_university_profile = true;
          data.user.university_profile = {
            university_name: body.university_name || "University",
            faculty: body.department || "Faculty",
            department: body.department || "General Studies",
            level: Number(body.level || 200),
            current_courses: []
          };
          data.user.active_mode = "university";
        } catch (e) { console.error("Initial university profile save error", e); }
      } else {
        try {
          await api.saveAspirantProfile(data.token, {
            exam_type: body.exam_type || "jamb",
            target_year: Number(body.target_year || 2026),
            preferred_subjects: []
          });
          data.user.has_aspirant_profile = true;
          data.user.aspirant_profile = {
            exam_type: body.exam_type || "jamb",
            target_year: Number(body.target_year || 2026),
            preferred_subjects: []
          };
          data.user.active_mode = "aspirant";
        } catch (e) { console.error("Initial aspirant profile save error", e); }
      }
    } else {
      data = await api.login(body);
    }
    authToken = data.token; currentUser = data.user;
    localStorage.setItem("seomtorch-auth-token", authToken);
    localStorage.setItem("seomtorch-auth-user", JSON.stringify(currentUser));
    localStorage.setItem("seomtorch-active-mode", currentUser.active_mode || "aspirant");
    await prepareLocalUser(currentUser);
    await loadSubscriptionState();
    await syncPendingAttempts();
    route = "home";
    render();
  } catch (caught) {
    error.textContent = caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";
    button.disabled = false;
    button.textContent = authMode === "register" ? "Create account →" : "Sign in →";
  }
}

async function prepareLocalUser(user) {
  if (profile && profile.remoteId !== user.public_id) {
    await clearStore("profile"); await clearStore("attempts"); await clearStore("bookmarks"); await put("meta", { key: "bookmarkQueue", actions: [] }); await put("meta", { key: "completed_tests", list: [] });
  completedTests = []; attempts = []; bookmarks = [];
  }
  const stats = user.stats || {};
  profile = { id: "local-user", remoteId: user.public_id, name: user.username, email: user.email, gender: user.gender || profile?.gender || "", avatar: user.avatar || profile?.avatar || getRandomAvatarId(user.gender), xp: stats.xp ?? 0, rhythm: stats.current_streak ?? 0, bestRhythm: stats.best_streak ?? 0, lastStudyDate: stats.last_study_date || null, tests: stats.tests || profile?.tests || null, createdAt: profile?.createdAt || Date.now() };
  await put("profile", profile);
}

async function restoreAuth() {
  if (!authToken) return false;
  try { currentUser = await api.me(authToken); localStorage.setItem("seomtorch-auth-user", JSON.stringify(currentUser)); await prepareLocalUser(currentUser); await loadSubscriptionState(); return true; }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) { authToken = null; currentUser = null; localStorage.removeItem("seomtorch-auth-token"); localStorage.removeItem("seomtorch-auth-user"); return false; }
    if (currentUser) { await prepareLocalUser(currentUser); return true; }
    return false;
  }
}

async function signOut() {
  try { await syncBookmarkQueue(); await api.logout(authToken); } catch {}
  userAccessData = { has_all_access: false, unlocked_courses: [], is_trial: false, trial_days_remaining: 0, trial_used: false, expires_at: null };
  await loadSubscriptionState();
  await clearStore("profile"); await clearStore("attempts"); await clearStore("bookmarks"); await put("meta", { key: "bookmarkQueue", actions: [] }); await put("meta", { key: "completed_tests", list: [] });
  completedTests = [];
  authToken = null; currentUser = null; profile = null; attempts = []; bookmarks = []; challengesData = null; achievementsData = null; progressData = null; selectedChallengeId = null; badgeCelebrationKnown.clear(); badgeCelebrationQueue = []; localStorage.removeItem("seomtorch-auth-token"); localStorage.removeItem("seomtorch-auth-user"); renderAuth();
}


// ─── University Module ──────────────────────────────────────────────────────

function getDeptIconSvg(deptId) {
  if (deptId === "anatomy") {
    return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20M7 7l10 10M17 7L7 17"/></svg>`;
  }
  if (deptId === "physiology") {
    return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-0-5.5H20"/></svg>`;
}

function uniShell(content, breadcrumbs = []) {
  const crumbHtml = breadcrumbs.length ? `<nav class="uni-breadcrumb" aria-label="University navigation">${breadcrumbs.map((c, i) => i < breadcrumbs.length - 1 ? `<button data-uni-crumb="${i}">${escapeHtml(c.label)}</button><span aria-hidden="true">›</span>` : `<span class="current">${escapeHtml(c.label)}</span>`).join("")}</nav>` : "";
  return shell(`<section class="uni-page"><div class="uni-header"><div class="uni-header-inner"><span class="uni-badge"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg> University Mode</span><h1 class="uni-title">${breadcrumbs.length ? escapeHtml(breadcrumbs[breadcrumbs.length - 1].label) : "University"}</h1>${crumbHtml}</div></div><div class="uni-body">${content}</div></section>`);
}

function bindUniCrumbs(breadcrumbs) {
  document.querySelectorAll("[data-uni-crumb]").forEach(button => {
    button.addEventListener("click", () => {
      const idx = Number(button.dataset.uniCrumb);
      const target = breadcrumbs[idx];
      if (target.action) target.action();
      window.scrollTo({ top: 0, behavior: "smooth" });
      render();
    });
  });
}

async function fetchUniJson(path) {
  if (uniContentCache[path]) return uniContentCache[path];
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to load: ${path}`);
    const data = await response.json();
    uniContentCache[path] = data;
    return data;
  } catch (error) {
    console.error("University fetch error:", error);
    return null;
  }
}

async function renderUniversity() {
  if (uniRoute === "levels" && uniDeptId) return renderUniLevels();
  if (uniRoute === "courses" && uniDeptId && uniLevel) return renderUniCourses();
  if (uniRoute === "course" && uniDeptId && uniLevel && uniCourseId) return renderUniCourse();
  if (uniRoute === "note" && uniDeptId && uniLevel && uniCourseId && uniNoteFile) return renderUniNote();
  return renderUniDepartments();
}

async function renderUniDepartments() {
  const data = await fetchUniJson("data/university/index.json");
  if (!data) {
    app.innerHTML = uniShell(`<div class="uni-empty"><h2>Unable to load departments</h2><p>Please check your connection and try again.</p><button class="button uni-btn" id="uni-retry">Retry</button></div>`);
    bindShell();
    document.querySelector("#uni-retry")?.addEventListener("click", () => renderUniDepartments());
    return;
  }
  uniDepartments = data.departments;
  const cards = data.departments.map(dept => `<button class="uni-dept-card" data-uni-dept="${dept.id}" style="--dept-color:${dept.color};--dept-accent:${dept.accentColor}"><span class="uni-dept-icon">${getDeptIconSvg(dept.id)}</span><div class="uni-dept-info"><h3>${escapeHtml(dept.name)}</h3><span class="uni-dept-faculty">${escapeHtml(dept.faculty)}</span><p>${escapeHtml(dept.tagline)}</p></div><span class="uni-dept-levels">${dept.levels.length} level${dept.levels.length > 1 ? "s" : ""} available</span><span class="row-arrow" aria-hidden="true">→</span></button>`).join("");

  const breadcrumbs = [{ label: "University" }];
  app.innerHTML = uniShell(`<p class="uni-subtitle">Select a department to begin studying.</p><div class="uni-dept-list">${cards}</div>`, breadcrumbs);
  bindShell();
  document.querySelectorAll("[data-uni-dept]").forEach(button => {
    button.addEventListener("click", () => {
      uniDeptId = button.dataset.uniDept;
      uniRoute = "levels";
      window.scrollTo({ top: 0, behavior: "smooth" });
      render();
    });
  });
}

async function renderUniLevels() {
  const dept = uniDepartments?.find(d => d.id === uniDeptId);
  if (!dept) { uniRoute = "departments"; return renderUniDepartments(); }

  const meta = await fetchUniJson(`data/university/${uniDeptId}/meta.json`);
  const description = meta?.description || dept.tagline;
  const levels = dept.levels;

  const levelCards = levels.map(level => `<button class="uni-level-card" data-uni-level="${level}"><span class="uni-level-num">${level}</span><span class="uni-level-label">${level} Level</span></button>`).join("");

  const breadcrumbs = [
    { label: "University", action: () => { uniRoute = "departments"; uniDeptId = null; } },
    { label: dept.name }
  ];

  app.innerHTML = uniShell(`<div class="uni-dept-hero" style="--dept-color:${dept.color};--dept-accent:${dept.accentColor}"><span class="uni-dept-icon-lg">${getDeptIconSvg(dept.id)}</span><p class="uni-dept-desc">${escapeHtml(description)}</p><span class="uni-dept-faculty-tag">${escapeHtml(dept.faculty)}</span></div><h2 class="uni-section-title">Select your level</h2><div class="uni-level-grid">${levelCards}</div>`, breadcrumbs);
  bindShell();
  bindUniCrumbs(breadcrumbs);

  document.querySelectorAll("[data-uni-level]").forEach(button => {
    button.addEventListener("click", () => {
      uniLevel = Number(button.dataset.uniLevel);
      uniRoute = "courses";
      window.scrollTo({ top: 0, behavior: "smooth" });
      render();
    });
  });
}

async function renderUniCourses() {
  const dept = uniDepartments?.find(d => d.id === uniDeptId);
  if (!dept) { uniRoute = "departments"; return renderUniDepartments(); }

  const data = await fetchUniJson(`data/university/${uniDeptId}/${uniLevel}/courses.json`);
  if (!data || !data.courses.length) {
    const breadcrumbs = [
      { label: "University", action: () => { uniRoute = "departments"; uniDeptId = null; uniLevel = null; } },
      { label: dept.name, action: () => { uniRoute = "levels"; uniLevel = null; } },
      { label: `${uniLevel} Level` }
    ];
    app.innerHTML = uniShell(`<div class="uni-empty"><h2>No courses yet</h2><p>Courses for ${escapeHtml(dept.name)} ${uniLevel} Level are being prepared. Check back soon!</p><button class="button uni-btn" id="uni-back-levels">← Back to levels</button></div>`, breadcrumbs);
    bindShell(); bindUniCrumbs(breadcrumbs);
    document.querySelector("#uni-back-levels")?.addEventListener("click", () => { uniRoute = "levels"; uniLevel = null; render(); });
    return;
  }

  const courseCards = data.courses.map(course => `<button class="uni-course-card" data-uni-course="${course.id}"><div class="uni-course-code">${escapeHtml(course.code)}</div><div class="uni-course-info"><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.description)}</p></div><span class="row-arrow" aria-hidden="true">→</span></button>`).join("");

  const breadcrumbs = [
    { label: "University", action: () => { uniRoute = "departments"; uniDeptId = null; uniLevel = null; } },
    { label: dept.name, action: () => { uniRoute = "levels"; uniLevel = null; } },
    { label: `${uniLevel} Level` }
  ];

  app.innerHTML = uniShell(`<div class="uni-course-list">${courseCards}</div>`, breadcrumbs);
  bindShell(); bindUniCrumbs(breadcrumbs);

  document.querySelectorAll("[data-uni-course]").forEach(button => {
    button.addEventListener("click", () => {
      uniCourseId = button.dataset.uniCourse;
      uniRoute = "course";
      window.scrollTo({ top: 0, behavior: "smooth" });
      render();
    });
  });
}

async function renderUniCourse() {
  const dept = uniDepartments?.find(d => d.id === uniDeptId);
  if (!dept) { uniRoute = "departments"; return renderUniDepartments(); }

  const data = await fetchUniJson(`data/university/${uniDeptId}/${uniLevel}/${uniCourseId}.json`);
  if (!data) {
    const breadcrumbs = [
      { label: "University", action: () => { uniRoute = "departments"; uniDeptId = null; uniLevel = null; uniCourseId = null; } },
      { label: dept.name, action: () => { uniRoute = "levels"; uniLevel = null; uniCourseId = null; } },
      { label: `${uniLevel} Level`, action: () => { uniRoute = "courses"; uniCourseId = null; } },
      { label: "Course" }
    ];
    app.innerHTML = uniShell(`<div class="uni-empty"><h2>Unable to load course</h2><p>Please check your connection and try again.</p><button class="button uni-btn" id="uni-back-courses">← Back to courses</button></div>`, breadcrumbs);
    bindShell(); bindUniCrumbs(breadcrumbs);
    document.querySelector("#uni-back-courses")?.addEventListener("click", () => { uniRoute = "courses"; uniCourseId = null; render(); });
    return;
  }

  const sections = data.sections || [];
  const hasCourse = hasCourseAccess(data.code);
  const topicsHtml = sections.map((section, sIdx) => {
    const hasNote = Boolean(section.noteFile);
    const isNoteUnlocked = hasCourse || sIdx === 0;
    const noteBtnHtml = hasNote ? `
      <button class="uni-notebook-btn ${isNoteUnlocked ? "" : "locked-note"}" type="button" data-uni-note-file="${escapeHtml(section.noteFile)}" data-uni-note-title="${escapeHtml(section.noteTitle || section.title + ' Notebook')}" data-uni-course-code="${escapeHtml(data.code)}" data-note-locked="${isNoteUnlocked ? "0" : "1"}" aria-label="Open ${escapeHtml(section.title)} Notebook">
        <svg class="uni-notebook-btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-0-5.5H20"/>
          <path d="M8 7h8M8 11h8M8 15h4"/>
        </svg>
        <span class="uni-notebook-btn-label">Notebook</span>
        <span class="uni-notebook-btn-badge">${isNoteUnlocked ? (sIdx === 0 && !hasCourse ? "Free Showcase" : "Study Note") : "🔒 Locked"}</span>
      </button>` : "";

    const topicItems = section.topics.map((topic, topicIdx) => {
      const isAvailable = topic.status !== "coming-soon";
      const isFree = isTopicFree(data.code, topic.id, topicIdx, sIdx);
      const isUnlocked = hasCourse || isFree;
      const statusIcon = isAvailable ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>` : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
      
      if (!isAvailable) {
        return `<div class="uni-topic-item coming-soon">
          <span class="uni-topic-status">${statusIcon}</span>
          <div class="uni-topic-info">
            <h4>${escapeHtml(topic.title)}</h4>
            <span class="uni-topic-tag">Coming soon</span>
          </div>
        </div>`;
      }

      if (!isUnlocked) {
        return `<div class="uni-topic-item locked" data-uni-topic-title="${escapeHtml(topic.title)}" data-uni-course-code="${escapeHtml(data.code)}" role="button" tabindex="0">
          <span class="uni-topic-status locked"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
          <div class="uni-topic-info">
            <h4>${escapeHtml(topic.title)}</h4>
            <span class="uni-topic-tag" style="color:var(--ochre)">Locked · Full Course Access</span>
          </div>
          <span class="uni-topic-lock-pill">🔒 Unlock</span>
        </div>`;
      }

      return `<div class="uni-topic-item available" data-uni-data-file="${escapeHtml(topic.dataFile || "")}" data-uni-topic-title="${escapeHtml(topic.title)}" role="button" tabindex="0">
        <span class="uni-topic-status">${statusIcon}</span>
        <div class="uni-topic-info">
          <h4>${escapeHtml(topic.title)}</h4>
          ${isFree && !hasCourse ? `<span class="uni-topic-tag" style="color:var(--forest);font-weight:700;">Free Sample Topic</span>` : ""}
        </div>
        <button class="uni-topic-target-btn" type="button" data-uni-data-file="${escapeHtml(topic.dataFile || "")}" data-uni-topic-title="${escapeHtml(topic.title)}" aria-label="Configure practice: ${escapeHtml(topic.title)}">
          <span class="uni-topic-target-dot"></span>
          <span class="uni-topic-target-label">Available</span>
          <span class="uni-topic-target-divider">•</span>
          <span class="uni-topic-target-hint">Pick Qs &amp; Time</span>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>`;
    }).join("");

    return `<div class="uni-section">
      <div class="uni-section-header">
        <div class="uni-section-title-wrap">
          <h3 class="uni-section-heading">${escapeHtml(section.title)}</h3>
          <span class="uni-section-count-badge">${section.topics.length} topics</span>
        </div>
        ${noteBtnHtml}
      </div>
      <div class="uni-topic-list">${topicItems}</div>
    </div>`;
  }).join("");

  const totalTopics = sections.reduce((sum, s) => sum + s.topics.length, 0);
  const availableTopics = sections.reduce((sum, s) => sum + s.topics.filter(t => t.status !== "coming-soon").length, 0);

  const breadcrumbs = [
    { label: "University", action: () => { uniRoute = "departments"; uniDeptId = null; uniLevel = null; uniCourseId = null; } },
    { label: dept.name, action: () => { uniRoute = "levels"; uniLevel = null; uniCourseId = null; } },
    { label: `${uniLevel} Level`, action: () => { uniRoute = "courses"; uniCourseId = null; } },
    { label: data.code }
  ];

  // hasCourse already declared above
  const heroAccessBadge = hasCourse
    ? (userAccessData?.is_trial
        ? `<span style="background:#f0fdf4;color:#065f46;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">✨ 3-Day Trial Active (${userAccessData?.trial_days_remaining}d left)</span>`
        : `<span style="background:#f0fdf4;color:#065f46;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">✓ Full Course Access Active</span>`)
    : `<button type="button" class="button small accent" id="uni-hero-upgrade-btn" style="padding:6px 14px;font-size:12.5px;">🔒 Upgrade to Full Access</button>`;
  const statsHtml = `<div class="uni-course-stats"><div class="uni-stat"><strong>${totalTopics}</strong><span>Topics</span></div><div class="uni-stat"><strong>${availableTopics}</strong><span>Available</span></div><div class="uni-stat"><strong>${totalTopics - availableTopics}</strong><span>Coming soon</span></div></div><div style="margin-top:12px;">${heroAccessBadge}</div>`;

  let mixedCardHtml = "";
  if (availableTopics > 0) {
    mixedCardHtml = `<div class="uni-mixed-practice-card collapsed" id="uni-mixed-card">
      <div class="uni-mixed-card-header" id="uni-mixed-toggle-btn" role="button" tabindex="0" aria-expanded="false" aria-controls="uni-mixed-body">
        <div class="uni-mixed-header-left">
          <div class="uni-mixed-icon-badge" aria-hidden="true">
            <img src="assets/seomtorch_logo.png" alt="Seomtorch" class="uni-mixed-logo-img">
          </div>
          <div class="uni-mixed-title-group">
            <h3 class="uni-mixed-heading">Mixed Timed Practice</h3>
            <div class="uni-mixed-subline">
              <span class="uni-mixed-badge">Multi-Topic</span>
              <span class="uni-mixed-topics-pill">${availableTopics} Topics · Timed</span>
            </div>
          </div>
        </div>
        <div class="uni-mixed-expand-indicator">
          <span class="uni-mixed-expand-label" id="uni-mixed-expand-label">Set Target</span>
          <svg class="uni-mixed-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </div>
      </div>

      <div class="uni-mixed-card-body" id="uni-mixed-body">
        <p class="uni-mixed-desc">Test yourself across all ${availableTopics} available topics in ${escapeHtml(data.code)}. Questions are sampled evenly from each topic and shuffled under timed conditions.</p>

        <div class="uni-target-config-grid">
          <div class="uni-target-card">
            <div class="uni-target-label">
              <span class="uni-target-name">Question Target</span>
              <span class="uni-target-hint">5 – 100 questions</span>
            </div>
            <div class="uni-stepper-wrap">
              <button type="button" class="uni-stepper-btn" id="uni-q-dec" aria-label="Decrease question count">−</button>
              <div class="uni-stepper-val">
                <input type="number" id="uni-target-q" min="5" max="100" step="5" value="25" inputmode="numeric" aria-label="Number of questions">
                <span class="uni-stepper-unit">questions</span>
              </div>
              <button type="button" class="uni-stepper-btn" id="uni-q-inc" aria-label="Increase question count">+</button>
            </div>
            <div class="uni-target-pills" id="uni-q-pills">
              <button type="button" class="uni-target-pill" data-val="10">10</button>
              <button type="button" class="uni-target-pill" data-val="20">20</button>
              <button type="button" class="uni-target-pill active" data-val="25">25</button>
              <button type="button" class="uni-target-pill" data-val="30">30</button>
              <button type="button" class="uni-target-pill" data-val="50">50</button>
            </div>
          </div>

          <div class="uni-target-card">
            <div class="uni-target-label">
              <span class="uni-target-name">Time Limit</span>
              <span class="uni-target-hint">1 – 180 minutes</span>
            </div>
            <div class="uni-stepper-wrap">
              <button type="button" class="uni-stepper-btn" id="uni-m-dec" aria-label="Decrease time limit">−</button>
              <div class="uni-stepper-val">
                <input type="number" id="uni-target-m" min="1" max="180" step="1" value="15" inputmode="numeric" aria-label="Time limit in minutes">
                <span class="uni-stepper-unit">minutes</span>
              </div>
              <button type="button" class="uni-stepper-btn" id="uni-m-inc" aria-label="Increase time limit">+</button>
            </div>
            <div class="uni-target-pills" id="uni-m-pills">
              <button type="button" class="uni-target-pill" data-val="5">5m</button>
              <button type="button" class="uni-target-pill" data-val="10">10m</button>
              <button type="button" class="uni-target-pill active" data-val="15">15m</button>
              <button type="button" class="uni-target-pill" data-val="20">20m</button>
              <button type="button" class="uni-target-pill" data-val="30">30m</button>
            </div>
          </div>
        </div>

        <div class="uni-mixed-footer">
          <div class="uni-mixed-meta">
            <span class="uni-mixed-meta-dot"></span>
            <span id="uni-mixed-pace-text">Pace: ~36s per question · Auto-submits on timer expiry</span>
          </div>
          <button class="button accent uni-mixed-start-btn" id="uni-start-mixed-practice">
            <span>Begin Practice</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  }

  app.innerHTML = uniShell(`<div class="uni-course-hero"><div class="uni-course-code-lg">${escapeHtml(data.code)}</div><p class="uni-course-desc">${escapeHtml(data.description)}</p>${statsHtml}</div>${mixedCardHtml}${topicsHtml}`, breadcrumbs);
  bindShell(); bindUniCrumbs(breadcrumbs);

  const mixedCard = document.querySelector("#uni-mixed-card");
  const mixedToggleBtn = document.querySelector("#uni-mixed-toggle-btn");
  const expandLabel = document.querySelector("#uni-mixed-expand-label");

  const toggleMixedCard = () => {
    if (!mixedCard) return;
    const isCollapsed = mixedCard.classList.toggle("collapsed");
    mixedToggleBtn?.setAttribute("aria-expanded", String(!isCollapsed));
    if (expandLabel) {
      expandLabel.textContent = isCollapsed ? "Set Target" : "Hide";
    }
  };

  mixedToggleBtn?.addEventListener("click", toggleMixedCard);
  mixedToggleBtn?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleMixedCard();
    }
  });

  const inputQ = document.querySelector("#uni-target-q");
  const inputM = document.querySelector("#uni-target-m");
  const paceText = document.querySelector("#uni-mixed-pace-text");
  const qPills = document.querySelectorAll("#uni-q-pills .uni-target-pill");
  const mPills = document.querySelectorAll("#uni-m-pills .uni-target-pill");

  const updatePace = () => {
    const qVal = Math.max(5, Math.min(100, parseInt(inputQ?.value, 10) || 25));
    const mVal = Math.max(1, Math.min(180, parseInt(inputM?.value, 10) || 15));
    const secPerQ = Math.round((mVal * 60) / qVal);
    if (paceText) {
      paceText.textContent = `Pace: ~${secPerQ}s per question · Auto-submits on timer expiry`;
    }
  };

  const syncQPills = (val) => {
    qPills.forEach(p => p.classList.toggle("active", Number(p.dataset.val) === val));
  };

  const syncMPills = (val) => {
    mPills.forEach(p => p.classList.toggle("active", Number(p.dataset.val) === val));
  };

  document.querySelector("#uni-q-dec")?.addEventListener("click", () => {
    if (!inputQ) return;
    const current = parseInt(inputQ.value, 10) || 25;
    const next = Math.max(5, current - 5);
    inputQ.value = next;
    syncQPills(next);
    updatePace();
  });

  document.querySelector("#uni-q-inc")?.addEventListener("click", () => {
    if (!inputQ) return;
    const current = parseInt(inputQ.value, 10) || 25;
    const next = Math.min(100, current + 5);
    inputQ.value = next;
    syncQPills(next);
    updatePace();
  });

  qPills.forEach(p => {
    p.addEventListener("click", () => {
      if (!inputQ) return;
      const val = Number(p.dataset.val);
      inputQ.value = val;
      syncQPills(val);
      updatePace();
    });
  });

  inputQ?.addEventListener("input", () => {
    const val = parseInt(inputQ.value, 10);
    syncQPills(val);
    updatePace();
  });

  document.querySelector("#uni-m-dec")?.addEventListener("click", () => {
    if (!inputM) return;
    const current = parseInt(inputM.value, 10) || 15;
    const step = current <= 10 ? 1 : 5;
    const next = Math.max(1, current - step);
    inputM.value = next;
    syncMPills(next);
    updatePace();
  });

  document.querySelector("#uni-m-inc")?.addEventListener("click", () => {
    if (!inputM) return;
    const current = parseInt(inputM.value, 10) || 15;
    const step = current < 10 ? 1 : 5;
    const next = Math.min(180, current + step);
    inputM.value = next;
    syncMPills(next);
    updatePace();
  });

  mPills.forEach(p => {
    p.addEventListener("click", () => {
      if (!inputM) return;
      const val = Number(p.dataset.val);
      inputM.value = val;
      syncMPills(val);
      updatePace();
    });
  });

  inputM?.addEventListener("input", () => {
    const val = parseInt(inputM.value, 10);
    syncMPills(val);
    updatePace();
  });

  document.querySelector("#uni-hero-upgrade-btn")?.addEventListener("click", () => {
    showUpgradeModal({ trigger: "course_hero", courseCode: data.code });
  });

  document.querySelector("#uni-start-mixed-practice")?.addEventListener("click", () => {
    if (!hasCourseAccess(data.code)) {
      api.logMonetizationEvent(authToken, "upgrade_screen_viewed", { trigger: "mixed_mock_practice", course: data.code }).catch(() => {});
      showUpgradeModal({ trigger: "mixed_mock_practice", courseCode: data.code });
      return;
    }
    const qCount = Math.max(5, Math.min(100, parseInt(inputQ?.value, 10) || 25));
    const mCount = Math.max(1, Math.min(180, parseInt(inputM?.value, 10) || 15));
    startUniMixedPractice(data, qCount, mCount);
  });

  document.querySelectorAll(".uni-notebook-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.noteLocked === "1") {
        showUpgradeModal({ trigger: "locked_note", courseCode: btn.dataset.uniCourseCode || data.code });
        return;
      }
      uniNoteFile = btn.dataset.uniNoteFile;
      uniNoteTitle = btn.dataset.uniNoteTitle;
      uniNoteActiveBlock = 1;
      uniNoteRevealedMap = {};
      uniNoteTranscriptOpenMap = {};
      uniRoute = "note";
      window.scrollTo({ top: 0, behavior: "smooth" });
      render();
    });
  });

  document.querySelectorAll(".uni-topic-item.locked").forEach(item => {
    const launchUpgrade = (e) => {
      e?.stopPropagation?.();
      const courseCode = item.dataset.uniCourseCode || data.code;
      const topicTitle = item.dataset.uniTopicTitle;
      api.logMonetizationEvent(authToken, "locked_topic_tapped", { course: courseCode, topic: topicTitle }).catch(() => {});
      showUpgradeModal({ trigger: "locked_topic", courseCode, topicTitle });
    };
    item.addEventListener("click", launchUpgrade);
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        launchUpgrade(e);
      }
    });
  });

  document.querySelectorAll(".uni-topic-item.available").forEach(item => {
    const launch = (e) => {
      e?.stopPropagation?.();
      const dataFile = item.dataset.uniDataFile;
      const topicTitle = item.dataset.uniTopicTitle;
      if (!dataFile) return;
      showTopicConfigModal(data.code || "ANA 201", topicTitle, dataFile);
    };
    item.addEventListener("click", launch);
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        launch(e);
      }
    });
  });
}

function sampleStratifiedCourseQuestions(topicSets, targetCount) {
  if (!topicSets || !topicSets.length || targetCount <= 0) return [];

  const pools = topicSets.map(s => ({
    topic: s.topic,
    pool: [...s.questions]
  }));

  const numTopics = pools.length;
  const quotas = new Array(numTopics).fill(Math.floor(targetCount / numTopics));
  let remainder = targetCount % numTopics;

  const indices = pools.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  for (let i = 0; i < remainder; i++) {
    quotas[indices[i]]++;
  }

  let deficit = 0;
  for (let i = 0; i < numTopics; i++) {
    if (quotas[i] > pools[i].pool.length) {
      deficit += quotas[i] - pools[i].pool.length;
      quotas[i] = pools[i].pool.length;
    }
  }

  while (deficit > 0) {
    const availableIndices = pools
      .map((p, i) => (quotas[i] < p.pool.length ? i : -1))
      .filter(i => i >= 0);
    if (!availableIndices.length) break;
    const luckyIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    quotas[luckyIdx]++;
    deficit--;
  }

  const selected = [];
  for (let i = 0; i < numTopics; i++) {
    const qCount = quotas[i];
    if (qCount <= 0) continue;
    const pool = pools[i].pool;
    for (let j = pool.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [pool[j], pool[k]] = [pool[k], pool[j]];
    }
    selected.push(...pool.slice(0, qCount));
  }

  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }

  return selected;
}

async function startUniMixedPractice(courseData, requestedCount, durationMinutes) {
  showLoadingOverlay("Preparing Mixed Practice", "Loading course questions...");
  try {
    const availableTopics = (courseData.sections || [])
      .flatMap(s => s.topics || [])
      .filter(t => t.status !== "coming-soon" && t.dataFile);

    if (!availableTopics.length) {
      showToast("No practice topics available for this course yet.");
      return;
    }

    const topicQuestionSets = await Promise.all(
      availableTopics.map(async t => {
        try {
          const fileData = await fetchUniJson(t.dataFile);
          const qs = (fileData && fileData.questions) || [];
          return {
            topic: t.title,
            topicId: t.id,
            questions: qs.map(q => ({
              ...q,
              topic: t.title,
              topicId: t.id,
              subject: courseData.code,
              courseCode: courseData.code,
              isUniversity: true
            }))
          };
        } catch (e) {
          return { topic: t.title, topicId: t.id, questions: [] };
        }
      })
    );

    const validSets = topicQuestionSets.filter(s => s.questions.length > 0);
    const totalAvailable = validSets.reduce((sum, s) => sum + s.questions.length, 0);

    if (totalAvailable === 0) {
      showToast("Questions not available yet for this course.");
      return;
    }

    const targetK = Math.min(requestedCount, totalAvailable);
    const sampledQuestions = sampleStratifiedCourseQuestions(validSets, targetK);

    if (!sampledQuestions.length) {
      showToast("Unable to sample questions.");
      return;
    }

    const detail = `<dl class="session-confirm-summary">
      <div><dt>Course</dt><dd>${escapeHtml(courseData.code)} (${escapeHtml(courseData.title || "")})</dd></div>
      <div><dt>Format</dt><dd>Mixed Timed Practice (Hard-stop)</dd></div>
      <div><dt>Questions</dt><dd>${sampledQuestions.length} Questions across ${validSets.length} topics</dd></div>
      <div><dt>Time Limit</dt><dd>${durationMinutes} Minutes (~${Math.round((durationMinutes * 60) / sampledQuestions.length)}s per question)</dd></div>
    </dl>`;

    showConfirmDialog({
      title: `Start ${escapeHtml(courseData.code)} Mixed Practice?`,
      message: `You are about to begin a mixed timed session. Questions are drawn almost equally from all ${validSets.length} available topics and shuffled. Answers will automatically submit when the timer ends.`,
      detail,
      confirmLabel: "Begin Practice",
      cancelLabel: "Back to Course",
      onConfirm: () => {
        activeSession = {
          subject: courseData.code,
          topic: `Mixed Practice (${sampledQuestions.length} Qs)`,
          courseTitle: courseData.title,
          courseCode: courseData.code,
          isUniversity: true,
          isMixed: true,
          courseData,
          requestedCount: sampledQuestions.length,
          durationMinutes,
          deadline: null,
          started: false,
          finished: false,
          queue: sampledQuestions,
          sections: [{
            subject: courseData.code,
            name: `${courseData.code} · Mixed Timed Practice`,
            count: sampledQuestions.length,
            start: 0
          }],
          answers: sampledQuestions.map(() => ({ selected: null, confirmed: false, correct: false })),
          remoteId: null,
          index: 0,
          correct: 0,
          questionStartedAt: null,
          reportedComplete: false,
          timedOut: false,
          timeUpAcknowledged: false,
          mode: "timed"
        };
        saveActiveSession();
        route = "session";
        render();
      }
    });
  } catch (err) {
    showToast("Error preparing mixed practice session.");
  } finally {
    hideLoadingOverlay();
  }
}

async function showTopicConfigModal(courseCode, topicTitle, dataFile) {
  showLoadingOverlay("Loading topic", "Preparing question bank...");
  let data = null;
  try {
    data = await fetchUniJson(dataFile);
  } catch (err) {
    // handled below
  } finally {
    hideLoadingOverlay();
  }

  if (!data || !data.questions || !data.questions.length) {
    showToast("Questions not available yet for this topic.");
    return;
  }

  const totalQuestions = data.questions.length;
  const defaultPillTargets = [10, 20, 25, 30, 50].filter(v => v < totalQuestions);
  const qPillValues = [...defaultPillTargets, totalQuestions];
  let defaultQ = Math.min(25, totalQuestions);
  if (!qPillValues.includes(defaultQ) && qPillValues.length) {
    defaultQ = qPillValues[0];
  }

  document.querySelector("#uni-topic-config-backdrop")?.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "uni-topic-config-backdrop";
  backdrop.className = "uni-topic-config-backdrop";

  const qPillsHtml = qPillValues.map(v => {
    const label = v === totalQuestions ? `${v} (All)` : `${v}`;
    const isActive = v === defaultQ;
    return `<button type="button" class="uni-target-pill ${isActive ? "active" : ""}" data-val="${v}">${label}</button>`;
  }).join("");

  backdrop.innerHTML = `
    <div class="uni-topic-config-card" role="dialog" aria-modal="true" aria-labelledby="uni-modal-topic-title">
      <div class="uni-topic-config-header">
        <div class="uni-topic-config-badge-group">
          <span class="uni-topic-modal-code">${escapeHtml(courseCode)}</span>
          <span class="uni-topic-modal-badge">${totalQuestions} Questions in Bank</span>
        </div>
        <button class="uni-topic-config-close" id="uni-config-close" aria-label="Close dialog">✕</button>
      </div>

      <div class="uni-topic-config-title-wrap">
        <h2 id="uni-modal-topic-title">${escapeHtml(topicTitle)}</h2>
        <p class="uni-topic-config-desc">Select your target question count and practice mode. Untimed mode gives immediate anatomical feedback after each question, while timed mode simulates exam pressure.</p>
      </div>

      <div class="uni-target-config-grid">
        <div class="uni-target-card">
          <div class="uni-target-label">
            <span class="uni-target-name">Question Target</span>
            <span class="uni-target-hint">5 – ${totalQuestions} questions</span>
          </div>
          <div class="uni-stepper-wrap">
            <button type="button" class="uni-stepper-btn" id="uni-modal-q-dec" aria-label="Decrease question count">−</button>
            <div class="uni-stepper-val">
              <input type="number" id="uni-modal-target-q" min="5" max="${totalQuestions}" step="5" value="${defaultQ}" inputmode="numeric" aria-label="Number of questions">
              <span class="uni-stepper-unit">questions</span>
            </div>
            <button type="button" class="uni-stepper-btn" id="uni-modal-q-inc" aria-label="Increase question count">+</button>
          </div>
          <div class="uni-target-pills" id="uni-modal-q-pills">
            ${qPillsHtml}
          </div>
        </div>

        <div class="uni-target-card">
          <div class="uni-target-label">
            <span class="uni-target-name">Time Limit</span>
            <span class="uni-target-hint">0 = Untimed (∞) · up to 180m</span>
          </div>
          <div class="uni-stepper-wrap">
            <button type="button" class="uni-stepper-btn" id="uni-modal-m-dec" aria-label="Decrease time limit">−</button>
            <div class="uni-stepper-val">
              <input type="number" id="uni-modal-target-m" min="0" max="180" step="1" value="15" inputmode="numeric" aria-label="Time limit in minutes">
              <span class="uni-stepper-unit" id="uni-modal-m-unit">minutes</span>
            </div>
            <button type="button" class="uni-stepper-btn" id="uni-modal-m-inc" aria-label="Increase time limit">+</button>
          </div>
          <div class="uni-target-pills" id="uni-modal-m-pills">
            <button type="button" class="uni-target-pill" data-val="0" title="Untimed (No time limit)" aria-label="Untimed">∞</button>
            <button type="button" class="uni-target-pill" data-val="5">5m</button>
            <button type="button" class="uni-target-pill" data-val="10">10m</button>
            <button type="button" class="uni-target-pill active" data-val="15">15m</button>
            <button type="button" class="uni-target-pill" data-val="20">20m</button>
            <button type="button" class="uni-target-pill" data-val="30">30m</button>
          </div>
        </div>
      </div>

      <div class="uni-config-pace-banner" id="uni-modal-pace-banner">
        <div class="uni-config-pace-icon" id="uni-modal-pace-icon">⏱️</div>
        <div class="uni-config-pace-text">
          <strong id="uni-modal-pace-head">Timed Practice Mode</strong>
          <span id="uni-modal-pace-sub">Pace: ~36s per question · Exam countdown timer · Auto-submits on timer expiry</span>
        </div>
      </div>

      <div class="uni-topic-config-actions">
        <button type="button" class="button outline" id="uni-config-cancel-btn">Cancel</button>
        <button type="button" class="button accent uni-config-start-btn" id="uni-config-confirm-btn">
          <span>Start Practice</span>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const inputQ = backdrop.querySelector("#uni-modal-target-q");
  const inputM = backdrop.querySelector("#uni-modal-target-m");
  const unitM = backdrop.querySelector("#uni-modal-m-unit");
  const paceBanner = backdrop.querySelector("#uni-modal-pace-banner");
  const paceIcon = backdrop.querySelector("#uni-modal-pace-icon");
  const paceHead = backdrop.querySelector("#uni-modal-pace-head");
  const paceSub = backdrop.querySelector("#uni-modal-pace-sub");
  const qPills = backdrop.querySelectorAll("#uni-modal-q-pills .uni-target-pill");
  const mPills = backdrop.querySelectorAll("#uni-modal-m-pills .uni-target-pill");

  const closeModal = () => {
    backdrop.remove();
  };

  backdrop.querySelector("#uni-config-close")?.addEventListener("click", closeModal);
  backdrop.querySelector("#uni-config-cancel-btn")?.addEventListener("click", closeModal);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });

  const updateModalPace = () => {
    const qVal = Math.max(5, Math.min(totalQuestions, parseInt(inputQ?.value, 10) || defaultQ));
    const mVal = Math.max(0, Math.min(180, parseInt(inputM?.value, 10) || 0));

    if (mVal === 0) {
      if (unitM) unitM.textContent = "guided (∞)";
      paceBanner?.classList.add("untimed");
      if (paceIcon) paceIcon.textContent = "📖";
      if (paceHead) paceHead.textContent = "Guided Untimed Practice (∞)";
      if (paceSub) paceSub.textContent = `No time pressure · ${qVal} questions · Immediate rationale & answers after each question.`;
    } else {
      if (unitM) unitM.textContent = "minutes";
      paceBanner?.classList.remove("untimed");
      const secPerQ = Math.round((mVal * 60) / qVal);
      if (paceIcon) paceIcon.textContent = "⏱️";
      if (paceHead) paceHead.textContent = `Timed Practice · ${mVal} Minutes`;
      if (paceSub) paceSub.textContent = `Pace: ~${secPerQ}s per question · Countdown timer · Auto-submits on timer expiry`;
    }
  };

  const syncModalQPills = (val) => {
    qPills.forEach(p => p.classList.toggle("active", Number(p.dataset.val) === val));
  };

  const syncModalMPills = (val) => {
    mPills.forEach(p => p.classList.toggle("active", Number(p.dataset.val) === val));
  };

  backdrop.querySelector("#uni-modal-q-dec")?.addEventListener("click", () => {
    if (!inputQ) return;
    const current = parseInt(inputQ.value, 10) || defaultQ;
    const next = Math.max(5, current - 5);
    inputQ.value = next;
    syncModalQPills(next);
    updateModalPace();
  });

  backdrop.querySelector("#uni-modal-q-inc")?.addEventListener("click", () => {
    if (!inputQ) return;
    const current = parseInt(inputQ.value, 10) || defaultQ;
    const next = Math.min(totalQuestions, current + 5);
    inputQ.value = next;
    syncModalQPills(next);
    updateModalPace();
  });

  qPills.forEach(p => {
    p.addEventListener("click", () => {
      if (!inputQ) return;
      const val = Number(p.dataset.val);
      inputQ.value = val;
      syncModalQPills(val);
      updateModalPace();
    });
  });

  inputQ?.addEventListener("input", () => {
    const val = parseInt(inputQ.value, 10);
    syncModalQPills(val);
    updateModalPace();
  });

  backdrop.querySelector("#uni-modal-m-dec")?.addEventListener("click", () => {
    if (!inputM) return;
    const current = parseInt(inputM.value, 10) || 0;
    const step = current <= 10 ? 1 : 5;
    const next = Math.max(0, current - step);
    inputM.value = next;
    syncModalMPills(next);
    updateModalPace();
  });

  backdrop.querySelector("#uni-modal-m-inc")?.addEventListener("click", () => {
    if (!inputM) return;
    const current = parseInt(inputM.value, 10) || 0;
    const step = current < 10 ? 1 : 5;
    const next = Math.min(180, current + step);
    inputM.value = next;
    syncModalMPills(next);
    updateModalPace();
  });

  mPills.forEach(p => {
    p.addEventListener("click", () => {
      if (!inputM) return;
      const val = Number(p.dataset.val);
      inputM.value = val;
      syncModalMPills(val);
      updateModalPace();
    });
  });

  inputM?.addEventListener("input", () => {
    const val = parseInt(inputM.value, 10);
    syncModalMPills(val);
    updateModalPace();
  });

  updateModalPace();

  backdrop.querySelector("#uni-config-confirm-btn")?.addEventListener("click", () => {
    const qCount = Math.max(5, Math.min(totalQuestions, parseInt(inputQ?.value, 10) || defaultQ));
    const mCount = Math.max(0, Math.min(180, parseInt(inputM?.value, 10) || 0));
    closeModal();
    startUniConfiguredPractice(courseCode, topicTitle, data, qCount, mCount, dataFile);
  });
}

function startUniConfiguredPractice(courseCode, topicTitle, data, requestedCount, durationMinutes, dataFile = null) {
  const allQuestions = Array.isArray(data?.questions) ? data.questions : [];
  if (!allQuestions.length) {
    showToast("No questions available for this topic.");
    return;
  }

  const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
  const queue = shuffled.slice(0, Math.min(requestedCount, allQuestions.length));
  const isTimed = durationMinutes > 0;

  const sections = [{
    subject: courseCode,
    name: `${courseCode} - ${topicTitle}`,
    count: queue.length,
    start: 0
  }];

  const detail = `<dl class="session-confirm-summary">
    <div><dt>Course</dt><dd>${escapeHtml(courseCode)}</dd></div>
    <div><dt>Focus</dt><dd>${escapeHtml(topicTitle)}</dd></div>
    <div><dt>Questions</dt><dd>${queue.length} of ${allQuestions.length}</dd></div>
    <div><dt>Format</dt><dd>${isTimed ? `${durationMinutes} Minutes (~${Math.round((durationMinutes * 60) / queue.length)}s per question)` : "Guided practice (Untimed)"}</dd></div>
  </dl>`;

  showConfirmDialog({
    title: `Start ${escapeHtml(courseCode)} Practice?`,
    message: isTimed
      ? `You are about to begin a timed session on "${escapeHtml(topicTitle)}". Answers will automatically submit when the timer ends.`
      : `Begin guided untimed practice on "${escapeHtml(topicTitle)}". You'll get immediate anatomical rationale and answers after each question.`,
    detail,
    confirmLabel: "Begin Practice",
    cancelLabel: "Change Settings",
    onConfirm: () => {
      activeSession = {
        subject: courseCode,
        topic: topicTitle,
        dataFile,
        isUniversity: true,
        isMixed: false,
        requestedCount: queue.length,
        durationMinutes: isTimed ? durationMinutes : 0,
        deadline: null,
        started: false,
        finished: false,
        queue,
        sections,
        answers: queue.map(() => ({ selected: null, confirmed: false, correct: false })),
        remoteId: null,
        index: 0,
        correct: 0,
        questionStartedAt: null,
        reportedComplete: false,
        timedOut: false,
        timeUpAcknowledged: false,
        mode: isTimed ? "timed" : "normal"
      };
      saveActiveSession();
      route = "session";
      render();
    },
    onCancel: () => {
      if (dataFile) {
        showTopicConfigModal(courseCode, topicTitle, dataFile);
      }
    }
  });
}

async function startUniPractice(courseCode, topicTitle, dataFile, requestedCount = null, durationMinutes = null) {
  if (requestedCount === null || durationMinutes === null) {
    showTopicConfigModal(courseCode, topicTitle, dataFile);
    return;
  }

  showLoadingOverlay("Preparing practice", "Loading questions...");
  try {
    const data = await fetchUniJson(dataFile);
    if (!data || !data.questions || !data.questions.length) {
      showToast("Questions not available yet for this topic.");
      return;
    }
    startUniConfiguredPractice(courseCode, topicTitle, data, requestedCount, durationMinutes, dataFile);
  } catch (err) {
    showToast("Error loading question bank.");
  } finally {
    hideLoadingOverlay();
  }
}

// ─── End University Module ──────────────────────────────────────────────────

function render() {
  updateScreenWatermark();
  if (!authToken || !currentUser || !profile) return renderAuth();
  if (currentUser.must_change_password) return renderPasswordChange(true);
  if (route === "daily-sprint") return renderDailySprint();
  if (route === "home") return renderHome();
  if (route === "practice") return renderPractice();
  if (route === "challenges") return renderChallenges();
  if (route === "buddies") return renderBuddies();
  if (route === "session") return renderSession();
  if (route === "progress") return renderProgress();
  if (route === "university") return renderUniversity();
  if (route === "profile") return renderProfile();
  if (route === "achievements") return renderAchievements();
  if (route === "change-password") return renderPasswordChange(false);
}

function updateScreenWatermark() {
  const watermarkLayer = document.getElementById("screen-watermark-layer");
  if (!watermarkLayer) return;
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateFormatted = `${day} ${months[now.getMonth()]} ${now.getFullYear()}`;
  const stampText = `SEOMTORCH | FP | ${dateFormatted}`;
  let html = "";
  for (let i = 0; i < 40; i++) {
    html += `<span class="watermark-stamp">${escapeHtml(stampText)}</span>`;
  }
  watermarkLayer.innerHTML = html;
}

function initScreenProtection() {
  const shield = document.getElementById("screen-privacy-shield");
  let shieldTimer = null;

  function showShield() {
    document.body.classList.add("shield-active");
  }

  function hideShield() {
    document.body.classList.remove("shield-active");
  }

  // Defeat Snipping Tool (Win+Shift+S), external screen recorders & screenshot utilities:
  // When window loses focus or document becomes hidden, immediately frost and obscure the screen
  window.addEventListener("blur", () => {
    showShield();
  });

  window.addEventListener("focus", () => {
    hideShield();
    updateScreenWatermark();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      showShield();
    } else {
      hideShield();
      updateScreenWatermark();
    }
  });

  // Auto-refresh watermark date daily (every hour for midnight rollover)
  setInterval(updateScreenWatermark, 60 * 60 * 1000);

  // Mobile Screenshot Gesture Trapping (e.g. 3-Finger Swipe Down on Android / MIUI / ColorOS / OneUI)
  // Two fingers are allowed for pinch-to-zoom and natural navigation
  window.addEventListener("touchstart", (e) => {
    if (e.touches && e.touches.length >= 3) {
      e.preventDefault();
      e.stopPropagation();
      showShield();
      triggerPrintScreenBlock("Three-finger screenshot gesture detected.");
      return false;
    }
  }, { capture: true, passive: false });

  window.addEventListener("touchmove", (e) => {
    if (e.touches && e.touches.length >= 3) {
      e.preventDefault();
      e.stopPropagation();
      showShield();
      return false;
    }
  }, { capture: true, passive: false });

  window.addEventListener("touchend", (e) => {
    if (e.touches && e.touches.length >= 3) {
      showShield();
    }
  }, { capture: true, passive: false });

  // Screen recording API blocker
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
    navigator.mediaDevices.getDisplayMedia = function () {
      showShield();
      triggerPrintScreenBlock("Screen recording is strictly prohibited on Seomtorch.");
      return Promise.reject(new DOMException("Screen recording is disabled for exam integrity", "NotAllowedError"));
    };
  }

  // Clicking or tapping the shield returns focus immediately
  if (shield) {
    shield.addEventListener("click", () => {
      hideShield();
      window.focus();
    });
    shield.addEventListener("touchend", (e) => {
      if (!e.touches || e.touches.length === 0) {
        hideShield();
        window.focus();
      }
    });
  }

  // Intercept PrintScreen and flash the security shield
  function triggerPrintScreenBlock(customMsg) {
    showShield();
    if (shieldTimer) clearTimeout(shieldTimer);
    shieldTimer = setTimeout(() => {
      hideShield();
    }, 2000);

    // Overwrite system clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText("Screenshots and screen capture are strictly prohibited on Seomtorch.").catch(() => {});
    }
    showToast(customMsg || "Screenshots are restricted for exam and content security.");
  }

  window.addEventListener("keyup", (e) => {
    if (e.key === "PrintScreen" || e.keyCode === 44) {
      e.preventDefault();
      triggerPrintScreenBlock();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "PrintScreen" || e.keyCode === 44) {
      e.preventDefault();
      triggerPrintScreenBlock();
      return false;
    }

    // Hardware screenshot key detection (e.g. Volume Down + Power button on mobile)
    if (e.key === "AudioVolumeDown" || e.key === "AudioVolumeUp" || e.keyCode === 24 || e.keyCode === 25) {
      showShield();
      triggerPrintScreenBlock("Hardware screenshot attempt blocked.");
    }

    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    // Block Print dialog (Ctrl+P / Cmd+P)
    if (isCtrlOrCmd && (e.key === "p" || e.key === "P" || e.keyCode === 80)) {
      e.preventDefault();
      showToast("Printing is prohibited on Seomtorch.");
      return false;
    }

    // Block Webpage Save (Ctrl+S / Cmd+S)
    if (isCtrlOrCmd && (e.key === "s" || e.key === "S" || e.keyCode === 83)) {
      e.preventDefault();
      return false;
    }

    // Block Source view (Ctrl+U / Cmd+U)
    if (isCtrlOrCmd && (e.key === "u" || e.key === "U" || e.keyCode === 85)) {
      e.preventDefault();
      return false;
    }

    // Block DevTools shortcuts
    if (e.key === "F12" || e.keyCode === 123) {
      e.preventDefault();
      return false;
    }
    if (isCtrlOrCmd && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c")) {
      e.preventDefault();
      return false;
    }
  });

  // Block context menu (right click) except inside inputs / textareas
  document.addEventListener("contextmenu", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      return true;
    }
    e.preventDefault();
    return false;
  });

  // Prevent drag & drop
  document.addEventListener("dragstart", (e) => {
    if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
    }
  });

  // Block copying of questions or test content
  document.addEventListener("copy", (e) => {
    const isInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA";
    if (!isInput) {
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.setData("text/plain", "Screenshots and content copying are restricted on Seomtorch.");
      }
      showToast("Content copying is disabled for test security.");
    }
  });

  updateScreenWatermark();
}

async function init() {
  try {
    db = await openDatabase();
    await Promise.all([loadQuestions(), loadData()]);
    if (authToken && currentUser) {
      await prepareLocalUser(currentUser);
      const savedSession = restoreActiveSession();
      if (savedSession) {
        activeSession = savedSession;
        route = "session";
        if (activeSession.started && activeSession.mode !== "normal" && activeSession.deadline) {
          if (Date.now() >= activeSession.deadline) {
            activeSession.timedOut = true;
            activeSession.finished = true;
            clearActiveSession();
          }
        }
        showToast("Resumed your active practice session.");
      }
      render();
    } else {
      renderAuth();
    }
    dismissAppLoader();
    await loadSubscriptionState();
    const authenticated = await restoreAuth();
    render();
    if (authenticated) {
      syncPendingAttempts();
      loadChallenges();
    }
    window.addEventListener("online", async () => { if (authToken) { await syncPendingAttempts(); render(); } });
    window.addEventListener("offline", () => { if (route !== "session") render(); });
    document.addEventListener("visibilitychange", async () => { if (document.visibilityState === "visible" && authToken && route !== "session") { await syncPendingAttempts(); render(); } });
    window.addEventListener("beforeunload", (e) => {
      if (activeSession?.started && !activeSession.finished && route === "session") {
        saveActiveSession();
        e.preventDefault();
        e.returnValue = "";
      }
    });
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  } catch (error) {
    console.error(error);
    app.innerHTML = `<main class="onboard-form" style="min-height:100dvh"><div><p class="eyebrow">Unable to start</p><h1>Seomtorch needs a local web server.</h1><p class="lede">Open this project through localhost or a secure website so its question bank and offline storage can load correctly.</p><p><code>npx serve .</code></p></div></main>`;
  } finally {
    dismissAppLoader();
    initScreenProtection();
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
      saveActiveSession();
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
          <div class="session-status"><span>${activeSession.index + 1} of ${activeSession.queue.length}</span><button class="session-calculator-btn" id="session-calc-toggle" type="button" aria-label="JAMB Calculator" title="JAMB Calculator (Alt+C)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg><span>Calculator</span></button></div>
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
    <button class="mobile-calc-fab" id="mobile-calc-fab" type="button" aria-label="Open JAMB Calculator" title="JAMB Calculator"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg><span>Calculator</span></button>
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



/* ─── Upgrade Modal & Paystack Checkout ────────────────────────────────── */

function showUpgradeModal(options = {}) {
  document.querySelector("#upgrade-modal-backdrop")?.remove();

  const trigger = options.trigger || "general";
  const defaultCourse = options.courseCode ? options.courseCode.toUpperCase() : "ANA 201";

  api.logMonetizationEvent(authToken, "upgrade_screen_viewed", {
    trigger,
    course: defaultCourse,
    topic: options.topicTitle || null
  }).catch(() => {});

  let selectedPlan = "all_access"; // default to all_access
  let selectedCourse = defaultCourse;
  let appliedDiscount = null;

  const config = subscriptionConfig || {};
  const singlePrice = config.single_course_price || 1500;
  const regularAllPrice = config.all_access_price || 3000;
  const launchOffer = config.launch_offer || {};
  const isLaunchActive = Boolean(launchOffer.active);
  const currentAllPrice = config.current_all_access_price || (isLaunchActive ? (launchOffer.price || 2000) : 3000);
  const trialEligible = !userAccessData?.trial_used && Boolean(authToken);

  const backdrop = document.createElement("div");
  backdrop.id = "upgrade-modal-backdrop";
  backdrop.className = "upgrade-modal-backdrop";

  const renderModalContent = () => {
    const rawPrice = selectedPlan === "all_access" ? currentAllPrice : singlePrice;
    const finalPrice = appliedDiscount ? appliedDiscount.discounted_price : rawPrice;

    backdrop.innerHTML = `
      <div class="upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="upgrade-modal-title">
        <div class="upgrade-header">
          <div>
            <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(45,106,79,0.1);color:var(--forest);font-size:11px;font-weight:800;letter-spacing:0.5px;padding:3px 10px;border-radius:10px;margin-bottom:6px;text-transform:uppercase;">
              <span>⭐ Seomtorch Medical Pass</span>
            </div>
            <h2 id="upgrade-modal-title" style="margin:0;font-size:20px;font-weight:800;color:var(--ink);">Unlock Full Course Access</h2>
            <p style="margin:4px 0 0;font-size:13px;color:var(--muted);">Instant automatic unlock across medical anatomy and physiology.</p>
          </div>
          <button type="button" class="uni-topic-config-close" id="upgrade-modal-close" aria-label="Close dialog">✕</button>
        </div>

        ${trialEligible ? `
        <div class="upgrade-trial-callout">
          <div>
            <strong>🎁 Eligible for 3-Day Free Trial</strong>
            <p>Get full 72-hour access to all 3 courses immediately. No card required.</p>
          </div>
          <button type="button" class="button small accent" id="upgrade-activate-trial">Activate Free Trial</button>
        </div>` : ""}

        <div class="upgrade-plans-grid">
          <div class="upgrade-plan-card ${selectedPlan === "single_course" ? "selected" : ""}" id="plan-single-course" role="button" tabindex="0">
            <div class="upgrade-plan-head">
              <h3 class="upgrade-plan-title">Single Course</h3>
              <div class="upgrade-plan-price">₦${singlePrice.toLocaleString()} <small>/ semester</small></div>
            </div>
            <p style="font-size:12px;color:var(--muted);margin:0;">Full access to 1 chosen course through semester exams.</p>
            <div style="margin-top:4px;">
              <label style="font-size:11px;font-weight:700;color:var(--ink-secondary);display:block;margin-bottom:4px;">Choose Course:</label>
              <select id="upgrade-course-select" class="input" style="padding:6px 10px;font-size:12px;width:100%;font-weight:700;">
                <option value="ANA 201" ${selectedCourse === "ANA 201" ? "selected" : ""}>ANA 201: Upper & Lower Limb</option>
                <option value="ANA 203" ${selectedCourse === "ANA 203" ? "selected" : ""}>ANA 203: Systemic Embryology</option>
                <option value="PIO 201" ${selectedCourse === "PIO 201" ? "selected" : ""}>PIO 201: Medical Physiology</option>
              </select>
            </div>
            <ul class="upgrade-plan-features">
              <li><span class="check">✓</span> All topics &amp; worked solutions</li>
              <li><span class="check">✓</span> Topic drills &amp; audio notes</li>
              <li><span class="check">✓</span> Pass until semester end date</li>
            </ul>
          </div>

          <div class="upgrade-plan-card ${selectedPlan === "all_access" ? "selected" : ""}" id="plan-all-access" role="button" tabindex="0">
            ${isLaunchActive ? `<div class="upgrade-plan-ribbon">Launch Offer · Save ₦${(regularAllPrice - currentAllPrice).toLocaleString()}</div>` : `<div class="upgrade-plan-ribbon">Most Popular</div>`}
            <div class="upgrade-plan-head">
              <h3 class="upgrade-plan-title">All-Access Pass</h3>
              <div class="upgrade-plan-price">
                ₦${currentAllPrice.toLocaleString()} <small>/ semester</small>
                ${isLaunchActive ? `<div style="font-size:11px;color:var(--muted);text-decoration:line-through;font-weight:500;">₦${regularAllPrice.toLocaleString()}</div>` : ""}
              </div>
            </div>
            <p style="font-size:12px;color:var(--muted);margin:0;">Unlock all 3 courses (ANA 201, ANA 203, PIO 201).</p>
            <ul class="upgrade-plan-features">
              <li><span class="check">✓</span> <strong>All 3 Courses</strong> fully unlocked</li>
              <li><span class="check">✓</span> <strong>Timed Mock Exams</strong> across topics</li>
              <li><span class="check">✓</span> <strong>Weak-Topic Diagnostic</strong> analytics</li>
              <li><span class="check">✓</span> <strong>Create Challenges</strong> &amp; leaderboards</li>
              <li><span class="check">✓</span> All conversational audio podcasts</li>
            </ul>
          </div>
        </div>

        <div class="upgrade-discount-box">
          <label style="font-size:11.5px;font-weight:700;color:var(--ink-secondary);display:flex;justify-content:space-between;align-items:center;">
            <span>Class Code / Discount Code</span>
            <span style="font-size:10.5px;color:var(--muted);font-weight:500;">e.g. your class group code</span>
          </label>
          ${appliedDiscount ? `
            <div class="upgrade-discount-badge">
              <span>🎉 ${escapeHtml(appliedDiscount.label || appliedDiscount.code)}: ₦${appliedDiscount.discounted_price.toLocaleString()}</span>
              <button type="button" id="remove-discount-btn" style="background:none;border:none;cursor:pointer;color:#065f46;font-size:14px;padding:0 4px;font-weight:800;" aria-label="Remove code">✕</button>
            </div>
          ` : `
            <div class="upgrade-discount-input-row">
              <input type="text" id="discount-code-input" class="input" placeholder="ENTER CODE (e.g. MEDILAG24)" autocomplete="off">
              <button type="button" class="button outline small" id="apply-discount-btn" style="white-space:nowrap;">Apply</button>
            </div>
          `}
          <div id="discount-error-text" style="color:var(--crimson);font-size:11.5px;display:none;"></div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          <button type="button" class="button accent" id="upgrade-checkout-btn" style="width:100%;padding:14px;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px;">
            <span>Pay ₦${finalPrice.toLocaleString()} with Paystack</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
          <div class="upgrade-security-badge">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>Secured by Paystack · 256-bit encryption · Instant automatic unlock</span>
          </div>
        </div>
      </div>
    `;

    bindModalEvents();
  };

  const bindModalEvents = () => {
    backdrop.querySelector("#upgrade-modal-close")?.addEventListener("click", () => backdrop.remove());

    backdrop.querySelector("#plan-single-course")?.addEventListener("click", (e) => {
      if (e.target.tagName === "SELECT") return;
      selectedPlan = "single_course";
      appliedDiscount = null;
      renderModalContent();
    });

    backdrop.querySelector("#plan-all-access")?.addEventListener("click", () => {
      selectedPlan = "all_access";
      appliedDiscount = null;
      renderModalContent();
    });

    backdrop.querySelector("#upgrade-course-select")?.addEventListener("change", (e) => {
      selectedCourse = e.target.value;
    });

    backdrop.querySelector("#upgrade-activate-trial")?.addEventListener("click", async () => {
      if (!authToken) {
        backdrop.remove();
        showToast("Please sign in or create an account to start your free trial.");
        route = "home";
        authMode = "register";
        renderAuth();
        return;
      }
      showLoadingOverlay("Starting Free Trial", "Unlocking courses...");
      try {
        const res = await api.startTrial(authToken);
        userAccessData = res.user_access;
        hideLoadingOverlay();
        backdrop.remove();
        showToast("🎉 3-Day Free Trial Activated! All courses unlocked.");
        render();
      } catch (err) {
        hideLoadingOverlay();
        showToast(err.message || "Could not start trial.");
      }
    });

    backdrop.querySelector("#apply-discount-btn")?.addEventListener("click", async () => {
      const input = backdrop.querySelector("#discount-code-input");
      const errBox = backdrop.querySelector("#discount-error-text");
      const codeStr = (input?.value || "").trim();
      if (!codeStr) return;
      try {
        if (errBox) errBox.style.display = "none";
        const res = await api.validateDiscountCode(codeStr, selectedPlan);
        if (res.valid) {
          appliedDiscount = res;
          renderModalContent();
          showToast(`Discount applied: ${res.label}`);
        }
      } catch (err) {
        if (errBox) {
          errBox.textContent = err.message || "Invalid discount code.";
          errBox.style.display = "block";
        }
      }
    });

    backdrop.querySelector("#remove-discount-btn")?.addEventListener("click", () => {
      appliedDiscount = null;
      renderModalContent();
    });

    backdrop.querySelector("#upgrade-checkout-btn")?.addEventListener("click", async () => {
      const btn = backdrop.querySelector("#upgrade-checkout-btn");
      if (!authToken) {
        backdrop.remove();
        showToast("Please sign in or register to secure your course subscription.");
        route = "home";
        authMode = "register";
        renderAuth();
        return;
      }

      btn.disabled = true;
      btn.textContent = "Connecting to Paystack...";

      try {
        api.logMonetizationEvent(authToken, "upgrade_button_tapped", {
          plan: selectedPlan,
          course: selectedCourse,
          discount_code: appliedDiscount?.code || null
        }).catch(() => {});

        const initRes = await api.initPayment(authToken, {
          access_type: selectedPlan,
          course_code: selectedPlan === "single_course" ? selectedCourse : "all",
          discount_code: appliedDiscount?.code || ""
        });

        // Check if PaystackPop inline is available
        const hasLiveKey = initRes.public_key && !initRes.public_key.startsWith("test_dummy");
        if (window.PaystackPop && hasLiveKey) {
          const handler = window.PaystackPop.setup({
            key: initRes.public_key,
            email: initRes.email || currentUser?.email,
            amount: initRes.amount_kobo,
            currency: "NGN",
            ref: initRes.reference,
            callback: async function(paystackCallback) {
              showLoadingOverlay("Verifying Payment", "Activating your course access...");
              try {
                const verifyRes = await api.verifyPayment(authToken, paystackCallback.reference || initRes.reference);
                userAccessData = verifyRes.user_access;
                hideLoadingOverlay();
                backdrop.remove();
                showToast("🎉 Payment verified! Course access is now active.");
                render();
              } catch (vErr) {
                hideLoadingOverlay();
                showToast(vErr.message || "Payment verification error. Please contact support.");
              }
            },
            onClose: function() {
              btn.disabled = false;
              renderModalContent();
              showToast("Payment window closed.");
            }
          });
          handler.openIframe();
        } else {
          // Dev test mode fallback (or before live Paystack keys are entered)
          backdrop.remove();
          showConfirmDialog({
            title: "Confirm Paystack Payment (Test Mode)",
            message: `Simulate payment of ₦${initRes.amount.toLocaleString()} for ${initRes.access_type === "all_access" ? "All-Access Pass" : initRes.course_code}?`,
            confirmLabel: "Complete Payment",
            cancelLabel: "Cancel",
            onConfirm: async () => {
              showLoadingOverlay("Activating Access", "Unlocking course materials...");
              try {
                const verifyRes = await api.verifyPayment(authToken, initRes.reference);
                userAccessData = verifyRes.user_access;
                hideLoadingOverlay();
                showToast("🎉 Payment verified! Course access unlocked.");
                render();
              } catch (vErr) {
                hideLoadingOverlay();
                showToast(vErr.message || "Could not complete payment.");
              }
            }
          });
        }
      } catch (err) {
        btn.disabled = false;
        renderModalContent();
        showToast(err.message || "Could not initialize checkout. Please try again.");
      }
    });
  };

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  document.body.appendChild(backdrop);
  renderModalContent();
}

window.showUpgradeModal = showUpgradeModal;

/* ==========================================================================
   University Notebook (Study Notes) Functions
   ========================================================================== */

function stopUniNoteAudio() {
  if ("speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch {}
  }
  uniNotePlayingBlockId = null;
}

function toggleUniNoteAudio(blockId, textToSpeak) {
  if (!("speechSynthesis" in window)) {
    showToast("Audio guide is not supported on this browser.");
    return;
  }
  if (uniNotePlayingBlockId === blockId) {
    stopUniNoteAudio();
    render();
    return;
  }
  stopUniNoteAudio();
  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  utterance.rate = Number(uniNoteSpeechRate) || 1.0;
  utterance.pitch = 1.0;
  utterance.onend = () => {
    uniNotePlayingBlockId = null;
    render();
  };
  utterance.onerror = () => {
    uniNotePlayingBlockId = null;
    render();
  };
  uniNotePlayingBlockId = blockId;
  window.speechSynthesis.speak(utterance);
  render();
}

function showDiagramLightbox(src, title) {
  const existing = document.querySelector("#uni-diagram-lightbox");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "uni-diagram-lightbox";
  modal.className = "uni-lightbox-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", title || "Anatomical Diagram");
  modal.innerHTML = `
    <div class="uni-lightbox-content">
      <button class="uni-lightbox-close" type="button" aria-label="Close diagram">✕</button>
      <img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" class="uni-lightbox-img">
      <div class="uni-lightbox-title">${escapeHtml(title)}</div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector(".uni-lightbox-close")?.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  const handleKey = (e) => {
    if (e.key === "Escape") {
      close();
      window.removeEventListener("keydown", handleKey);
    }
  };
  window.addEventListener("keydown", handleKey);
}

async function renderUniNote() {
  const dept = uniDepartments?.find(d => d.id === uniDeptId);
  if (!dept) { uniRoute = "departments"; return renderUniDepartments(); }

  const noteData = await fetchUniJson(uniNoteFile);
  if (!noteData) {
    const breadcrumbs = [
      { label: "University", action: () => { uniRoute = "departments"; uniDeptId = null; uniLevel = null; uniCourseId = null; uniNoteFile = null; stopUniNoteAudio(); } },
      { label: dept.name, action: () => { uniRoute = "levels"; uniLevel = null; uniCourseId = null; uniNoteFile = null; stopUniNoteAudio(); } },
      { label: `${uniLevel} Level`, action: () => { uniRoute = "courses"; uniCourseId = null; uniNoteFile = null; stopUniNoteAudio(); } },
      { label: uniCourseId ? uniCourseId.toUpperCase() : "Course", action: () => { uniRoute = "course"; uniNoteFile = null; stopUniNoteAudio(); } },
      { label: "Notebook" }
    ];
    app.innerHTML = uniShell(`<div class="uni-empty"><h2>Unable to load notebook</h2><p>Please check your connection and try again.</p><button class="button uni-btn" id="uni-back-course">← Back to course</button></div>`, breadcrumbs);
    bindShell(); bindUniCrumbs(breadcrumbs);
    document.querySelector("#uni-back-course")?.addEventListener("click", () => { uniRoute = "course"; uniNoteFile = null; stopUniNoteAudio(); render(); });
    return;
  }

  const breadcrumbs = [
    { label: "University", action: () => { uniRoute = "departments"; uniDeptId = null; uniLevel = null; uniCourseId = null; uniNoteFile = null; stopUniNoteAudio(); } },
    { label: dept.name, action: () => { uniRoute = "levels"; uniLevel = null; uniCourseId = null; uniNoteFile = null; stopUniNoteAudio(); } },
    { label: `${uniLevel} Level`, action: () => { uniRoute = "courses"; uniCourseId = null; uniNoteFile = null; stopUniNoteAudio(); } },
    { label: noteData.courseCode || (uniCourseId ? uniCourseId.toUpperCase() : "Course"), action: () => { uniRoute = "course"; uniNoteFile = null; stopUniNoteAudio(); } },
    { label: noteData.noteTitle || "Notebook" }
  ];

  const allBlocks = noteData.blocks || [];
  const totalBlocks = allBlocks.length;
  const categories = ["all", ...new Set(allBlocks.map(b => b.category))];
  const filteredBlocks = uniNoteCategoryFilter === "all" ? allBlocks : allBlocks.filter(b => b.category === uniNoteCategoryFilter);

  // Check monetization access level for this course notebook
  const courseCode = noteData.courseCode || (uniCourseId ? uniCourseId.toUpperCase() : "ANA 201");
  const isNoteFullyUnlocked = hasCourseAccess(courseCode);

  // Ensure active block exists
  let activeBlock = allBlocks.find(b => b.number === uniNoteActiveBlock);
  if (!activeBlock && allBlocks.length > 0) {
    activeBlock = allBlocks[0];
    uniNoteActiveBlock = activeBlock.number;
  }

  // Saved checklist items
  const checklistKey = `seomtorch_note_check_${noteData.id || "upper_limb"}`;
  let savedChecks = {};
  try { savedChecks = JSON.parse(localStorage.getItem(checklistKey) || "{}"); } catch {}
  const checklistItems = noteData.checklist || [];
  const checkedCount = checklistItems.filter((_, idx) => Boolean(savedChecks[idx])).length;

  // Helper to render locked block card for free tier students
  const renderLockedBlockCardHtml = (b) => {
    return `
      <article class="uni-block-card locked-block-card" id="${escapeHtml(b.id)}">
        <header class="uni-block-header">
          <div>
            <div class="uni-block-badges">
              <span class="uni-block-num-pill">BLOCK ${String(b.number).padStart(2, "0")}</span>
              <span class="uni-block-cat-pill">${escapeHtml(b.category)}</span>
              <span class="uni-block-lock-pill">🔒 Course Access Required</span>
            </div>
            <h2 class="uni-block-title">${escapeHtml(b.title)}</h2>
          </div>
        </header>

        <div class="uni-block-locked-body">
          <div class="uni-block-blurred-skeleton" aria-hidden="true">
            <div class="skeleton-diagram-box">
              <div class="skeleton-shape circle"></div>
              <div class="skeleton-shape bar"></div>
            </div>
            <div class="skeleton-text-lines">
              <div class="skeleton-line" style="width: 90%;"></div>
              <div class="skeleton-line" style="width: 78%;"></div>
              <div class="skeleton-line" style="width: 86%;"></div>
              <div class="skeleton-line" style="width: 65%;"></div>
            </div>
            <div class="skeleton-podcast-box">
              <div class="skeleton-icon"></div>
              <div class="skeleton-line" style="width: 48%;"></div>
            </div>
          </div>

          <div class="uni-block-locked-overlay">
            <div class="locked-shield-icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3 class="locked-cta-title">Unlock Block ${b.number}: ${escapeHtml(b.title)}</h3>
            <p class="locked-cta-desc">
              Block 01 is open for free trial reading. Upgrade to <strong>${escapeHtml(courseCode)} Course Access</strong> or <strong>All-Access</strong> to unlock all ${totalBlocks} illustrated blocks, high-yield diagrams, audio podcasts, and self-test recall guides.
            </p>
            <div class="locked-feature-tags">
              <span class="locked-tag">✓ All ${totalBlocks} Illustrated Blocks</span>
              <span class="locked-tag">✓ Audio Podcasts on Every Block</span>
              <span class="locked-tag">✓ Quick Recall Answer Guides</span>
            </div>
            <div class="locked-cta-actions">
              <button type="button" class="button uni-btn locked-upgrade-trigger" data-course-code="${escapeHtml(courseCode)}" style="background:linear-gradient(135deg, #d97706, #b45309); color:#fff; font-weight:700; padding:12px 24px;">
                <span>Unlock Course Access</span>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <button type="button" class="button outline small" id="uni-return-free-block" style="border-color:#cedbd1; color:var(--ink);">
                ← Back to Free Block 01
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  };

  // Helper to render blurred preview card in continuous mode
  const renderBlurredBlockPreviewHtml = (b) => {
    if (!b) return "";
    return `
      <article class="uni-block-card blurred-preview-card" style="margin-bottom:16px;">
        <header class="uni-block-header">
          <div>
            <div class="uni-block-badges">
              <span class="uni-block-num-pill">BLOCK ${String(b.number).padStart(2, "0")}</span>
              <span class="uni-block-cat-pill">${escapeHtml(b.category)}</span>
            </div>
            <h2 class="uni-block-title">${escapeHtml(b.title)}</h2>
          </div>
        </header>
        <div class="skeleton-diagram-box" style="height:140px; margin:12px 0;"></div>
        <div class="skeleton-text-lines" style="gap:8px;">
          <div class="skeleton-line" style="width: 90%; height:12px;"></div>
          <div class="skeleton-line" style="width: 80%; height:12px;"></div>
          <div class="skeleton-line" style="width: 70%; height:12px;"></div>
        </div>
      </article>
    `;
  };

  // Helper to render a block
  const renderBlockCardHtml = (b) => {
    const isPlaying = uniNotePlayingBlockId === b.id;
    const podcastJoined = (b.podcast || []).join(" ");
    const isRecallRevealed = Boolean(uniNoteRevealedMap[b.id]);

    const notesListHtml = (b.notes || []).map(noteText => {
      return `<li class="uni-notes-item">
        <svg class="uni-notes-bullet" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
        <span>${escapeHtml(noteText)}</span>
      </li>`;
    }).join("");

    const isTranscriptOpen = Boolean(uniNoteTranscriptOpenMap[b.id]);
    let podcastSubtitle = "Interactive dialogue & voice walkthrough";
    if (isPlaying) {
      podcastSubtitle = `Audio guide playing (${uniNoteSpeechRate}x) • Tap Stop to pause`;
    } else if (isTranscriptOpen) {
      podcastSubtitle = "Transcript visible • Tap Play to listen";
    }

    const podcastHtml = (b.podcast && b.podcast.length) ? `
      <div class="uni-podcast-card ${isTranscriptOpen ? "has-transcript" : ""} ${isPlaying ? "is-playing" : ""}">
        <div class="uni-podcast-header">
          <div class="uni-podcast-title-wrap">
            <span class="uni-podcast-icon-badge ${isPlaying ? "pulse-badge" : ""}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
              </svg>
            </span>
            <div>
              <h4 class="uni-podcast-title">Conversational Audio Guide &amp; Podcast</h4>
              <span class="uni-podcast-subtitle">${escapeHtml(podcastSubtitle)}</span>
            </div>
          </div>
          <div class="uni-podcast-controls">
            <button class="uni-audio-speed-btn" data-audio-speed-toggle="true" type="button" title="Playback speed (tap to cycle: 1x, 1.25x, 1.5x)">${uniNoteSpeechRate}x</button>
            <button class="uni-audio-btn ${isPlaying ? "playing" : ""}" type="button" data-audio-block-id="${escapeHtml(b.id)}" data-audio-text="${escapeHtml(podcastJoined)}" aria-label="${isPlaying ? "Stop audio guide" : "Play audio guide"}">
              ${isPlaying ? `
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                <span>Stop</span>
              ` : `
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>Play</span>
              `}
            </button>
            <button class="uni-podcast-transcript-btn ${isTranscriptOpen ? "active" : ""}" type="button" data-transcript-toggle="${escapeHtml(b.id)}" aria-expanded="${isTranscriptOpen}" aria-label="${isTranscriptOpen ? "Hide transcript" : "Show transcript"}">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span>${isTranscriptOpen ? "Hide Transcript" : "Transcript"}</span>
              <svg class="uni-transcript-chevron ${isTranscriptOpen ? "rotated" : ""}" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="${isTranscriptOpen ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"}"/>
              </svg>
            </button>
          </div>
        </div>
        ${isTranscriptOpen ? `
          <div class="uni-podcast-text">
            <div class="uni-transcript-banner">
              <span class="uni-transcript-badge">Full Transcript</span>
              <span class="uni-transcript-hint">Read along with the conversational audio walkthrough</span>
            </div>
            ${b.podcast.map(pText => `<p>${escapeHtml(pText)}</p>`).join("")}
            <div class="uni-podcast-footer-listen">
              <button class="uni-audio-btn ${isPlaying ? "playing" : ""}" type="button" data-audio-block-id="${escapeHtml(b.id)}" data-audio-text="${escapeHtml(podcastJoined)}">
                ${isPlaying ? `
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                  <span>Stop Audio Guide</span>
                ` : `
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <span>Play Audio Guide (${uniNoteSpeechRate}x)</span>
                `}
              </button>
            </div>
          </div>
        ` : ""}
      </div>
    ` : "";

    const recallQuestionsHtml = (b.quickRecall && b.quickRecall.length) ? `
      <div class="uni-recall-card">
        <div class="uni-recall-header">
          <div class="uni-recall-title-group">
            <span class="uni-recall-badge">Quick Recall</span>
            <span style="font-size:12px; font-weight:600; color:var(--muted);">Self-Test Active Recall</span>
          </div>
          <button class="uni-recall-reveal-btn" data-recall-toggle="${escapeHtml(b.id)}">
            ${isRecallRevealed ? "Hide Answer Guide" : "Reveal Answer Guide"}
          </button>
        </div>
        <div class="uni-recall-q-list">
          ${b.quickRecall.map(q => `<div class="uni-recall-q-item">❓ ${escapeHtml(q)}</div>`).join("")}
        </div>
        ${isRecallRevealed ? `
          <div class="uni-recall-answer-box">
            <strong>Key takeaway for this block:</strong>
            <ul style="margin:6px 0 0 16px; padding:0;">
              ${(b.notes || []).slice(0, 3).map(n => `<li>${escapeHtml(n)}</li>`).join("")}
            </ul>
          </div>
        ` : ""}
      </div>
    ` : "";

    return `
      <article class="uni-block-card" id="${escapeHtml(b.id)}">
        <header class="uni-block-header">
          <div>
            <div class="uni-block-badges">
              <span class="uni-block-num-pill">BLOCK ${String(b.number).padStart(2, "0")}</span>
              <span class="uni-block-cat-pill">${escapeHtml(b.category)}</span>
            </div>
            <h2 class="uni-block-title">${escapeHtml(b.title)}</h2>
          </div>
        </header>

        ${b.image ? `
          <div class="uni-diagram-frame" data-diagram-src="${escapeHtml(b.image)}" data-diagram-title="${escapeHtml(b.title)}">
            <img src="${escapeHtml(b.image)}" alt="${escapeHtml(b.title)} anatomical diagram" class="uni-diagram-img" loading="lazy">
            <span class="uni-diagram-caption">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              Click diagram to expand full size
            </span>
          </div>
        ` : ""}

        <div class="uni-notes-section">
          <h3 class="uni-section-subhead">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Key Anatomical Facts &amp; Landmarks
          </h3>
          <ul class="uni-notes-list">
            ${notesListHtml}
          </ul>
        </div>

        ${podcastHtml}
        ${recallQuestionsHtml}
      </article>
    `;
  };

  // Filter Bar HTML
  const filterPillsHtml = categories.map(cat => {
    const label = cat === "all" ? `All Blocks (${totalBlocks})` : cat;
    const isActive = uniNoteCategoryFilter === cat;
    return `<button class="uni-note-filter-pill ${isActive ? "active" : ""}" data-category-filter="${escapeHtml(cat)}">${escapeHtml(label)}</button>`;
  }).join("");

  // Glossary HTML
  const glossaryHtml = (noteData.glossary && noteData.glossary.length && uniNoteGlossaryOpen) ? `
    <section class="uni-glossary-card">
      <div class="uni-glossary-header">
        <div class="uni-glossary-title-group">
          <h3 class="uni-glossary-title">Essential Anatomical Terms</h3>
          <span class="uni-glossary-badge">${noteData.glossary.length} Defined Terms</span>
        </div>
        <button class="uni-note-tool-btn" id="uni-glossary-close-btn" style="padding:4px 10px;">Close ✕</button>
      </div>
      <div class="uni-glossary-grid">
        ${noteData.glossary.map(termObj => `
          <div class="uni-term-card">
            <span class="uni-term-name">${escapeHtml(termObj.term)}</span>
            <span class="uni-term-def">${escapeHtml(termObj.definition)}</span>
          </div>
        `).join("")}
      </div>
    </section>
  ` : "";

  // Content body depending on view mode
  let contentBodyHtml = "";

  if (uniNoteViewMode === "step") {
    const isCurrentBlockUnlocked = isNoteFullyUnlocked || activeBlock.number === 1;
    const progressPercent = Math.round((activeBlock.number / totalBlocks) * 100);
    const selectOptionsHtml = allBlocks.map(b => {
      const isBlockUnlocked = isNoteFullyUnlocked || b.number === 1;
      return `
        <option value="${b.number}" ${b.number === activeBlock.number ? "selected" : ""}>
          Block ${String(b.number).padStart(2, "0")}: ${escapeHtml(b.title)}${isBlockUnlocked ? "" : " 🔒 (Locked)"}
        </option>
      `;
    }).join("");

    const blockCardContent = isCurrentBlockUnlocked
      ? renderBlockCardHtml(activeBlock)
      : renderLockedBlockCardHtml(activeBlock);

    contentBodyHtml = `
      <div class="uni-note-step-tracker">
        <div class="uni-step-info">
          <span class="uni-step-number-badge">Step ${activeBlock.number} of ${totalBlocks}</span>
          <span class="uni-step-title-text">${escapeHtml(activeBlock.title)}</span>
        </div>
        <div class="uni-step-progress-outer" title="${progressPercent}% completed">
          <div class="uni-step-progress-fill" style="width: ${progressPercent}%;"></div>
        </div>
        <select class="uni-step-select" id="uni-block-step-selector" aria-label="Jump to specific block">
          ${selectOptionsHtml}
        </select>
      </div>

      ${(!isNoteFullyUnlocked && activeBlock.number === 1) ? `
        <div class="uni-free-showcase-banner">
          <span>⭐ <strong>Free Showcase Block</strong> · Blocks 02–${totalBlocks} included with Course Access</span>
          <button type="button" class="locked-upgrade-trigger" data-course-code="${escapeHtml(courseCode)}">Unlock All Blocks</button>
        </div>
      ` : ""}

      ${blockCardContent}

      <div class="uni-step-nav-footer">
        <button class="uni-step-nav-btn prev" id="uni-step-prev" ${activeBlock.number <= 1 ? "disabled" : ""}>
          ← Previous Block
        </button>
        <span style="font-size:12px; font-weight:600; color:var(--muted);">Block ${activeBlock.number} / ${totalBlocks}</span>
        <button class="uni-step-nav-btn next" id="uni-step-next">
          ${activeBlock.number >= totalBlocks ? "Review Checklist ✓" : (!isNoteFullyUnlocked && activeBlock.number === 1 ? "Next Block 🔒" : "Next Block →")}
        </button>
      </div>
    `;
  } else {
    // Continuous Full Document View
    if (isNoteFullyUnlocked) {
      const blocksHtml = filteredBlocks.map(b => renderBlockCardHtml(b)).join("");
      contentBodyHtml = `
        <div class="uni-note-continuous-stack">
          ${blocksHtml}
        </div>
      `;
    } else {
      // Free User in Continuous Reading Mode: Only Block 1 is visible, remaining blocks are blurred/locked
      const hasBlockOneInFilter = filteredBlocks.some(b => b.number === 1);
      const blockOne = allBlocks.find(b => b.number === 1);
      const previewBlockTwo = allBlocks.find(b => b.number === 2);
      const previewBlockThree = allBlocks.find(b => b.number === 3);

      contentBodyHtml = `
        <div class="uni-note-continuous-stack">
          ${hasBlockOneInFilter && blockOne ? `
            <div class="uni-free-showcase-banner">
              <span>⭐ <strong>Free Showcase Block</strong> · Blocks 02–${totalBlocks} included with Course Access</span>
              <button type="button" class="locked-upgrade-trigger" data-course-code="${escapeHtml(courseCode)}">Unlock All Blocks</button>
            </div>
            ${renderBlockCardHtml(blockOne)}
          ` : ""}

          <div class="uni-continuous-locked-barrier">
            <div class="uni-continuous-blurred-preview" aria-hidden="true">
              ${renderBlurredBlockPreviewHtml(previewBlockTwo)}
              ${renderBlurredBlockPreviewHtml(previewBlockThree)}
            </div>
            <div class="uni-continuous-lock-overlay">
              <div class="locked-shield-icon">
                <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <h3>Unlock Remaining ${totalBlocks - 1} Illustrated Blocks</h3>
              <p>
                Block 01 is open for free continuous reading. Upgrade to <strong>${escapeHtml(courseCode)} Course Access</strong> or <strong>All-Access</strong> to read all ${totalBlocks} continuous blocks with diagrams, full podcasts, and clinical pearls.
              </p>
              <div class="locked-feature-tags">
                <span class="locked-tag">✓ Full Continuous Notebook Reading</span>
                <span class="locked-tag">✓ All ${totalBlocks} High-Yield Diagrams</span>
                <span class="locked-tag">✓ Conversational Audio Podcasts</span>
                <span class="locked-tag">✓ Self-Assessment Checklist</span>
              </div>
              <button type="button" class="button uni-btn locked-upgrade-trigger" data-course-code="${escapeHtml(courseCode)}" style="background:linear-gradient(135deg, #d97706, #b45309); color:#fff; font-weight:700; padding:13px 28px; font-size:15px;">
                <span>Unlock Complete Notebook</span>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }
  }

  // Checklist Card HTML
  const checklistHtml = `
    <section class="uni-checklist-card" id="checklist">
      <div class="uni-checklist-header">
        <h3 class="uni-checklist-title">Self-Assessment Mastery Checklist</h3>
        <span class="uni-checklist-score-pill" id="uni-checklist-score-pill">${checkedCount} / ${checklistItems.length} Mastered</span>
      </div>
      <p style="margin:0; font-size:13.5px; color:var(--muted);">Check off each anatomical concept you are confident explaining before attempting the quiz:</p>
      <div class="uni-checklist-items">
        ${checklistItems.map((itemText, idx) => {
          const isChecked = Boolean(savedChecks[idx]);
          return `
            <div class="uni-check-row ${isChecked ? "checked" : ""}" data-check-index="${idx}" role="checkbox" aria-checked="${isChecked}" tabindex="0">
              <span class="uni-check-box">${isChecked ? "✓" : ""}</span>
              <span class="uni-check-text">${escapeHtml(itemText)}</span>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;

  // Final Practice Call to Action Card
  const ctaCardHtml = `
    <section class="uni-note-cta-card">
      <div class="uni-note-cta-text">
        <h3>Ready to test your anatomical knowledge?</h3>
        <p>Challenge yourself with the high-yield MCQs for Bones of the Upper Limb in ANA 201.</p>
      </div>
      <button class="uni-note-cta-btn" id="uni-note-start-practice">
        <span>Start Practice Quiz</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </button>
    </section>
  `;

  // Hero Card HTML
  const heroHtml = `
    <header class="uni-note-hero">
      <span class="uni-note-hero-tagline">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-0-5.5H20"/><path d="M8 7h8M8 11h8M8 15h4"/></svg>
        Illustrated Notebook · ${escapeHtml(noteData.courseCode || "ANA 201")}
      </span>
      <h1 class="uni-note-hero-title">${escapeHtml(noteData.noteTitle || "Bones of the Upper Limb")}</h1>
      <p class="uni-note-hero-subtitle">${escapeHtml(noteData.subtitle || "")}</p>
      
      <div class="uni-note-hero-pills">
        <span class="uni-note-meta-pill">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          17 High-Yield Diagrams
        </span>
        <span class="uni-note-meta-pill">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
          Audio Podcast Walkthrough
        </span>
        <span class="uni-note-meta-pill">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Quick Recall Self-Tests
        </span>
      </div>

      <div class="uni-note-toolbar">
        <div class="uni-note-mode-switch" role="group" aria-label="Reading mode">
          <button type="button" class="uni-note-mode-btn ${uniNoteViewMode === "step" ? "active" : ""}" id="uni-mode-step">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Step-by-Step Focus
          </button>
          <button type="button" class="uni-note-mode-btn ${uniNoteViewMode === "all" ? "active" : ""}" id="uni-mode-all">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            Continuous Reading
          </button>
        </div>

        <div class="uni-note-quick-triggers">
          <button type="button" class="uni-note-tool-btn ${uniNoteGlossaryOpen ? "active" : ""}" id="uni-glossary-toggle">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
            <span>Glossary (${noteData.glossary ? noteData.glossary.length : 8})</span>
          </button>
          <button type="button" class="uni-note-tool-btn" id="uni-toolbar-checklist-btn">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span>Checklist</span>
          </button>
        </div>
      </div>
    </header>
  `;

  const isFinalStep = uniNoteViewMode === "step" ? (activeBlock.number >= totalBlocks) : true;

  const noteContainerHtml = `
    <div class="uni-note-container">
      ${heroHtml}
      ${glossaryHtml}
      <div class="uni-note-filter-bar">
        ${filterPillsHtml}
      </div>
      ${contentBodyHtml}
      ${isFinalStep ? checklistHtml : ""}
      ${isFinalStep ? ctaCardHtml : ""}
    </div>
  `;

  app.innerHTML = uniShell(noteContainerHtml, breadcrumbs);
  bindShell();
  bindUniCrumbs(breadcrumbs);

  // Bind Mode Toggle
  document.querySelector("#uni-mode-step")?.addEventListener("click", () => {
    uniNoteViewMode = "step";
    render();
  });
  document.querySelector("#uni-mode-all")?.addEventListener("click", () => {
    uniNoteViewMode = "all";
    render();
  });

  // Bind Glossary Toggle
  document.querySelector("#uni-glossary-toggle")?.addEventListener("click", () => {
    uniNoteGlossaryOpen = !uniNoteGlossaryOpen;
    render();
  });
  document.querySelector("#uni-glossary-close-btn")?.addEventListener("click", () => {
    uniNoteGlossaryOpen = false;
    render();
  });

  // Bind Category Filters
  document.querySelectorAll("[data-category-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.categoryFilter;
      uniNoteCategoryFilter = cat;
      if (uniNoteViewMode === "step" && cat !== "all") {
        const firstInCat = allBlocks.find(b => b.category === cat);
        if (firstInCat) uniNoteActiveBlock = firstInCat.number;
      }
      render();
    });
  });

  // Bind Step Selector dropdown
  document.querySelector("#uni-block-step-selector")?.addEventListener("change", (e) => {
    uniNoteActiveBlock = Number(e.target.value) || 1;
    stopUniNoteAudio();
    render();
  });

  // Bind Step Prev / Next
  document.querySelector("#uni-step-prev")?.addEventListener("click", () => {
    if (uniNoteActiveBlock > 1) {
      uniNoteActiveBlock -= 1;
      stopUniNoteAudio();
      window.scrollTo({ top: 200, behavior: "smooth" });
      render();
    }
  });

  document.querySelector("#uni-step-next")?.addEventListener("click", () => {
    if (!isNoteFullyUnlocked && activeBlock.number === 1) {
      uniNoteActiveBlock = 2;
      stopUniNoteAudio();
      window.scrollTo({ top: 200, behavior: "smooth" });
      render();
      return;
    }
    if (uniNoteActiveBlock < totalBlocks) {
      uniNoteActiveBlock += 1;
      stopUniNoteAudio();
      window.scrollTo({ top: 200, behavior: "smooth" });
      render();
    } else {
      document.querySelector("#checklist")?.scrollIntoView({ behavior: "smooth" });
    }
  });

  // Bind Return to Free Block button
  document.querySelector("#uni-return-free-block")?.addEventListener("click", () => {
    uniNoteActiveBlock = 1;
    stopUniNoteAudio();
    window.scrollTo({ top: 200, behavior: "smooth" });
    render();
  });

  // Bind all Locked Upgrade Triggers
  document.querySelectorAll(".locked-upgrade-trigger").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cCode = btn.dataset.courseCode || courseCode;
      api.logMonetizationEvent(authToken, "upgrade_screen_viewed", { trigger: "locked_notebook_block", course: cCode }).catch(() => {});
      showUpgradeModal({ trigger: "locked_notebook_block", courseCode: cCode });
    });
  });

  // Bind Audio Play / Stop buttons
  document.querySelectorAll("[data-audio-block-id]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e?.stopPropagation?.();
      const blockId = btn.dataset.audioBlockId;
      const textToSpeak = btn.dataset.audioText || "";
      if (!isNoteFullyUnlocked && blockId !== "block-1") {
        showToast("🔒 Audio guide for this block is included with Course Access.");
        api.logMonetizationEvent(authToken, "locked_podcast_tapped", { course: courseCode, block: blockId }).catch(() => {});
        showUpgradeModal({ trigger: "locked_notebook_podcast", courseCode });
        return;
      }
      toggleUniNoteAudio(blockId, textToSpeak);
    });
  });

  // Bind Audio Speed cycle (1x -> 1.25x -> 1.5x -> 1x)
  document.querySelectorAll("[data-audio-speed-toggle]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e?.stopPropagation?.();
      if (uniNoteSpeechRate === 1.0) uniNoteSpeechRate = 1.25;
      else if (uniNoteSpeechRate === 1.25) uniNoteSpeechRate = 1.5;
      else uniNoteSpeechRate = 1.0;
      showToast(`Audio speed: ${uniNoteSpeechRate}x`);
      render();
    });
  });

  // Bind Quick Recall Reveal buttons
  document.querySelectorAll("[data-recall-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const blockId = btn.dataset.recallToggle;
      if (!isNoteFullyUnlocked && blockId !== "block-1") {
        showToast("🔒 Recall guide for this block is included with Course Access.");
        api.logMonetizationEvent(authToken, "locked_recall_tapped", { course: courseCode, block: blockId }).catch(() => {});
        showUpgradeModal({ trigger: "locked_recall_guide", courseCode });
        return;
      }
      uniNoteRevealedMap[blockId] = !uniNoteRevealedMap[blockId];
      render();
    });
  });

  // Bind Diagram Lightbox Triggers
  document.querySelectorAll("[data-diagram-src]").forEach(frame => {
    frame.addEventListener("click", () => {
      const src = frame.dataset.diagramSrc;
      const title = frame.dataset.diagramTitle || "Anatomical Diagram";
      if (src) showDiagramLightbox(src, title);
    });
  });

  // Bind Checklist interactive rows
  document.querySelectorAll(".uni-check-row").forEach(row => {
    const handleCheck = () => {
      const idx = row.dataset.checkIndex;
      savedChecks[idx] = !savedChecks[idx];
      try { localStorage.setItem(checklistKey, JSON.stringify(savedChecks)); } catch {}
      const newCheckedCount = checklistItems.filter((_, i) => Boolean(savedChecks[i])).length;
      row.classList.toggle("checked", Boolean(savedChecks[idx]));
      row.setAttribute("aria-checked", String(Boolean(savedChecks[idx])));
      const box = row.querySelector(".uni-check-box");
      if (box) box.textContent = savedChecks[idx] ? "✓" : "";
      const pill = document.querySelector("#uni-checklist-score-pill");
      if (pill) pill.textContent = `${newCheckedCount} / ${checklistItems.length} Mastered`;
      if (newCheckedCount === checklistItems.length) {
        showToast("🎉 Excellent! All 7 checklist competencies mastered!");
      }
    };
    row.addEventListener("click", handleCheck);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleCheck();
      }
    });
  });

  // Bind Podcast Transcript Toggle
  document.querySelectorAll("[data-transcript-toggle]").forEach(btn => {
    const toggle = (e) => {
      e?.stopPropagation?.();
      const blockId = btn.dataset.transcriptToggle;
      if (!isNoteFullyUnlocked && blockId !== "block-1") {
        showToast("🔒 Transcript for this block is included with Course Access.");
        showUpgradeModal({ trigger: "locked_podcast_transcript", courseCode });
        return;
      }
      uniNoteTranscriptOpenMap[blockId] = !uniNoteTranscriptOpenMap[blockId];
      render();
    };
    btn.addEventListener("click", toggle);
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(e);
      }
    });
  });

  // Bind Toolbar Checklist button
  document.querySelector("#uni-toolbar-checklist-btn")?.addEventListener("click", () => {
    if (uniNoteViewMode === "step" && uniNoteActiveBlock < totalBlocks) {
      uniNoteActiveBlock = totalBlocks;
      render();
    }
    setTimeout(() => {
      document.querySelector("#checklist")?.scrollIntoView({ behavior: "smooth" });
    }, 40);
  });

  // Bind Practice CTA
  document.querySelector("#uni-note-start-practice")?.addEventListener("click", () => {
    stopUniNoteAudio();
    showTopicConfigModal(noteData.courseCode || "ANA 201", "Bones of the Upper Limb", "data/university/anatomy/200/questions-ana201-bones.json");
  });
}


function openAvatarPickerModal(onUpdated) {
  document.querySelector("#avatar-picker-backdrop")?.remove();
  let selectedPersona = "all";
  let selectedGender = (profile?.gender || currentUser?.gender || "all").toLowerCase();
  if (selectedGender !== "male" && selectedGender !== "female") selectedGender = "all";
  let activeAvatarId = profile?.avatar || "varsity-male";

  const backdrop = document.createElement("div");
  backdrop.id = "avatar-picker-backdrop";
  backdrop.className = "avatar-picker-backdrop";

  const renderModalContent = () => {
    let filtered = AVATAR_PRESETS;
    if (selectedGender !== "all") {
      filtered = filtered.filter(a => a.gender === selectedGender);
    }
    if (selectedPersona !== "all") {
      filtered = filtered.filter(a => a.persona.toLowerCase() === selectedPersona.toLowerCase());
    }

    const tabs = [
      { id: "all", label: "All Personas" },
      { id: "Varsity", label: "Varsity" },
      { id: "Scholar", label: "Reading" },
      { id: "Focus", label: "Focus" },
      { id: "Pre-Med", label: "Pre-Med" },
      { id: "Modest", label: "Modest" }
    ];

    const tabsHtml = tabs.map(t => {
      const isActive = selectedPersona.toLowerCase() === t.id.toLowerCase();
      return `<button type="button" class="avatar-filter-btn ${isActive ? "active" : ""}" data-tab="${t.id}"><span>${escapeHtml(t.label)}</span></button>`;
    }).join("");

    const cardsHtml = filtered.length ? filtered.map(a => {
      const isSelected = activeAvatarId === a.id;
      return `
        <div class="avatar-card ${isSelected ? "selected" : ""}" data-avatar-id="${a.id}" role="button" tabindex="0">
          <div class="avatar-card-img-wrap">
            <img src="${a.file}" alt="${escapeHtml(a.name)}" class="avatar-card-img" loading="lazy">
          </div>
          <span class="avatar-card-check">✓</span>
          <span class="avatar-card-label">${escapeHtml(a.name)}</span>
          <span class="avatar-card-persona">${escapeHtml(a.persona)} · ${a.gender === "female" ? "♀ Female" : "♂ Male"}</span>
        </div>
      `;
    }).join("") : `<div class="empty" style="grid-column: 1 / -1; padding: 28px 16px; text-align: center; color: var(--muted); font-size: 13px;">No avatars match this filter combination. Try selecting "All Personas" or "All".</div>`;

    backdrop.innerHTML = `
      <div class="avatar-picker-modal" role="dialog" aria-modal="true" aria-labelledby="avatar-picker-title">
        <div class="avatar-picker-header">
          <div>
            <span class="uni-topic-modal-code">Personalize</span>
            <h2 id="avatar-picker-title" style="margin:4px 0 0; font-size:20px; font-weight:800; color:#0C2518;">Choose Your Avatar</h2>
          </div>
          <button class="uni-topic-config-close" id="avatar-picker-close" aria-label="Close dialog">✕</button>
        </div>
        <p style="margin:0; font-size:13px; color:var(--muted); line-height:1.5;">Select a character that reflects your study persona. Your avatar displays on your profile, topbar, and leaderboards.</p>

        <div style="display:flex; flex-direction:column; gap:10px;">
          <div class="avatar-gender-pills">
            <button type="button" class="avatar-gender-pill ${selectedGender === "all" ? "active" : ""}" data-avatar-gender="all">All (${AVATAR_PRESETS.length})</button>
            <button type="button" class="avatar-gender-pill ${selectedGender === "male" ? "active" : ""}" data-avatar-gender="male">♂ Male (${AVATAR_PRESETS.filter(a => a.gender === "male").length})</button>
            <button type="button" class="avatar-gender-pill ${selectedGender === "female" ? "active" : ""}" data-avatar-gender="female">♀ Female (${AVATAR_PRESETS.filter(a => a.gender === "female").length})</button>
          </div>

          <div class="avatar-filter-tabs">
            ${tabsHtml}
          </div>
        </div>

        <div class="avatar-grid">
          ${cardsHtml}
        </div>

        <div class="avatar-picker-footer">
          <button type="button" class="button outline" id="avatar-revert-monogram">Initials Only</button>
          <button type="button" class="button accent" id="avatar-picker-save">Done</button>
        </div>
      </div>
    `;

    backdrop.querySelector("#avatar-picker-close")?.addEventListener("click", () => backdrop.remove());
    backdrop.querySelector("#avatar-picker-save")?.addEventListener("click", () => backdrop.remove());

    backdrop.querySelectorAll("[data-avatar-gender]").forEach(pill => {
      pill.addEventListener("click", () => {
        selectedGender = pill.dataset.avatarGender;
        renderModalContent();
      });
    });

    backdrop.querySelectorAll("[data-tab]").forEach(tab => {
      tab.addEventListener("click", () => {
        selectedPersona = tab.dataset.tab;
        renderModalContent();
      });
    });

    backdrop.querySelectorAll("[data-avatar-id]").forEach(card => {
      const pick = async () => {
        const id = card.dataset.avatarId;
        const match = AVATAR_PRESETS.find(p => p.id === id);
        activeAvatarId = id;
        profile.avatar = id;
        if (match?.gender) {
          profile.gender = match.gender;
          if (currentUser) currentUser.gender = match.gender;
        }
        await put("profile", profile);
        if (authToken) {
          api.updateAvatar(authToken, id, profile.gender).catch(() => {});
        }
        showToast("Avatar updated! ✨");
        renderModalContent();
        onUpdated?.();
      };
      card.addEventListener("click", pick);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      });
    });

    backdrop.querySelector("#avatar-revert-monogram")?.addEventListener("click", async () => {
      profile.avatar = "";
      activeAvatarId = "";
      await put("profile", profile);
      if (authToken) {
        api.updateAvatar(authToken, "").catch(() => {});
      }
      showToast("Reverted to monogram initials");
      backdrop.remove();
      onUpdated?.();
    });
  };

  renderModalContent();
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
}

