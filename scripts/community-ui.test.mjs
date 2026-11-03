import assert from "node:assert/strict";
import test from "node:test";
import { communityPage } from "../community-ui.js";
import { eligibleForUniversityOffer } from "../student-engagement.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const base = {
  net: { counts: { buddies: 1, followers: 1, following: 1 }, buddies: [{ username: "Tomi", public_id: "ST1234", level: 2 }], followers: [], following: [] },
  leaderboard: [], tab: "buddies", query: "", results: [], searching: false, loading: false,
  error: "", myId: "ME1234", unread: 0, hasPhone: false, escapeHtml,
  getAvatarSrc: () => null, buddyInitials: name => name.slice(0, 2).toUpperCase(),
};

test("Buddies has one navigation row and one primary action per person", () => {
  const html = communityPage(base);
  assert.equal((html.match(/aria-label="Study circle"/g) || []).length, 1);
  assert.equal((html.match(/data-message-buddy=/g) || []).length, 1);
  assert.equal((html.match(/id="btn-copy-my-id"/g) || []).length, 1);
  assert.doesNotMatch(html, /buddies-count-pill|Gamified|🥇|🤝/);
});

test("untrusted usernames, search text and errors are escaped", () => {
  const attack = '<img src=x onerror="alert(1)">';
  const html = communityPage({ ...base, tab: "find", query: attack, error: attack, results: [{ username: attack, public_id: "ST1234", follow_state: "none" }] });
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("or email"));
});

test("connections and study board are opt-in views", () => {
  const connections = communityPage({ ...base, tab: "followers" });
  assert.ok(connections.includes('aria-pressed="true">Followers'));
  const board = communityPage({ ...base, tab: "leaderboard" });
  assert.ok(board.includes("not a measure of ability"));
});

test("upgrade offer requires confirmed, unsubscribed university access", () => {
  const eligible = { user: { public_id: "ME1234" }, mode: "university", ready: true, access: { unlocked_courses: [] } };
  assert.equal(eligibleForUniversityOffer(eligible), true);
  for (const override of [
    { mode: "aspirant" }, { ready: false }, { user: null },
    { user: { is_staff: true } }, { user: { is_superuser: true } },
    { user: { must_change_password: true } },
    { access: { has_all_access: true } }, { access: { is_trial: true } },
    { access: { unlocked_courses: ["ANA 201"] } },
  ]) assert.equal(eligibleForUniversityOffer({ ...eligible, ...override }), false);
});
