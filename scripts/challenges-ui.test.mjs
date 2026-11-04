import test from "node:test";
import assert from "node:assert/strict";
import { load } from "cheerio";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { challengeAnalysisPanel, challengeBucket, partitionChallenges, challengeHubPage, challengeComposerPage, challengeDetailPage } from "../challenges-ui.js";

const fixture = (extra = {}) => ({
  id: "paper-1", title: "Friday physics", message: "A paper together", creator: { username: "Chidi" },
  subject: "physics", subject_label: "Physics", question_count: 20, duration_minutes: 20,
  starts_at: "2026-11-04T16:00:00Z", ends_at: "2026-11-05T16:00:00Z",
  state: "upcoming", my_status: "accepted", can_respond: false, can_start: false, can_remove: true,
  removal_mode: "abandon", participants: [{ public_id: "ABC123", username: "Chidi", status: "accepted", is_creator: true }],
  results: [], results_unlocked: false, my_result: null, ...extra,
});

test("each invitation, active, scheduled or historical challenge appears exactly once", () => {
  const items = [
    fixture({ id: "invited", can_respond: true, my_status: "invited" }),
    fixture({ id: "live", state: "open" }), fixture({ id: "scheduled" }),
    fixture({ id: "cancelled", state: "cancelled" }), fixture({ id: "left", my_status: "abandoned", state: "open" }),
    fixture({ id: "declined", my_status: "declined" }), fixture({ id: "completed", my_status: "completed", state: "open" }),
    fixture({ id: "closed", state: "closed", my_status: "invited" }),
  ];
  const grouped = partitionChallenges(items);
  assert.equal(grouped.history.length, 5);
  assert.equal(Object.values(grouped).flat().length, items.length);
  assert.equal(new Set(Object.values(grouped).flat().map(item => item.id)).size, items.length);
  assert.equal(challengeBucket(items[0]), "invitations");
  const $ = load(challengeHubPage({ items, studentId: "ABC123" }));
  assert.equal($("[data-challenge-id]").length, 8);
  assert.equal($("button button").length, 0);
  assert.equal($("[data-challenge-filter][aria-pressed=true]").length, 1);
});

test("hub filter, empty, error and loading states are actionable and safe", () => {
  const item = fixture({ title: '<img src=x onerror="alert(1)">', creator: { username: "<script>bad</script>" } });
  const $ = load(challengeHubPage({ items: [item], filter: "history" }));
  assert.equal($("[data-challenge-id]").length, 0);
  const escaped = load(challengeHubPage({ items: [item] }));
  assert.equal(escaped("img,script").length, 0);
  assert.match(escaped(".duel-row-title").text(), /<img/);
  assert.match(challengeHubPage({ items: null, loading: true }), /role="status"/);
  assert.match(challengeHubPage({ items: null, error: "Offline" }), /data-refresh-challenges/);
});

test("detail has one primary action, one share action and separate destructive options", () => {
  const result = { public_id: "ABC123", username: "Chidi", correct: 16, total: 20, accuracy: 80, position: 1, recognition: "Steady work", change_from_average: 5 };
  const html = challengeDetailPage({ item: fixture({ my_status: "completed", results_unlocked: true, results: [result], my_result: result }), studentId: "ABC123" });
  const $ = load(html);
  assert.equal($("[data-share-challenge]").length, 1);
  assert.equal($("details #remove-challenge").length, 1);
  assert.match($(".duel-personal").text(), /percentage points/);
  const invited = load(challengeDetailPage({ item: fixture({ can_respond: true, my_status: "invited" }), studentId: "ABC123" }));
  assert.equal(invited('[data-challenge-response="accept"]').length, 1);
  assert.equal(invited('[data-challenge-response="decline"]').length, 1);
  assert.equal(invited("button button").length, 0);
});

test("composer preserves drafts, displays bounds, and escapes user content", () => {
  const draft = { title: 'My "paper"', subject: "physics", question_count: "27", duration_minutes: "35", starts_at: "2026-11-04T16:00", ends_at: "2026-11-05T16:00", message: "</textarea><script>bad</script>" };
  const $ = load(challengeComposerPage({ draft, subjects: [{ id: "physics", name: "Physics" }], invitees: [] }));
  assert.equal($("script").length, 0);
  assert.equal($("#challenge-title").val(), draft.title);
  assert.equal($("#challenge-message").val(), draft.message);
  assert.equal($("#challenge-subject").val(), "physics");
  assert.equal($("#challenge-count").attr("min"), "10");
  assert.equal($("#challenge-count").attr("max"), "100");
  assert.equal($("#challenge-duration").val(), "35");
  assert.equal($("fieldset").length, 3);
  assert.equal($("form").length, 1);
});

