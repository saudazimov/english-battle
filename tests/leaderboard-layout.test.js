const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const leaderboardHtml = fs.readFileSync(
  path.join(__dirname, "..", "public", "leaderboard.html"),
  "utf8"
);

test("national leaderboard displays compact region names", () => {
  assert.match(
    leaderboardHtml,
    /function compactRegionName\(value\)\s*{[^}]*replace\(\/\\s\+Region\$\/i, ""\)/
  );
  assert.match(
    leaderboardHtml,
    /currentScope === "national"\) return esc\(compactRegionName\(p\.region\)\)/
  );
});
