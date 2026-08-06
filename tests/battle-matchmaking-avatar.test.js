const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const battleHtml = fs.readFileSync(
  path.join(__dirname, "..", "public", "battle.html"),
  "utf8"
);

test("matchmaking profile pictures remain circular and center-cropped", () => {
  assert.match(battleHtml, /\.mm-pava \{[^}]*aspect-ratio:\s*1/);
  assert.match(battleHtml, /\.mm-pava-img \{[^}]*border-radius:\s*50%[^}]*overflow:\s*hidden/);
  assert.match(battleHtml, /\.mm-pava-img img \{[^}]*position:\s*absolute[^}]*inset:\s*0/);
  assert.match(battleHtml, /\.mm-pava-img img \{[^}]*clip-path:\s*circle\(50% at 50% 50%\)[^}]*object-fit:\s*cover[^}]*object-position:\s*50% 50%/);
  assert.match(battleHtml, /\.mm-pava-img img \{[^}]*transform:\s*scale\(1\.06\)[^}]*transform-origin:\s*50% 50%/);
});
