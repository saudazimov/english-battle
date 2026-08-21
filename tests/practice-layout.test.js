const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const practiceHtml = fs.readFileSync(
  path.join(__dirname, "..", "public", "practice.html"),
  "utf8"
);
const wordBuilderHtml = fs.readFileSync(
  path.join(__dirname, "..", "public", "word-builder-game.html"),
  "utf8"
);
const wordBuilderScript = fs.readFileSync(
  path.join(__dirname, "..", "public", "word-builder-game.js"),
  "utf8"
);
const smartboardScript = fs.readFileSync(
  path.join(__dirname, "..", "public", "smartboard-game.js"),
  "utf8"
);

test("practice page uses the shared application topbar", () => {
  assert.match(practiceHtml, /<main class="main">\s*<div class="topbar"><\/div>/);
  assert.match(practiceHtml, /<script src="\/sidebar\.js"><\/script>/);
  assert.match(practiceHtml, /renderSidebar\("practice"\);\s*renderTopbar\(\);/);
  assert.match(practiceHtml, /\.main\s*\{[^}]*padding:\s*0 0 42px;/);
  assert.match(
    practiceHtml,
    /\.main > \.topbar\s*\{[^}]*width:\s*calc\(100% - 340px\);[^}]*margin-bottom:\s*22px;/
  );
});

test("practice exit uses the custom confirmation modal", () => {
  assert.doesNotMatch(practiceHtml, /\bconfirm\s*\(/);
  assert.match(practiceHtml, /id="exitPracticeModal"[^>]*hidden/);
  assert.match(practiceHtml, /role="dialog"[^>]*aria-modal="true"/);
  assert.match(practiceHtml, />Mashqni davom ettirish<\/button>/);
  assert.match(practiceHtml, /function confirmExitPractice\(\)\s*{[\s\S]*showScreen\("setupScreen"\);/);
});

test("word builder shows only the active screen", () => {
  assert.match(wordBuilderHtml, /\[hidden\]\s*\{\s*display:\s*none!important\s*\}/);
  assert.match(wordBuilderHtml, /id="arenaScreen" hidden/);
  assert.match(wordBuilderHtml, /id="resultScreen" hidden/);
});

test("word builder advances after every completed word attempt", () => {
  assert.match(wordBuilderScript, /if \(built !== answer\) player\.wrong \+= 1;/);
  assert.match(wordBuilderScript, /if \(built === answer\) player\.score \+= 1;\s*player\.index \+= 1;/);
  assert.match(wordBuilderScript, /if \(player\.index < player\.order\.length\) preparePlayer\(player\);/);
  assert.match(wordBuilderScript, /else player\.selected\.pop\(\);/);
  assert.match(wordBuilderScript, /button\.disabled = player\.selected\.length === 0;/);
});

test("practice exposes Sentence Builder as an isolated temporary duel", () => {
  assert.match(practiceHtml, /class="pr-smartboard sentence-builder"/);
  assert.match(practiceHtml, /word-builder-game\.html\?mode=sentence/);
  assert.match(wordBuilderScript, /GAME_MODE = .*get\("mode"\) === "sentence"/);
  assert.match(wordBuilderScript, /ilmliga_sentence_builder_duel_v1/);
  assert.match(wordBuilderScript, /replace\(\/_\{2,\}\/, answer\)/);
  assert.match(wordBuilderScript, /player\.answerTokens = answerTokens\(word\);/);
  assert.match(wordBuilderScript, /mode: GAME_MODE, status: "playing"/);
});

test("practice exposes the two-stage Error Hunter duel", () => {
  assert.match(practiceHtml, /class="pr-smartboard error-hunter"/);
  assert.match(practiceHtml, /smartboard-game\.html\?mode=error/);
  assert.match(smartboardScript, /requestedMode = .*get\("mode"\)/);
  assert.match(smartboardScript, /requestedMode === "error" \|\| requestedMode === "match"/);
  assert.match(smartboardScript, /ilmliga_error_hunter_duel_v1/);
  assert.match(smartboardScript, /source = source\.replace\(\/_\{2,\}\/, wrongAnswer\);/);
  assert.match(smartboardScript, /step: "find"/);
  assert.match(smartboardScript, /player\.hunter\.step = "correct";/);
  assert.match(smartboardScript, /player\.hunter\.errorFoundCorrect && correctionIsCorrect/);
});

test("practice exposes Match Master with isolated four-pair batches", () => {
  assert.match(practiceHtml, /class="pr-smartboard match-master"/);
  assert.match(practiceHtml, /smartboard-game\.html\?mode=match/);
  assert.match(smartboardScript, /requestedMode === "error" \|\| requestedMode === "match"/);
  assert.match(smartboardScript, /ilmliga_match_master_duel_v1/);
  assert.match(smartboardScript, /player\.order\.slice\(player\.index, player\.index \+ 4\)/);
  assert.match(smartboardScript, /player\.match\.matchedQuestions\.push\(selectedIndex\);/);
  assert.match(smartboardScript, /normalizedAnswer\(correctAnswer\(state\.questions\[selectedIndex\]\)\)/);
  assert.match(smartboardScript, /if \(batchComplete\) player\.match = null;/);
});
