const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware } = require("../auth");
const {
  createUserPublicProfileService,
} = require("../src/services/userPublicProfileService");
const {
  createUserPublicProfileController,
} = require("../src/controllers/userPublicProfileController");
const userPublicProfileRoutes = require("../src/routes/userPublicProfileRoutes");

const expectedSql = [
  `SELECT id, first_name, last_name, username, cefr_level, rating, xp, coins,
              current_streak, longest_streak, win_streak, best_win_streak,
              region, district, village, school, profile_picture
       FROM users WHERE id = $1`,
  `SELECT
         COUNT(*) AS total_battles,
         COUNT(*) FILTER (WHERE outcome = 'win') AS wins,
         COUNT(*) FILTER (WHERE outcome = 'lose') AS loses,
         COUNT(*) FILTER (WHERE outcome = 'draw') AS draws,
         COALESCE(SUM(my_score), 0) AS total_correct,
         COALESCE(SUM(opponent_score), 0) AS opp_total
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
    { rows: [{ total_battles: "4", wins: "3", loses: "1", draws: "0", total_correct: "27", opp_total: "18" }] },
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
