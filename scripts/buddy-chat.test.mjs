import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_CHAT_SYNC_MS, messageReceiptLabel, canMarkMessageSeen } from "../buddy-chat.js";

test("active delivery sync is one second; server state distinguishes Sending, Sent and Seen", () => {
  assert.equal(ACTIVE_CHAT_SYNC_MS, 1000);
  assert.equal(messageReceiptLabel({ pending: true }), "Sending…");
  assert.equal(messageReceiptLabel({ read_at: null }), "Sent");
  assert.equal(messageReceiptLabel({ read_at: "2026-11-03T11:00:00Z" }), "Seen");
});

test("only a sufficiently visible message in the focused open conversation can be seen", () => {
  const visible = { focused: true, hidden: false, conversationOpen: true, visibleHeight: 70, messageHeight: 100, logHeight: 400, unobscured: true };
  assert.equal(canMarkMessageSeen(visible), true);
  for (const change of [{ focused: false }, { hidden: true }, { conversationOpen: false }, { unobscured: false }, { visibleHeight: 0 }, { visibleHeight: 59 }]) {
    assert.equal(canMarkMessageSeen({ ...visible, ...change }), false, JSON.stringify(change));
  }
  assert.equal(canMarkMessageSeen({ ...visible, messageHeight: 1000, visibleHeight: 250 }), true, "Tall messages can be acknowledged within a smaller viewport");
});