test("actual form handler validates timing before review and never sends without confirmation", () => {
  const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("function reviewChallengeForm("), source.indexOf("async function createChallenge("));
  const future = Date.now() + 3600000;
  const values = { title: "Physics with friends", subject: "physics", question_count: "27", duration_minutes: "35", starts_at: new Date(future).toISOString(), ends_at: new Date(future + 7200000).toISOString(), message: "" };
  function review(changes = {}, invitees = [{ username: "Chidi", public_id: "ABC123" }]) {
    const error = { textContent: "" }, dialogs = [];
    const context = {
      challengeCreating: false, challengeDraft: null, challengeInvitees: invitees,
      document: { querySelector: () => error },
      FormData: class { constructor() { return Object.entries({ ...values, ...changes }); } },
      escapeHtml: String, subjectName: () => "Physics", challengeTime: String,
      showConfirmDialog: options => dialogs.push(options), createChallenge: () => assert.fail("Must wait for confirmation"),
    };
    runInNewContext(handler + "; reviewChallengeForm({preventDefault(){},currentTarget:{}});", context);
    return { error: error.textContent, dialogs, draft: context.challengeDraft };
  }
  const good = review();
  assert.equal(good.error, "");
  assert.equal(good.dialogs.length, 1);
  assert.equal(good.dialogs[0].confirmLabel, "Send invitations");
  assert.equal(good.draft.question_count, "27");
  for (const changes of [{ starts_at: "not a date" }, { duration_minutes: "0" }, { question_count: "9" }, { question_count: "20.5" }, { ends_at: values.starts_at }, { title: "a" }]) {
    const result = review(changes);
    assert.ok(result.error);
    assert.equal(result.dialogs.length, 0);
  }
  assert.ok(review({}, []).error);
});

test("creation prevents concurrent submissions and restores the current form on failure", async () => {
  const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("async function createChallenge("), source.indexOf("function bindChallengeDetail("));
  let rejectRequest, calls = 0;
  const pending = new Promise((resolve, reject) => { rejectRequest = reject; });
  const firstButton = { disabled: false }, replacementButton = { disabled: true };
  let button = firstButton;
  const error = { textContent: "", scrollIntoView() {} };
  const context = {
    challengeCreating: false, authToken: "local-test-token", route: "challenges",
    api: { createChallenge: () => { calls++; return pending; } },
    document: { querySelector: selector => selector === "#challenge-error" ? error : button },
    ApiError: Error, showToast() {}, renderChallenges() { assert.fail("Do not navigate on failure"); },
  };
  runInNewContext(handler, context);
  const first = context.createChallenge({});
  assert.equal(firstButton.disabled, true);
  await context.createChallenge({});
  assert.equal(calls, 1);
  button = replacementButton; // A background refresh replaced the form.
  rejectRequest(new Error("Connection interrupted"));
  await first;
  assert.equal(context.challengeCreating, false);
  assert.equal(replacementButton.disabled, false);
  assert.match(error.textContent, /Connection interrupted/);
});

test("university composer uses courses and topics, preserves focus, and distinguishes locked material", () => {
  const draft = { track: "university", title: "Anatomy together", subject: "ana-201", topic: "ul-bones", question_count: "20", duration_minutes: "15" };
  const subjects = [{ id: "ana-201", name: "ANA 201 · Anatomy", full_access: false, topics: [
    { id: "ul-bones", name: "Bones of the Upper Limb", question_count: 40, accessible: true },
    { id: "ul-joints", name: "Joints", question_count: 60, accessible: false },
  ] }];
  const $ = load(challengeComposerPage({ draft, subjects, invitees: [] }));
  assert.equal($('input[name="track"]').val(), "university");
  assert.equal($("#challenge-subject").val(), "ana-201");
  assert.equal($("#challenge-topic").val(), "ul-bones");
  assert.equal($('#challenge-topic option[value="ul-joints"]').prop("disabled"), true);
  assert.equal($('#challenge-topic option[value=""]').prop("disabled"), true);
  assert.match($("#challenge-setup-summary").text(), /Bones of the Upper Limb/);
  assert.equal($('#challenge-subject option[value="all"]').length, 0);
  const paid = load(challengeComposerPage({ draft: { ...draft, topic: "" }, subjects: [{ ...subjects[0], full_access: true }], invitees: [] }));
  assert.equal(paid('#challenge-topic option[value=""]').prop("disabled"), false);
  const failed = load(challengeComposerPage({ draft, subjects: [], invitees: [], catalogError: "Offline <script>bad</script>" }));
  assert.equal(failed("script").length, 0);
  assert.equal(failed("#retry-challenge-catalog").length, 1);
});

test("analysis and retry states are accessible, escaped, and never show fake progress", () => {
  const $ = load(challengeAnalysisPanel());
  assert.equal($('[role="status"][aria-busy="true"]').length, 1);
  assert.match($("h1").text(), /Analysing/);
  assert.equal($(".challenge-analysis-rule").length, 1);
  assert.equal($("#retry-challenge-submission").length, 0);
  const failed = load(challengeAnalysisPanel('<img src=x onerror="bad()">'));
  assert.equal(failed('[role="alert"][aria-busy="false"]').length, 1);
  assert.equal(failed("img").length, 1); // Only the brand mark, never the error HTML.
  assert.equal(failed("#retry-challenge-submission").length, 1);
});

