const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const battleHtml = fs.readFileSync(path.join(__dirname, "..", "public", "battle.html"), "utf8");

test("battle page inline JavaScript parses successfully", () => {
  const inlineScripts = [...battleHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((script) => script.trim());

  assert.ok(inlineScripts.length > 0);
  for (const script of inlineScripts) {
    assert.doesNotThrow(() => new vm.Script(script, { filename: "battle-inline.js" }));
  }
});

test("battle search state preserves the selected mode and question length", () => {
  assert.match(battleHtml, /BATTLE_SEARCH_STATE_KEY\s*=\s*"battleSearchState"/);
  assert.match(battleHtml, /String\(saved\.userId\)\s*===\s*String\(user\.id\)/);
  assert.match(
    battleHtml,
    /var savedSearch\s*=\s*\{[\s\S]*mode:\s*battleMode[\s\S]*lengthKey:\s*battleLengthKey[\s\S]*sessionStorage\.setItem\(BATTLE_SEARCH_STATE_KEY,\s*JSON\.stringify\(savedSearch\)\)/
  );
});

test("revoked socket sessions return to login instead of leaving matchmaking frozen", () => {
  assert.match(
    battleHtml,
    /socket\.on\("connect_error",[\s\S]*"SESSION_REVOKED"[\s\S]*localStorage\.removeItem\("token"\)[\s\S]*window\.location\.href\s*=\s*"\/\?screen=login"/
  );
});

test("refresh restores matchmaking instead of entering the generic reconnect flow", () => {
  assert.match(
    battleHtml,
    /if \(savedSearchState\) \{[\s\S]*battleMode\s*=\s*savedSearchState\.mode[\s\S]*battleLengthKey\s*=\s*savedSearchState\.lengthKey[\s\S]*window\.__restoreMatchSearch\s*=\s*true;[\s\S]*return;/
  );
  assert.match(
    battleHtml,
    /if \(validIntent && !hasRoom\) \{[\s\S]*persistBattleSearchState\(\);[\s\S]*\}/
  );
  assert.match(
    battleHtml,
    /socket\.on\("waiting",[\s\S]*persistBattleSearchState\(\);/
  );
  assert.match(battleHtml, /startMmTimer\(data\.elapsedMs\);/);
});

test("generic reconnect fallback makes the search screen visible before rejoining", () => {
  assert.match(
    battleHtml,
    /if \(window\.__maybeReconnect\) \{[\s\S]*battleWrap\.style\.display\s*=\s*"";[\s\S]*showScreen\("searchScreen"\);[\s\S]*persistBattleSearchState\(\);[\s\S]*socket\.emit\("findMatch"/
  );
});

test("found, started and cancelled searches clear stale refresh state", () => {
  assert.match(battleHtml, /function handleMatchFound\(data, restoredFoundAt\) \{\s*clearBattleSearchState\(\);/);
  assert.match(battleHtml, /function reallyStartBattle\(data\) \{\s*clearBattleFoundState\(\);\s*clearBattleSearchState\(\);/);
  assert.match(battleHtml, /function goLobby\(\) \{\s*clearBattleFoundState\(\);\s*clearBattleSearchState\(\);/);
});

test("found opponent survives refresh until the battle room is ready", () => {
  assert.match(battleHtml, /BATTLE_FOUND_STATE_KEY\s*=\s*"battleFoundState"/);
  assert.match(battleHtml, /if \(savedFoundState\) \{[\s\S]*window\.__restoreFoundMatch\s*=\s*savedFoundState;[\s\S]*return;/);
  assert.match(battleHtml, /handleMatchFound\(restoredFound\.data, restoredFound\.foundAt\);/);
  assert.match(
    battleHtml,
    /if \(window\.__restoreFoundMatch\) \{[\s\S]*retryFoundBattleReconnect[\s\S]*expectedRoom:\s*foundRestore\.data\.roomId/
  );
  assert.match(battleHtml, /socket\.on\("battle:resumeState",[\s\S]*clearBattleFoundState\(\);/);
});
