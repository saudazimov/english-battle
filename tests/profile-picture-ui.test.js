const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicRoot = path.join(__dirname, "..", "public");
const responsiveCss = fs.readFileSync(path.join(publicRoot, "responsive.css"), "utf8");

test("shared styles apply Telegram-like center crop to profile pictures", () => {
  assert.match(responsiveCss, /UNIVERSAL PROFILE PICTURE VIEWPORT/);
  assert.match(responsiveCss, /\[class\$="-avatar"\]/);
  assert.match(responsiveCss, /\[class\$="-ava"\]/);
  assert.match(responsiveCss, /\[class\*="-ava "\]/);
  assert.match(responsiveCss, /\[class\$="-av"\]/);
  assert.match(responsiveCss, /> img \{[\s\S]*?position: absolute !important;[\s\S]*?inset: 0 !important;/);
  assert.match(responsiveCss, /> img \{[\s\S]*?object-fit: cover !important;[\s\S]*?object-position: 50% 50% !important;/);
  assert.match(responsiveCss, /> img \{[\s\S]*?clip-path: circle\(50% at 50% 50%\);[\s\S]*?transform: scale\(1\.06\);/);
});

test("profile picture pages load the shared avatar styles", () => {
  [
    "battle.html",
    "friends.html",
    "history.html",
    "leaderboard.html",
    "lobby.html",
    "profile.html",
    "school-admin.html",
    "school-admin-profile.html",
    "school-tournaments.html",
    "teacher-messages.html",
    "teacher-settings.html",
    "team-battle.html",
    "tournament-battle.html",
  ].forEach((fileName) => {
    const page = fs.readFileSync(path.join(publicRoot, fileName), "utf8");
    assert.match(page, /responsive\.css/, `${fileName} must load responsive.css`);
  });
});
