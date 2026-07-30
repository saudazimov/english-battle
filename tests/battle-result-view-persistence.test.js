const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const battleHtml = fs.readFileSync(path.join(__dirname, "..", "public", "battle.html"), "utf8");

test("completed battle view is stored per user and expires", () => {
  assert.match(battleHtml, /BATTLE_RESULT_VIEW_KEY\s*=\s*"battleResultViewState"/);
  assert.match(battleHtml, /String\(saved\.userId\)\s*===\s*String\(user\.id\)/);
  assert.match(battleHtml, /Date\.now\(\)\s*-\s*saved\.savedAt[\s\S]*BATTLE_RESULT_VIEW_MAX_AGE/);
  assert.match(
    battleHtml,
    /sessionStorage\.setItem\(BATTLE_RESULT_VIEW_KEY,\s*JSON\.stringify\(\{[\s\S]*roomId:\s*currentRoom,[\s\S]*screen:\s*screen,[\s\S]*reviewIndex:/
  );
});

test("refresh restores the saved room without starting matchmaking", () => {
  assert.match(
    battleHtml,
    /if \(canRestoreResult\) \{[\s\S]*window\.__restoreFinishedBattle\s*=\s*savedResultView;[\s\S]*return;/
  );
  assert.match(
    battleHtml,
    /socket\.on\("connect",[\s\S]*if \(window\.__restoreFinishedBattle\) \{\s*loadResultFromServer\(window\.__restoreFinishedBattle\.roomId\);\s*return;/
  );
  assert.match(
    battleHtml,
    /savedView\.screen\s*===\s*"review"\) \{\s*showMistakes\(savedView\.reviewIndex\);/
  );
});

test("result and review navigation keep the exact visible screen", () => {
  assert.match(battleHtml, /persistBattleResultView\("result",\s*0\);\s*showScreen\("resultScreen"\);/);
  assert.match(
    battleHtml,
    /function showMistakes\(preferredIndex\)[\s\S]*persistBattleResultView\("review",\s*revIndex\);[\s\S]*showScreen\("mistakesScreen"\);/
  );
  assert.match(
    battleHtml,
    /function revGoTo\(index\)[\s\S]*revIndex\s*=\s*index;[\s\S]*?persistBattleResultView\("review",\s*revIndex\);/
  );
});

test("starting or leaving a battle clears stale result state", () => {
  assert.match(
    battleHtml,
    /function reallyStartBattle\(data\) \{\s*clearBattleFoundState\(\);\s*clearBattleSearchState\(\);\s*clearBattleResultView\(\);/
  );
  assert.match(battleHtml, /function playAgain\(\) \{\s*clearBattleResultView\(\);/);
  assert.match(
    battleHtml,
    /function goLobby\(\) \{\s*clearBattleFoundState\(\);\s*clearBattleSearchState\(\);\s*clearBattleResultView\(\);/
  );
  assert.match(
    battleHtml,
    /function backToResult\(\) \{\s*persistBattleResultView\("result",\s*0\);\s*showScreen\("resultScreen"\);/
  );
});
