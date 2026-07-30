const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const battleHtml = fs.readFileSync(path.join(__dirname, "..", "public", "battle.html"), "utf8");

function renderNavigator({ answerCount, page }) {
  const match = battleHtml.match(/    (function renderRevNavigator\(\) \{[\s\S]*?\n    \})\n\n    function revPageGo/);
  assert.ok(match, "renderRevNavigator function should exist");

  const elements = {
    revNavigator: { innerHTML: "" },
    revPagePrevBtn: { style: {}, disabled: false },
    revPageNextBtn: { style: {}, disabled: false },
  };
  const context = {
    window: {
      battleAnswers: Array.from({ length: answerCount }, () => ({ your_answer: "A", is_correct: true })),
    },
    document: { getElementById: (id) => elements[id] },
    revStatus: () => "correct",
    REV_NAV_PAGE_SIZE: 10,
    revNavPage: page,
  };

  vm.runInNewContext(`${match[1]}; renderRevNavigator();`, context);
  return { elements, page: context.revNavPage };
}

test("battle answer review uses a viewport-contained desktop layout", () => {
  assert.match(
    battleHtml,
    /body:has\(#mistakesScreen\.active\)[^{]*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s
  );
  assert.match(
    battleHtml,
    /\.rev-card\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:[^;}]+;[^}]*grid-template-areas:/s
  );
  assert.match(
    battleHtml,
    /\.rev-card\s*\{[^}]*height:\s*min\(66vh,\s*680px,\s*calc\(100%\s*-\s*20px\)\);[^}]*min-height:\s*min\(500px,\s*calc\(100%\s*-\s*20px\)\);/s
  );
  assert.match(
    battleHtml,
    /\.rev-opt\s*\{[^}]*min-height:\s*54px;[^}]*padding:\s*10px\s+14px;/s
  );
  assert.match(
    battleHtml,
    /\.rev-navigator-wrap\s*\{[^}]*display:\s*grid;[^}]*justify-items:\s*center;/s
  );
  assert.match(
    battleHtml,
    /\.rev-page-nav\s*\{[^}]*justify-content:\s*center;/s
  );
});

test("battle answer review keeps a scrollable single-column mobile fallback", () => {
  assert.match(
    battleHtml,
    /@media \(max-width:\s*760px\)[\s\S]*?body:has\(#mistakesScreen\.active\)[^{]*\{[^}]*overflow-y:\s*auto;/
  );
  assert.match(
    battleHtml,
    /@media \(max-width:\s*760px\)[\s\S]*?\.rev-card\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;[^}]*display:\s*block;/
  );
});

test("battle answer navigator renders questions in groups of ten", () => {
  assert.match(battleHtml, /id="revPagePrevBtn"[^>]*onclick="revPageGo\(-1\)"/);
  assert.match(battleHtml, /id="revPageNextBtn"[^>]*onclick="revPageGo\(1\)"/);
  assert.match(battleHtml, /REV_NAV_PAGE_SIZE\s*=\s*10/);

  const { elements, page } = renderNavigator({ answerCount: 24, page: 1 });
  const numberButtons = elements.revNavigator.innerHTML.match(/data-idx=/g) || [];

  assert.equal(page, 1);
  assert.equal(numberButtons.length, 10);
  assert.match(elements.revNavigator.innerHTML, /data-idx="10"/);
  assert.match(elements.revNavigator.innerHTML, /data-idx="19"/);
  assert.doesNotMatch(elements.revNavigator.innerHTML, /data-idx="9"/);
  assert.doesNotMatch(elements.revNavigator.innerHTML, /data-idx="20"/);
  assert.equal(elements.revPagePrevBtn.disabled, false);
  assert.equal(elements.revPageNextBtn.disabled, false);
});

test("battle answer navigator adapts its final group to the remaining questions", () => {
  const { elements } = renderNavigator({ answerCount: 24, page: 2 });
  const numberButtons = elements.revNavigator.innerHTML.match(/data-idx=/g) || [];

  assert.equal(numberButtons.length, 4);
  assert.match(elements.revNavigator.innerHTML, /data-idx="20"/);
  assert.match(elements.revNavigator.innerHTML, /data-idx="23"/);
  assert.equal(elements.revPagePrevBtn.disabled, false);
  assert.equal(elements.revPageNextBtn.disabled, true);
});
