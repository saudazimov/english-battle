const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

function readPage(fileName) {
  return fs.readFileSync(path.join(__dirname, "..", "public", fileName), "utf8");
}

test("pages without a right sidebar reserve its desktop topbar space", () => {
  const pages = [
    readPage("practice.html"),
    readPage("student-tournaments.html"),
    readPage("school-tournaments.html"),
  ];

  pages.forEach((page) => {
    assert.match(page, /\.topbar\s*\{[^}]*width:\s*calc\(100% - 340px\)/);
    assert.match(page, /@media \(max-width:\s*1200px\)[^{]*\{[\s\S]*?\.topbar\s*\{\s*width:\s*100%;\s*\}/);
  });
});
