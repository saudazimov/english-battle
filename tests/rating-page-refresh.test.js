const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const publicDir = path.join(__dirname, "..", "public");
const lobbyHtml = fs.readFileSync(path.join(publicDir, "lobby.html"), "utf8");
const leaderboardHtml = fs.readFileSync(path.join(publicDir, "leaderboard.html"), "utf8");
const profileHtml = fs.readFileSync(path.join(publicDir, "profile.html"), "utf8");
const profileModalJs = fs.readFileSync(path.join(publicDir, "profile-modal.js"), "utf8");
const ratingUiJs = fs.readFileSync(path.join(publicDir, "rating-ui.js"), "utf8");
const battleHtml = fs.readFileSync(path.join(publicDir, "battle.html"), "utf8");
const teamBattleHtml = fs.readFileSync(path.join(publicDir, "team-battle.html"), "utf8");
const friendsHtml = fs.readFileSync(path.join(publicDir, "friends.html"), "utf8");
const historyHtml = fs.readFileSync(path.join(publicDir, "history.html"), "utf8");

test("lobby applies refreshed server RP and CEFR without a page reload", () => {
  assert.match(lobbyHtml, /function applyLobbyUser\(fresh, stats\)/);
  assert.match(lobbyHtml, /window\.addEventListener\("userRefreshed"[\s\S]*applyLobbyUser\(event\.detail\)/);
  assert.match(lobbyHtml, /rating:\s*freshRating[\s\S]*cefr_level:\s*freshCefr/);
});

test("ranking reloads server standings after the current user refreshes", () => {
  assert.match(leaderboardHtml, /window\.addEventListener\("userRefreshed"[\s\S]*user\.cefr_level = fresh\.cefr_level/);
  assert.match(leaderboardHtml, /const rankingChanged = [\s\S]*if \(rankingChanged\) {[\s\S]*loadLeaderboard\(\)/);
});

test("lobby and ranking use the current 500 RP baseline", () => {
  assert.match(lobbyHtml, /return fallback === undefined \? 500 : fallback/);
  assert.match(leaderboardHtml, /return fallback === undefined \? 500 : fallback/);
  assert.doesNotMatch(lobbyHtml, /user\.rating \|\| 1000/);
  assert.doesNotMatch(leaderboardHtml, /user\.rating \|\| 1000/);
});

test("profile surfaces use fresh server RP and CEFR progression", () => {
  assert.match(profileHtml, /authFetch\("\/profile\/" \+ viewUserId\)/);
  assert.match(profileHtml, /normalizeProfileRating\(u\.rating\)/);
  assert.match(profileHtml, /setupNextLevel\(data\.user\.cefr_level \|\| "A1", data\.progression\)/);
  assert.match(profileHtml, /value !== null && value !== undefined && value !== ""/);

  assert.match(profileModalJs, /authFetch\("\/profile\/" \+ userId\)/);
  assert.match(profileModalJs, /function fpRating\(value, fallback\)/);
  assert.match(profileModalJs, /data\.progression && typeof data\.progression === "object"/);
  assert.match(profileModalJs, /progression\.progress_percent/);
  assert.doesNotMatch(profileModalJs, /rating \|\| 1000/);
  assert.doesNotMatch(profileModalJs, /friendRating = 1000/);
});

test("shared rating UI normalization preserves zero and defaults to 500 RP", () => {
  assert.match(ratingUiJs, /value !== null && value !== undefined && value !== ""/);
  assert.match(ratingUiJs, /return 500/);
  assert.match(ratingUiJs, /Math\.max\(0, Math\.round\(rating\)\)/);

  const context = { window: {} };
  vm.runInNewContext(ratingUiJs, context);
  assert.equal(context.window.IlmLigaRating.normalize(0), 0);
  assert.equal(context.window.IlmLigaRating.normalize(""), 500);
  assert.equal(context.window.IlmLigaRating.normalize(null, 725), 725);
});

test("battle clients refresh server RP and CEFR before matchmaking", () => {
  for (const html of [battleHtml, teamBattleHtml]) {
    assert.match(html, /<script src="\/rating-ui\.js"><\/script>/);
    assert.match(html, /profileRefreshPromise = \(async function refreshMyProfile\(\)/);
    assert.match(html, /user\.rating = IlmLigaRating\.normalize\(d\.user\.rating, user\.rating\)/);
    assert.match(html, /await profileRefreshPromise;[\s\S]*socket\.emit\("registerUser", user\.id\)/);
    assert.doesNotMatch(html, /rating \|\| 1000/);
  }
});

test("friends and history use fresh normalized RP and server CEFR progression", () => {
  for (const html of [friendsHtml, historyHtml]) {
    assert.match(html, /<script src="\/rating-ui\.js"><\/script>/);
    assert.doesNotMatch(html, /rating \|\| 1000/);
  }
  assert.match(friendsHtml, /progression\.progress_percent/);
  assert.match(friendsHtml, /window\.addEventListener\("userRefreshed"[\s\S]*IlmLigaRating\.normalize/);
  assert.match(historyHtml, /const currentRating = IlmLigaRating\.normalize\(user\.rating\)/);
});
