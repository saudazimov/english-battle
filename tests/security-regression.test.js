const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

test("backend JavaScript files pass Node syntax validation", () => {
  for (const file of ["server.js", "auth.js", "payme.js", "premium.js"]) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test("critical browser scripts are valid JavaScript", () => {
  for (const file of ["public/auth-common.js", "public/auth-register.js", "public/rank-info-dialog.js"]) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
  const files = [
    "public/teacher-settings.html",
    "public/teacher-messages.html",
    "public/lobby.html",
    "public/friends.html",
    "public/history.html",
    "public/profile.html",
    "public/student-class-assignments.html",
    "public/admin.html",
  ];
  for (const file of files) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
    for (const [index, match] of scripts.entries()) {
      if (!match[1].trim()) continue;
      assert.doesNotThrow(() => new Function(match[1]), `${file}, inline script ${index + 1}`);
    }
  }
});

test("lobby school details link targets the existing school rankings page", () => {
  const lobby = fs.readFileSync(path.join(root, "public/lobby.html"), "utf8");

  assert.match(
    lobby,
    /<a class="view-all" href="\/rankings\.html" data-i18n="lobby\.details">Batafsil<\/a>/
  );
  assert.doesNotMatch(lobby, /\/school-battle\.html/);
  assert.ok(fs.existsSync(path.join(root, "public/rankings.html")));
});

test("lobby current-rank info control opens an accessible details dialog", () => {
  const lobby = fs.readFileSync(path.join(root, "public/lobby.html"), "utf8");
  const dialog = fs.readFileSync(path.join(root, "public/rank-info-dialog.js"), "utf8");

  assert.match(lobby, /id="rankInfoButton"[^>]+aria-controls="rankInfoModal"/);
  assert.match(lobby, /src="\/rank-info-dialog\.js"/);
  assert.match(lobby, /createRankInfoDialog\(\{/);
  assert.match(lobby, /footerHref: "\/leaderboard\.html"/);
  assert.match(dialog, /overlay\.setAttribute\("role", "dialog"\)/);
  assert.match(dialog, /event\.key === "Escape"/);
});

test("leaderboard rankings info control uses the shared details dialog", () => {
  const leaderboard = fs.readFileSync(path.join(root, "public/leaderboard.html"), "utf8");
  const dialog = fs.readFileSync(path.join(root, "public/rank-info-dialog.js"), "utf8");

  assert.match(leaderboard, /id="rankingInfoButton"[^>]+aria-controls="rankInfoModal"/);
  assert.match(leaderboard, /src="\/rank-info-dialog\.js"/);
  assert.match(leaderboard, /detailType: "scopes"/);
  assert.match(leaderboard, /document\.getElementById\("yrGlobal"\)/);
  assert.match(leaderboard, /document\.getElementById\("yrSchool"\)/);
  assert.match(dialog, /rank-info-scope-name"><\/span> <span class="rank-info-scope-desc/);
});

test("friends summary info control uses live summary values", () => {
  const friends = fs.readFileSync(path.join(root, "public/friends.html"), "utf8");

  assert.match(friends, /id="friendsSummaryInfoButton"[^>]+aria-controls="rankInfoModal"/);
  assert.match(friends, /src="\/rank-info-dialog\.js"/);
  assert.match(friends, /hideFooter: true/);
  for (const id of ["fsTotal", "fsOnline", "fsRequests", "fsWins"]) {
    assert.match(friends, new RegExp(`document\\.getElementById\\("${id}"\\)`));
  }
});

test("history overview info control uses live history values", () => {
  const history = fs.readFileSync(path.join(root, "public/history.html"), "utf8");

  assert.match(history, /id="historyOverviewInfoButton"[^>]+aria-controls="rankInfoModal"/);
  assert.match(history, /src="\/rank-info-dialog\.js"/);
  assert.match(history, /headerIcon: "history"/);
  assert.match(history, /hideFooter: true/);
  for (const id of ["ovTotal", "ovWins", "ovLosses", "ovWinRate", "ovBest", "ovStreak"]) {
    assert.match(history, new RegExp(`document\\.getElementById\\("${id}"\\)`));
  }
});

test("history performance chart uses live rating changes", () => {
  const history = fs.readFileSync(path.join(root, "public/history.html"), "utf8");

  assert.match(history, /id="performanceChart"/);
  assert.doesNotMatch(history, /Rating o'sishi grafigi tez kunda/);
  assert.match(history, /function renderPerformanceChart\(\)/);
  assert.match(history, /allHistory\.slice\(0, 12\)/);
  assert.match(history, /Number\(battle\.rating_change\)/);
  assert.match(history, /performanceChart\.destroy\(\)/);
  assert.match(history, /renderPerformanceChart\(\);/);
  assert.match(history, /function formatPerformanceDate\(dateValue\)/);
  assert.match(history, /new Intl\.DateTimeFormat\(historyLocale\(\), \{ day: "numeric", month: "short" \}\)/);
  assert.match(history, /label: formatPerformanceDate\(battle\.played_at\)/);
  assert.doesNotMatch(history, /toLocaleDateString\("uz-UZ", \{ day: "2-digit", month: "short" \}\)/);
});

test("history achievements use live battle and streak progress", () => {
  const history = fs.readFileSync(path.join(root, "public/history.html"), "utf8");

  assert.match(history, /id="achievementsProgress">0 \/ 4/);
  assert.match(history, /id="achievementList"/);
  assert.doesNotMatch(history, /Erishganlaringiz \(streak, g'alabalar\) tez kunda/);
  assert.match(history, /function renderAchievements\(\)/);
  assert.match(history, /battle\.outcome === "win"/);
  assert.match(history, /Number\(user\.win_streak\)/);
  for (const key of ["achievementFirstWin", "achievementActiveFighter", "achievementWinningPath", "achievementStreakMaster"]) {
    assert.match(history, new RegExp(`history\\.${key}`));
  }
});

test("invite codes normalize consistently and use unambiguous alphabet", () => {
  process.env.SCHOOL_INVITE_PEPPER = "test-school-pepper";
  process.env.PARENT_CODE_PEPPER = "test-parent-pepper";
  const school = require(path.join(root, "schoolInvite"));
  const parent = require(path.join(root, "parentCode"));

  const schoolCode = school.generateRawCode();
  const parentCode = parent.generateRawCode();
  assert.match(schoolCode, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.match(parentCode, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(school.hashCode("ABCD-EFGH-23"), school.hashCode("abcd efgh 23"));
  assert.equal(school.formatForDisplay("ABCDEFGHIJ"), "ABCD-EFGH-IJ");
});

test("payment, session and upload integrity guards remain present", () => {
  const payme = fs.readFileSync(path.join(root, "payme.js"), "utf8");
  const premium = fs.readFileSync(path.join(root, "premium.js"), "utf8");
  const auth = fs.readFileSync(path.join(root, "auth.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const questClaim = fs.readFileSync(
    path.join(root, "src/controllers/questClaimController.js"),
    "utf8"
  );
  const registerService = fs.readFileSync(
    path.join(root, "src/services/registerService.js"),
    "utf8"
  );

  assert.match(payme, /timingSafeEqual/);
  assert.match(payme, /SELECT \* FROM payments WHERE id = \$1 FOR UPDATE/);
  assert.match(payme, /revokeSubscriptionDays/);
  assert.match(premium, /ON CONFLICT \(user_id, plan\) WHERE status = 'active'/);
  assert.match(auth, /auth_version/);
  assert.match(server, /uploadedContentMatches/);
  assert.match(questClaim, /FOR UPDATE OF uq/);
  assert.match(registerService, /new Set\(\["student", "teacher", "parent"\]\)/);
  assert.match(registerService, /requestedRole !== "school_admin"/);
});

test("all required security migrations exist", () => {
  for (const file of [
    "017_payment_integrity.sql",
    "018_auth_session_version.sql",
    "019_persistent_rate_limits.sql",
    "020_teacher_profile_fields.sql",
    "021_teacher_messages.sql",
  ]) {
    assert.ok(fs.existsSync(path.join(root, "migrations", file)), file);
  }
});
