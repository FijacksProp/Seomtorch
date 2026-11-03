import test from "node:test";
import assert from "node:assert/strict";
import { load } from "cheerio";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { challengeBucket, partitionChallenges, challengeHubPage, challengeComposerPage, challengeDetailPage } from "../challenges-ui.js";

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
