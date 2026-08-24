const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { authMiddleware } = require("../auth");
const {
  createUserPublicProfileService,
} = require("../src/services/userPublicProfileService");
const {
  createUserPublicProfileController,
} = require("../src/controllers/userPublicProfileController");
const userPublicProfileRoutes = require("../src/routes/userPublicProfileRoutes");

const expectedSql = [
  `SELECT id, first_name, last_name, username, bio, cefr_level, rating, xp, coins,
              current_streak, longest_streak, win_streak, best_win_streak,
              region, district, village, school, profile_picture
       FROM users WHERE id = $1`,
  `SELECT
         COUNT(*) AS total_battles,
         COUNT(*) FILTER (WHERE outcome = 'win') AS wins,
         COUNT(*) FILTER (WHERE outcome = 'lose') AS loses,
         COUNT(*) FILTER (WHERE outcome = 'draw') AS draws,
         COALESCE(SUM(my_score), 0) AS total_correct,
         COALESCE(SUM(opponent_score), 0) AS opp_total,
         (SELECT bh.mode
          FROM battle_history bh
          WHERE bh.user_id = $1 AND bh.mode IS NOT NULL
          GROUP BY bh.mode
          ORDER BY COUNT(*) DESC, MAX(bh.played_at) DESC, bh.mode ASC
          LIMIT 1) AS favorite_mode
       FROM battle_history WHERE user_id = $1`,
  `SELECT requester_id, receiver_id, status FROM friendships
           WHERE (requester_id = $1 AND receiver_id = $2) OR (requester_id = $2 AND receiver_id = $1)
           LIMIT 1`,
  `WITH viewer_friends AS (
             SELECT CASE WHEN requester_id = $1 THEN receiver_id ELSE requester_id END AS fid
             FROM friendships
             WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'
           ),
           target_friends AS (
             SELECT CASE WHEN requester_id = $2 THEN receiver_id ELSE requester_id END AS fid
             FROM friendships
             WHERE (requester_id = $2 OR receiver_id = $2) AND status = 'accepted'
           )
           SELECT u.id, u.first_name, u.last_name, u.profile_picture, u.rating
           FROM viewer_friends vf
           JOIN target_friends tf ON vf.fid = tf.fid
           JOIN users u ON u.id = vf.fid
           ORDER BY u.rating DESC`,
];

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function profileRows() {
  return [{
    id: 7,
    first_name: "Ali",
    last_name: "Valiyev",
    username: "aliv",
    cefr_level: "B1",
    rating: 1200,
    xp: 300,
    coins: 40,
    current_streak: 2,
    longest_streak: 5,
    win_streak: 1,
    best_win_streak: 4,
    region: "Toshkent",
    district: "Chilonzor",
    village: "Bunyodkor",
    school: "1-maktab",
    profile_picture: null,
  }];
}

test("public profile preserves queries, mapping, and friend privacy", async () => {
  const calls = [];
  const mutualRows = Array.from({ length: 10 }, (_, index) => ({ id: index + 1 }));
  const results = [
    { rows: profileRows() },
    { rows: [{ total_battles: "4", wins: "3", loses: "1", draws: "0", total_correct: "27", opp_total: "18", favorite_mode: "duo" }] },
    { rows: [{ requester_id: 9, receiver_id: 7, status: "accepted" }] },
    { rows: mutualRows },
  ];
  let index = 0;
  const service = createUserPublicProfileService({
    pool: { async query(sql, params) { calls.push([sql, params]); return results[index++]; } },
  });

  const profile = await service.getProfile("7", 9);

  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => call[0]), expectedSql);
  assert.deepEqual(calls.map((call) => call[1]), [["7"], ["7"], [9, "7"], [9, "7"]]);
  assert.equal(profile.friendStatus, "friends");
  assert.equal(profile.user.district, "Chilonzor");
  assert.equal(profile.mutual_count, 10);
  assert.deepEqual(profile.mutual_friends, mutualRows.slice(0, 8));
  assert.deepEqual(profile.stats, {
    total_battles: 4,
    wins: 3,
    loses: 1,
    draws: 0,
    win_rate: 75,
    total_correct: 27,
    favorite_mode: "duo",
    favorite_mode_label: "Duo (2v2)",
  });
});

