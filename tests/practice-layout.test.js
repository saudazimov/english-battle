const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const practiceHtml = fs.readFileSync(
  path.join(__dirname, "..", "public", "practice.html"),
  "utf8"
);

test("practice page uses the shared application topbar", () => {
  assert.match(practiceHtml, /<main class="main">\s*<div class="topbar"><\/div>/);
  assert.match(practiceHtml, /<script src="\/sidebar\.js"><\/script>/);
  assert.match(practiceHtml, /renderSidebar\("practice"\);\s*renderTopbar\(\);/);
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
