const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const rankingsHtml = fs.readFileSync(
  path.join(__dirname, "..", "public", "rankings.html"),
  "utf8"
);

test("combined rankings display compact region names in every ranking tab", () => {
  assert.match(
    rankingsHtml,
    /function compactRegionName\(value\)\s*{[^}]*replace\(\/\\s\+Region\$\/i, ""\)/
  );
  assert.match(rankingsHtml, /function rankingName\(value, field\)/);
  assert.match(rankingsHtml, /compactRegionName\(item\.region\)/);
  assert.match(rankingsHtml, /compactRegionName\(myEntry\.region\)/);
});