test("public profile preserves self behavior and skips friendship queries", async () => {
  let calls = 0;
  const service = createUserPublicProfileService({
    pool: {
      async query() {
        calls += 1;
        if (calls === 1) return { rows: profileRows() };
        return { rows: [{ total_battles: "0", wins: "0", loses: "0", draws: "0", total_correct: "0" }] };
      },
    },
  });

  const profile = await service.getProfile("7", 7);

  assert.equal(calls, 2);
  assert.equal(profile.friendStatus, "self");
  assert.equal(profile.stats.win_rate, 0);
  assert.equal(profile.stats.favorite_mode, null);
  assert.equal(profile.stats.favorite_mode_label, "Hali o'yin yo'q");
  assert.equal(profile.user.school, "1-maktab");
  assert.deepEqual(profile.mutual_friends, []);
});

test("public profile preserves optional friendship query fallbacks", async () => {
  let calls = 0;
  const service = createUserPublicProfileService({
    pool: {
      async query() {
        calls += 1;
        if (calls === 1) return { rows: profileRows() };
        if (calls === 2) {
          return { rows: [{ total_battles: "1", wins: "0", loses: "1", draws: "0", total_correct: "2" }] };
        }
        throw new Error("friendships table unavailable");
      },
    },
  });

  const profile = await service.getProfile("7", 9);

  assert.equal(calls, 4);
  assert.equal(profile.friendStatus, "none");
  assert.equal("district" in profile.user, false);
  assert.equal("village" in profile.user, false);
  assert.equal("school" in profile.user, false);
  assert.deepEqual(profile.mutual_friends, []);
  assert.equal(profile.mutual_count, 0);
});