test("university papers have topic sections and pending submissions remain recoverable after reload", () => {
  const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const sections = source.slice(source.indexOf("function buildSessionSections("), source.indexOf("function topicSlug("));
  const savedSession = { mode: "challenge", finished: true, finalizing: true, challengeCompletionStarted: true, queue: [{ id: "q-1", text: "Frozen paper" }] };
  let stored = JSON.stringify(savedSession);
  const context = {
    activeSession: savedSession,
    localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; }, removeItem: () => { stored = null; } },
    subjectName: () => "ANA 201", console,
    questionById: () => assert.fail("Do not merge a new answer key into a frozen challenge"),
  };
  const persistence = source.slice(source.indexOf("function saveActiveSession("), source.indexOf("function openDatabase("));
  runInNewContext(sections + persistence, context);
  context.saveActiveSession();
  const restored = context.restoreActiveSession();
  assert.equal(restored.finished, true);
  assert.equal(restored.finalizing, false);
  assert.equal(restored.challengeCompletionStarted, false);
  const result = context.buildSessionSections([
    { subject: "ana-201", isUniversity: true, topicId: "ul-bones", topic: "Bones" },
    { subject: "ana-201", isUniversity: true, topicId: "ul-bones", topic: "Bones" },
    { subject: "ana-201", isUniversity: true, topicId: "ul-joints", topic: "Joints" },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, "Bones");
  assert.equal(result[0].count, 2);
  assert.equal(result[1].start, 2);
});

test("actual challenge finalizer batches selected answers once without exposing correctness", async () => {
  const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("async function finalizeSelectedAnswers("), source.indexOf("async function syncAttemptRecord("));
  const events = [], queue = Array.from({ length: 10 }, (_, i) => ({ id: `q-${i}`, subject: "ana-201" }));
  let batchCalls = 0, clientId = 0;
  const session = { remoteId: "session-id", mode: "challenge", queue, answers: queue.map(() => ({ selected: 0, confirmed: false })) };
  const context = {
    activeSession: session, authToken: "token", attempts: [], profile: {},
    crypto: { randomUUID: () => `answer-${++clientId}` },
    api: { syncAttemptsBulk: async (token, body) => {
      batchCalls++;
      assert.equal(token, "token");
      assert.equal(body.attempts.length, 10);
      events.push("batch");
      return { results: body.attempts.map(a => ({ ...a, accepted: true })) };
    } },
    add: async () => clientId, put: async () => {},
    saveActiveSession: () => events.push("save"), clearActiveSession: () => assert.fail("Keep unfinished submission recoverable"),
    showLoadingOverlay: () => events.push("loader"), hideLoadingOverlay: () => {},
    render: () => events.push("result"), ApiError: Error,
    submitConfirmedAnswer: () => assert.fail("Never send answers one by one"),
    syncPendingAttempts: () => assert.fail("Do not refresh the entire account"),
    showToast: message => assert.fail(message),
  };
  runInNewContext(handler, context);
  await context.finalizeSelectedAnswers();
  assert.equal(events[0], "loader");
  assert.equal(batchCalls, 1);
  assert.equal(session.finished, true);
  assert.equal(events.at(-1), "result");
  assert.ok(session.answers.every(a => a.confirmed && a.correct === null));
  assert.ok(queue.every(q => q.correct === undefined));
});

test("challenge completion fails into an explicit retry and skips full-account sync", async () => {
  const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("function renderChallengeSubmission("), source.indexOf("function handleEarnedBadges("));
  let completeCalls = 0, retry;
  const session = { remoteId: "session-id", challengeId: "paper-1", challengeTitle: "Our paper", correct: 0 };
  const context = {
    activeSession: session, authToken: "token", app: {}, profile: {}, progressData: {}, challengesData: [], achievementsData: [],
    api: { completeSession: async () => { completeCalls++; if (completeCalls === 1) throw new Error("Offline"); return { stats: { xp: 35 } }; }, challenge: async () => fixture({ my_result: { correct: 7, accuracy: 70 } }) },
    document: { querySelector: selector => selector === "#retry-challenge-submission" && session.challengeCompletionError ? { addEventListener: (_, listener) => { retry = listener; } } : null },
    shell: html => html, bindShell() {}, challengeAnalysisPanel, escapeHtml: String, ApiError: Error,
    put: async () => {}, saveActiveSession() {}, clearActiveSession() {}, applyRemoteStats() {}, handleEarnedBadges() {}, offerPostPracticeFeedback() {},
  };
  runInNewContext(handler, context);
  context.renderChallengeSubmission();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(context.app.innerHTML, /Retry submission/);
  assert.equal(completeCalls, 1);
  context.renderChallengeSubmission();
  assert.equal(completeCalls, 1); // No automatic failing-request loop.
  retry();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completeCalls, 2);
  assert.equal(session.correct, 7);
  assert.equal(session.challengeResult.my_result.correct, 7);
  assert.match(context.app.innerHTML, /Challenge submitted/);
});
