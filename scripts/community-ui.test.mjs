import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
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

test("challenges have a visible entry and one direct action per buddy", () => {
  for (const university of [false, true]) {
    const html = communityPage({ ...base, university });
    assert.equal((html.match(/id="circle-create-challenge"/g) || []).length, 1);
    assert.equal((html.match(/data-challenge-buddy=/g) || []).length, 1);
    assert.match(html, /Invitations &amp; challenges/);
    assert.ok(html.indexOf('circle-challenge-callout') < html.indexOf('People in your corner'));
    assert.doesNotMatch(html.match(/<details class="circle-row-menu">[\s\S]*?<\/details>/)?.[0] || '', /data-challenge-buddy/);
    assert.equal(html.includes('For your university study circle'), university);
  }
  const empty = communityPage({ ...base, net: { counts: {}, buddies: [] } });
  assert.match(empty, /id="circle-create-challenge"/);
  assert.match(empty, /No buddies yet/);
  assert.doesNotMatch(communityPage({ ...base, tab: 'messages' }), /circle-challenge-callout/);
});

test("challenge entry allows university course selection without requiring an all-access plan", () => {
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const handler = source.slice(source.indexOf('document.querySelector("#circle-create-challenge")'), source.indexOf('document.querySelector("#form-community-search")', source.indexOf('document.querySelector("#circle-create-challenge")')));
  assert.match(handler, /if \(getActiveMode\(\) !== "university" && !hasAllAccess\(\)\)/);
  assert.match(handler, /showUpgradeModal/);
  assert.match(handler, /challengeComposerOpen = true/);
  assert.match(handler, /route = "challenges"/);
  assert.match(source, /university: getActiveMode\(\) === "university"/);
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
