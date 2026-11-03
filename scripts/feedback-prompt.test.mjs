import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cancelPostPracticeFeedback, schedulePostPracticeFeedback } from "../student-engagement.js";

test("post-session feedback waits for a clear result and cancels safely on navigation", async () => {
  const original = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, document: globalThis.document };
  let timerId = 0, calls = 0, blocked = true, modal = null, current = true;
  const timers = new Map();
  globalThis.setTimeout = callback => { const id = ++timerId; timers.set(id, callback); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.document = { hidden: false, querySelector: () => modal };
  const flush = async () => {
    const [id, callback] = timers.entries().next().value;
    timers.delete(id);
    await callback();
  };
  const options = {
    api: { claimFeedbackPrompt: async (token, session) => { calls++; assert.equal(token, "test-token"); assert.ok(session); return { show: false }; } },
    token: "test-token", sessionId: "result-guard-fixture", completedTests: 3,
    isCurrentResult: () => current, isBlocked: () => blocked, escapeHtml: String,
  };
  try {
    schedulePostPracticeFeedback({ ...options, completedTests: 2 });
    schedulePostPracticeFeedback({ ...options, completedTests: undefined });
    assert.equal(timers.size, 0);
    schedulePostPracticeFeedback(options);
    schedulePostPracticeFeedback(options);
    assert.equal(timers.size, 1);
    await flush(); // Badge celebration.
    assert.equal(calls, 0);
    blocked = false; document.hidden = true;
    await flush();
    assert.equal(calls, 0);
    document.hidden = false; modal = {};
    await flush(); // Another dialog.
    assert.equal(calls, 0);
    modal = null;
    await flush();
    assert.equal(calls, 1);
    assert.equal(timers.size, 0);
    schedulePostPracticeFeedback(options);
    assert.equal(timers.size, 0); // Do not check the same result twice.

    current = false;
    schedulePostPracticeFeedback({ ...options, sessionId: "already-left-result" });
    await flush();
    assert.equal(calls, 1);
    assert.equal(timers.size, 0);

    current = true;
    let resolveClaim;
    schedulePostPracticeFeedback({
      ...options, sessionId: "leave-during-claim",
      api: { claimFeedbackPrompt: () => new Promise(resolve => { resolveClaim = resolve; }) },
    });
    const request = flush();
    current = false;
    resolveClaim({ show: true });
    await request; // No dialog API exists in this stub: an accidental popup would throw.
    cancelPostPracticeFeedback();
    assert.equal(timers.size, 0);

    current = true;
    schedulePostPracticeFeedback({
      ...options, sessionId: "offline-result",
      api: { claimFeedbackPrompt: async () => { throw new Error("Offline"); } },
    });
    await flush();
    assert.equal(timers.size, 0);
  } finally {
    cancelPostPracticeFeedback();
    globalThis.setTimeout = original.setTimeout;
    globalThis.clearTimeout = original.clearTimeout;
    if (original.document === undefined) delete globalThis.document;
    else globalThis.document = original.document;
  }
});

test("learning-level heading explicitly uses a light text color", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const rule = css.match(/\.profile-level-heading h2\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule?.includes("color: #f7fbf5"));
});

test("chat no longer displays a refresh-interval note", () => {
  const source = readFileSync(new URL("../buddy-chat.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /conversations?\s+refresh(?:es)?\s+every/i);
  assert.match(source, /ACTIVE_CHAT_SYNC_MS = 1000/, "Open chats should sync every second");
});
