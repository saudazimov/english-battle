const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const studentClassesHtml = fs.readFileSync(
  path.join(__dirname, "..", "public", "student-classes.html"),
  "utf8"
);

test("student classes content keeps space below the lobby topbar", () => {
  assert.match(studentClassesHtml, /\.page-wrap\s*\{\s*padding:\s*14px 0 0;\s*\}/);
  assert.match(studentClassesHtml, /<div class="topbar"><\/div>[\s\S]*<div class="page-wrap">[\s\S]*<h1>Sinflarim<\/h1>/);
});
