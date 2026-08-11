"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname,"..","public","progress.js"),"utf8");
const learningSource = fs.readFileSync(path.join(__dirname,"..","public","progress-learning.js"),"utf8");

function functionBlock(name, nextName) {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(`async function ${nextName}`,start + 1);
  assert.notEqual(start,-1);
  assert.notEqual(end,-1);
  return source.slice(start,end);
}

test("opening progress reads lessons without automatically spending AI budget", () => {
  const loadBlock = functionBlock("loadStoredLessons","fetchLesson");
  assert.match(loadBlock,/remediation\/lessons[^/]\"?,\s*\{ method: \"GET\" \}/);
  assert.doesNotMatch(loadBlock,/remediation\/lessons\/sync/);
});

test("explicit error lesson action remains the only remediation sync trigger", () => {
  const prepareBlock = functionBlock("prepareErrorLesson","fetchLesson");
  assert.match(prepareBlock,/remediation\/lessons\/sync/);
  assert.match(prepareBlock,/answer_event_id/);
  assert.match(prepareBlock,/pending_count/);
  assert.match(prepareBlock,/review_required_count/);
  assert.match(source,/async function waitForStoredLesson/);
  assert.match(source,/setTimeout\(resolve, delay\)/);
});

test("lesson preparation blocks duplicate clicks and refreshes after pending generation", () => {
  const prepareBlock = functionBlock("prepareErrorLesson","fetchLesson");
  const guard = prepareBlock.indexOf("lessonPreparationKeys.has(key)");
  const sync = prepareBlock.indexOf("/learning/remediation/lessons/sync");
  assert.ok(guard >= 0 && guard < sync);
  assert.match(prepareBlock,/lessonPreparationKeys\.add\(key\)/);
  assert.match(prepareBlock,/button\.setAttribute\("aria-busy","true"\)/);
  assert.match(prepareBlock,/finally\s*\{/);
  assert.match(prepareBlock,/lessonPreparationKeys\.delete\(key\)/);
  assert.match(prepareBlock,/waitForStoredLesson\(evidence\)/);
  assert.match(prepareBlock,/renderRuleFlow\(currentPeriodData\)/);
  assert.match(source,/lessonPreparationKeys\.has\(preparationKey\)/);
});

test("lesson completion shows mastery failures inline and keeps retry available", () => {
  assert.match(source,/lessonCompletionStatus/);
  assert.match(source,/Natija tekshirilmoqda/);
  assert.match(source,/catch \(error\)/);
  assert.match(source,/completionStatus\.textContent = error\.message/);
  assert.match(source,/button\.disabled = false/);
  assert.match(source,/button\.disabled = lesson\.status === "COMPLETED"/);
  assert.match(source,/if \(lesson\.status !== "COMPLETED"\)/);
});

test("retest cards show two-attempt progress and keep future retests locked", () => {
  assert.match(learningSource,/Mustaqil retest: /);
  assert.match(learningSource,/upcoming_retests/);
  assert.match(learningSource,/Ochilishi: /);
  assert.match(learningSource,/button\.disabled = isUpcoming/);
  assert.match(learningSource,/Kutilmoqda/);
});