test("public profile controller preserves not-found and database errors", async () => {
  const notFound = createUserPublicProfileController({
    pool: { async query() { return { rows: [] }; } },
  });
  const notFoundResponse = createResponse();
  await notFound.getProfile({ params: { userId: "404" }, user: { id: 9 } }, notFoundResponse);
  assert.equal(notFoundResponse.statusCode, 404);
  assert.deepEqual(notFoundResponse.body, { error: "Foydalanuvchi topilmadi" });

  const logs = [];
  const failed = createUserPublicProfileController({
    pool: { async query() { throw new Error("database failed"); } },
    logger: { error(...args) { logs.push(args); } },
  });
  const failedResponse = createResponse();
  await failed.getProfile({ params: { userId: "7" }, user: { id: 9 } }, failedResponse);
  assert.equal(failedResponse.statusCode, 500);
  assert.deepEqual(failedResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Profil xatosi:", "database failed"]]);
});

test("public profile route preserves path, method, and auth order", () => {
  const router = userPublicProfileRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/profile/:userId");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, authMiddleware);
});

test("favorite mode is rendered by every public profile surface", () => {
  const publicRoot = path.join(__dirname, "..", "public");
  const profile = fs.readFileSync(path.join(publicRoot, "profile.html"), "utf8");
  const friends = fs.readFileSync(path.join(publicRoot, "friends.html"), "utf8");
  const profileModal = fs.readFileSync(path.join(publicRoot, "profile-modal.js"), "utf8");

  assert.match(profile, /id="abFavoriteMode"/);
  assert.match(profile, /data\.stats\.favorite_mode_label/);
  assert.match(friends, /fEsc\(favoriteMode\)/);
  assert.match(profileModal, /fpEsc\(favoriteMode\)/);
  assert.doesNotMatch(profile, /about-v soon-badge" id="abFavoriteMode"/);
  assert.doesNotMatch(friends, /fp-av soon-badge[^\n]+fEsc\(favoriteMode\)/);
  assert.doesNotMatch(profileModal, /fp-av soon-badge[^\n]+fpEsc\(favoriteMode\)/);
});

test("profile achievement summary uses live profile statistics", () => {
  const profile = fs.readFileSync(
    path.join(__dirname, "..", "public", "profile.html"),
    "utf8"
  );

  assert.match(profile, /id="asUnlocked">0 \/ 4/);
  for (const id of ["asTotal", "asGold", "asSilver", "asBronze"]) {
    assert.match(profile, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(profile, /Achievements Summary<\/span><span class="soon-badge">Tez kunda/);
  assert.match(profile, /function renderAchievementSummary\(profileUser, stats\)/);
  assert.match(profile, /Number\(stats\.wins\)/);
  assert.match(profile, /Number\(stats\.total_battles\)/);
  assert.match(profile, /profileUser\.best_win_streak \|\| profileUser\.win_streak/);
  assert.match(profile, /Number\(profileUser\.rating\)/);
  assert.match(profile, /renderAchievementSummary\(data\.user \|\| \{\}, data\.stats \|\| \{\}\)/);
});

test("profile achievements unlock from live profile statistics", () => {
  const profile = fs.readFileSync(
    path.join(__dirname, "..", "public", "profile.html"),
    "utf8"
  );

  assert.doesNotMatch(profile, /Achievements\s*<span class="soon-badge"[^>]*>Tez kunda/);
  assert.doesNotMatch(profile, /Yutuqlar tizimi tez kunda/);
  assert.match(profile, /id="achUnlocked"[^>]*>0 \/ 5/);
  for (const id of ["achWins", "achStreak", "achCorrect", "achElite", "achLearner"]) {
    assert.match(profile, new RegExp(`id="${id}"`));
  }
  assert.match(profile, /function renderAchievements\(profileUser, stats\)/);
  assert.match(profile, /Number\(stats\.total_correct\)/);
  assert.match(profile, /achievement\.value >= achievement\.target/);
  assert.match(profile, /item\.classList\.toggle\("ach-locked", !isUnlocked\)/);
  assert.match(profile, /renderAchievements\(data\.user \|\| \{\}, data\.stats \|\| \{\}\)/);
});

test("profile CEFR progress info uses the shared accessible dialog", () => {
  const profile = fs.readFileSync(
    path.join(__dirname, "..", "public", "profile.html"),
    "utf8"
  );

  assert.match(profile, /id="cefrProgressInfoButton"[^>]+aria-controls="rankInfoModal"/);
  assert.match(profile, /src="\/rank-info-dialog\.js"/);
  assert.match(profile, /const nextCefrLevels = \{ A1: "A2"/);
  assert.match(profile, /createRankInfoDialog\(\{/);
  assert.match(profile, /triggerId: "cefrProgressInfoButton"/);
  assert.match(profile, /detailType: "scopes"/);
  assert.match(profile, /document\.getElementById\("pcCefr"\)/);
  assert.match(profile, /value: "A1 → C2"/);
});

test("profile current rank info uses live setupRank details", () => {
  const profile = fs.readFileSync(
    path.join(__dirname, "..", "public", "profile.html"),
    "utf8"
  );
  const dialog = fs.readFileSync(
    path.join(__dirname, "..", "public", "rank-info-dialog.js"),
    "utf8"
  );

  assert.match(profile, /id="profileRankInfoButton"[^>]+aria-controls="rankInfoModal"/);
  assert.match(profile, /let currentRankDetails = null/);
  assert.match(profile, /currentRankDetails = \{ rating: r, current: cur, next: next, progress: prog \}/);
  assert.match(profile, /setupRank\(Number\(document\.getElementById\("rankRP"\)\.textContent\) \|\| 1000\)/);
  assert.match(profile, /triggerId: "profileRankInfoButton"/);
  assert.match(profile, /Math\.max\(0, next\.min - rating\)/);
  assert.match(profile, /footerHref: "\/leaderboard\.html"/);
  assert.match(dialog, /rank-info-head-ic"\)\.innerHTML/);
});

test("profile premium AI lock state is responsive and contained", () => {
  const profile = fs.readFileSync(
    path.join(__dirname, "..", "public", "profile.html"),
    "utf8"
  );

  assert.match(profile, /\.ai-card \{ position:relative; flex:0 0 auto; min-height:min-content; padding:22px 24px; overflow:hidden; \}/);
  assert.match(profile, /\.ai-card \.card-title \{[^}]*flex-wrap:wrap/);
  assert.match(profile, /\.ai-premium-features \{[^}]*repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(profile, /@media \(max-width:700px\)/);
  assert.match(profile, /class="ai-empty ai-premium-lock"/);
  assert.match(profile, /profileT\("profile\.personalAiCoach"\)/);
  assert.match(profile, /class="ai-premium-btn"/);
  assert.match(profile, /window\.openPaymentModal\(\\'student_premium\\'\)/);
  assert.doesNotMatch(profile, /class="btn nlp-btn" style="max-width:200px/);
  assert.match(profile, /const normalizedUserRole = String\(user\.role \|\| "student"\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(profile, /const isOwnStudentProfile = isOwnProfile && normalizedUserRole === "student"/);
  assert.match(profile, /aiCard\.style\.display = "block"/);
  assert.match(profile, /renderAILocked\(aiBody\)/);
  assert.match(profile, /if \(isOwnStudentProfile\) loadAIReport\(\)/);
  assert.ok(profile.indexOf('id="examCard"') < profile.indexOf('id="aiCard"'));
  assert.ok(profile.indexOf('id="aiCard"') < profile.indexOf('class="card hist-card"'));
  assert.equal((profile.match(/id="aiCard"/g) || []).length, 1);
});

test("premium payment modal keeps readable colors independent of page theme", () => {
  const paymentModal = fs.readFileSync(
    path.join(__dirname, "..", "public", "payment-modal.js"),
    "utf8"
  );

  assert.match(paymentModal, /\.pm-overlay\{--pm-card:#111a2e/);
  assert.match(paymentModal, /--pm-text:#f8fafc/);
  assert.match(paymentModal, /--pm-dim:#c4cee0/);
  assert.match(paymentModal, /color-scheme:dark/);
  assert.match(paymentModal, /\.pm-modal\{[^}]*color:var\(--pm-text\)/);
  assert.match(paymentModal, /\.pm-month\.active\{[^}]*background:#172b50/);
  assert.doesNotMatch(paymentModal, /\[data-theme="dark"\]\{--pm-card/);
});

test("universal profile modal renders real mutual friends", () => {
  const profileModal = fs.readFileSync(
    path.join(__dirname, "..", "public", "profile-modal.js"),
    "utf8"
  );

  assert.match(profileModal, /Array\.isArray\(data\.mutual_friends\)/);
  assert.match(profileModal, /Number\(data\.mutual_count\)/);
  assert.match(profileModal, /onclick="openProfileModal\('/);
  assert.doesNotMatch(profileModal, /Umumiy do\\'stlar tez kunda/);
});

test("public profile modals use the same phone-sized responsive layout", () => {
  const publicRoot = path.join(__dirname, "..", "public");
  const friends = fs.readFileSync(path.join(publicRoot, "friends.html"), "utf8");
  const profileModal = fs.readFileSync(
    path.join(publicRoot, "profile-modal.js"),
    "utf8"
  );

  for (const surface of [friends, profileModal]) {
    assert.match(surface, /max-width:\s*640px/);
    assert.match(surface, /min-height:\s*100dvh/);
    assert.match(surface, /grid-template-columns:\s*72px minmax\(0,\s*1fr\)/);
    assert.match(surface, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(surface, /position:\s*sticky/);
  }
});

test("public profile about sections do not render a rounded decorative shell", () => {
  const publicRoot = path.join(__dirname, "..", "public");
  const friends = fs.readFileSync(path.join(publicRoot, "friends.html"), "utf8");
  const profileModal = fs.readFileSync(
    path.join(publicRoot, "profile-modal.js"),
    "utf8"
  );

  for (const surface of [friends, profileModal]) {
    assert.match(
      surface,
      /#fpAbout\.fp-block\s*\{[^}]*background:\s*transparent[^}]*border:\s*0[^}]*border-radius:\s*0/
    );
  }
});
