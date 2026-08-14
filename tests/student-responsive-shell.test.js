const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

function readPublic(fileName) {
  return fs.readFileSync(path.join(__dirname, "..", "public", fileName), "utf8");
}

test("student shell creates accessible left and right mobile drawers", () => {
  const sidebar = readPublic("sidebar.js");

  assert.match(sidebar, /document\.body\.classList\.add\("il-student-shell"\)/);
  assert.match(sidebar, /data-student-shell-toggle=|dataset\.studentShellToggle/);
  assert.match(sidebar, /aria-controls/);
  assert.match(sidebar, /aria-expanded/);
  assert.match(sidebar, /event\.key === "Escape"/);
  assert.match(sidebar, /max-width: 980px/);
});

test("student responsive CSS uses off-canvas drawers instead of stacked sidebars", () => {
  const responsive = readPublic("responsive.css");

  assert.match(responsive, /body\.il-student-shell \.sidebar\.il-student-sidebar/);
  assert.match(responsive, /translate3d\(-104%, 0, 0\)/);
  assert.match(responsive, /il-right-drawer-open/);
  assert.match(responsive, /\.il-shell-backdrop/);
  assert.match(responsive, /position:\s*fixed !important/);
});

test("representative student pages load the shared responsive shell", () => {
  ["lobby.html", "practice.html", "student-classes.html", "progress.html", "profile.html"].forEach((fileName) => {
    const page = readPublic(fileName);
    assert.match(page, /responsive\.css/);
    assert.match(page, /sidebar\.js/);
  });
});
