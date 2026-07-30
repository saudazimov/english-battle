const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const teamBattleHtml = fs.readFileSync(
  path.join(__dirname, "..", "public", "team-battle.html"),
  "utf8"
);

test("team battle advances immediately after submitting an answer", () => {
  assert.match(
    teamBattleHtml,
    /function selectAnswer\(letter, q\) \{[\s\S]*socket\.emit\("submitTeamAnswer"[\s\S]*currentQ\+\+;[\s\S]*renderQuestion\(\);[\s\S]*\n\s*\}/
  );
});

test("team answer result updates score without revealing correctness or delaying navigation", () => {
  const resultHandler = teamBattleHtml.match(
    /socket\.on\("teamAnswerResult", function \(data\) \{([\s\S]*?)\n\s*\}\);/
  );

  assert.ok(resultHandler);
  assert.match(resultHandler[1], /myScore\s*=\s*data\.myScore/);
  assert.doesNotMatch(resultHandler[1], /correct_option|classList\.add\("correct"\)|classList\.add\("wrong"\)|setTimeout|currentQ\+\+/);
});
