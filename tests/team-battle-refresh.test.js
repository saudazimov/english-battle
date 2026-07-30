const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const teamBattleHtml = fs.readFileSync(
  path.join(__dirname, "..", "public", "team-battle.html"),
  "utf8"
);

test("team battle inline JavaScript parses successfully", () => {
  const scripts = [...teamBattleHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((script) => script.trim());

  assert.ok(scripts.length > 0);
  scripts.forEach((script) => {
    assert.doesNotThrow(() => new vm.Script(script, { filename: "team-battle-inline.js" }));
  });
});

test("team search preserves mode, party and elapsed time across refresh", () => {
  assert.match(teamBattleHtml, /TEAM_SEARCH_STATE_KEY\s*=\s*"teamBattleSearchState"/);
  assert.match(teamBattleHtml, /teamMode:\s*teamMode[\s\S]*partyId:\s*partyId[\s\S]*startedAt:\s*searchStartedAt/);
  assert.match(teamBattleHtml, /startTeamSearch\(savedSearch \? Date\.now\(\) - savedSearch\.startedAt : 0\)/);
  assert.match(teamBattleHtml, /function startSearchTimer\(initialElapsedMs\)/);
});

test("found team countdown survives refresh before the battle resumes", () => {
  assert.match(teamBattleHtml, /TEAM_FOUND_STATE_KEY\s*=\s*"teamBattleFoundState"/);
  assert.match(teamBattleHtml, /persistTeamFoundState\(data\);[\s\S]*renderTeamFound\(data, 5000/);
  assert.match(teamBattleHtml, /renderTeamFound\(savedFound\.data, Math\.max\(0, savedFound\.foundAt \+ 5000 - Date\.now\(\)\)\)/);
  assert.match(teamBattleHtml, /socket\.on\("team:resumeState"[\s\S]*remainingMs[\s\S]*applyTeamResumeState\(data\)/);
});
