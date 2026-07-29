const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireParent } = require("../auth");
const {
  createParentChildDetailService,
  mapBattle,
  mapExam,
  mapAssignment,
} = require("../src/services/parentChildDetailService");
const {
  createParentChildDetailController,
} = require("../src/controllers/parentChildDetailController");
const parentChildDetailRoutes = require("../src/routes/parentChildDetailRoutes");

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

test("parent child detail preserves query order, calculations, and mapping", async () => {
  const linkedAt = new Date("2026-01-01T00:00:00.000Z");
  const lastPlayed = new Date("2026-07-27T00:00:00.000Z");
  const playedAt = new Date("2026-07-26T00:00:00.000Z");
  const takenAt = new Date("2026-07-20T00:00:00.000Z");
  const dueAt = new Date("2026-08-01T00:00:00.000Z");
  const submittedAt = new Date("2026-07-25T00:00:00.000Z");
  const responses = [
    { rows: [{ relationship: "father", linked_at: linkedAt }] },
    { rows: [{
      id: 11,
      first_name: "Ali",
      last_name: "Valiyev",
      cefr_level: "B1",
      rating: 1200,
      xp: 350,
      school: "1-maktab",
      is_banned: 0,
      current_streak: 4,
      class_count: 2,
    }] },
    { rows: [{
      total: 4,
      wins: 3,
      correct_sum: 8,
      q_sum: 6,
      weekly: 2,
      last_played: lastPlayed,
    }] },
    { rows: [{
      played_at: playedAt,
      outcome: "win",
      my_score: null,
      opponent_score: 2,
      mode: "ranked",
      total_questions: 0,
    }] },
    { rows: [{
      title: "Grammar",
      class_name: "B1",
      tf: "Olim",
      tl: "Karimov",
      due_at: dueAt,
      sub_status: "submitted",
      score: 8,
      percent: 80,
      is_late: true,
      submitted_at: submittedAt,
    }] },
    { rows: [{ skill: "grammar", attempts: 4, correct: 1 }] },
    { rows: [{
      from_level: "A2",
      to_level: "B1",
      overall_percent: 78,
      passed: true,
      level_changed: true,
      taken_at: takenAt,
    }] },
  ];
  const queries = [];
  const leagueCalls = [];
  const activityCalls = [];
  const service = createParentChildDetailService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
    parentLeagueName(rating) {
      leagueCalls.push(rating);
      return "Gold";
    },
    activityLabel(value) {
      activityCalls.push(value);
      return "Bugun";
    },
  });

  const outcome = await service.getChildDetail({ parentId: 3, studentId: 11 });

  assert.deepEqual(outcome, {
    status: "found",
    detail: {
      child: {
        id: 11,
        name: "Ali Valiyev",
        cefr_level: "B1",
        league: "Gold",
        rating: 1200,
        xp: 350,
        school_name: "1-maktab",
        class_count: 2,
        is_banned: false,
        relationship: "father",
        linked_at: linkedAt,
      },
      overview: {
        total_battles: 4,
        win_rate: 75,
        accuracy: 100,
        current_streak: 4,
        weekly_activity_count: 2,
        last_activity_label: "Bugun",
      },
      battles: [{
        played_at: playedAt,
        result: "win",
        score: "0 : 2",
        opponent_label: "Raqib",
        mode: "ranked",
        question_count: null,
      }],
      exams: [{
        from_level: "A2",
        to_level: "B1",
        overall_percent: 78,
        passed: true,
        level_changed: true,
        taken_at: takenAt,
      }],
      assignments: [{
        title: "Grammar",
        class_name: "B1",
        teacher_name: "Olim Karimov",
        due_at: dueAt,
        status: "late_submitted",
        score: 8,
        percent: 80,
        is_late: true,
        submitted_at: submittedAt,
      }],
      weak_areas: [{ skill: "grammar", accuracy: 25, attempts: 4 }],
    },
  });
  assert.equal(queries.length, 7);
  assert.deepEqual(queries.map(({ params }) => params), [
    [3, 11], [11], [11], [11], [11], [11], [11],
  ]);
  assert.equal(queries[0].sql, "SELECT relationship, linked_at FROM parent_links WHERE parent_id=$1 AND student_id=$2 AND status='active'");
  assert.match(queries[1].sql, /^SELECT u\.id, u\.first_name/);
  assert.match(queries[2].sql, /^SELECT COUNT\(\*\)::int AS total/);
  assert.match(queries[3].sql, /^SELECT played_at, outcome/);
  assert.match(queries[4].sql, /^SELECT a\.id, a\.title/);
  assert.match(queries[5].sql, /^SELECT aq\.skill/);
  assert.match(queries[6].sql, /^SELECT from_level/);
  assert.deepEqual(leagueCalls, [1200]);
  assert.deepEqual(activityCalls, [lastPlayed]);
});

test("parent child detail preserves access short circuits", async () => {
  const forbiddenService = createParentChildDetailService({
    pool: { async query() { return { rows: [] }; } },
    parentLeagueName: assert.fail,
    activityLabel: assert.fail,
  });
  assert.deepEqual(await forbiddenService.getChildDetail({ parentId: 3, studentId: 11 }), {
    status: "forbidden",
  });

  let calls = 0;
  const missingService = createParentChildDetailService({
    pool: {
      async query() {
        calls++;
        return calls === 1 ? { rows: [{ relationship: "guardian" }] } : { rows: [] };
      },
    },
    parentLeagueName: assert.fail,
    activityLabel: assert.fail,
  });
  assert.deepEqual(await missingService.getChildDetail({ parentId: 3, studentId: 11 }), {
    status: "not-found",
  });
  assert.equal(calls, 2);
});

test("parent child detail mapping preserves status and fallback behavior", () => {
  assert.deepEqual(mapBattle({
    played_at: "date",
    outcome: "loss",
    my_score: 0,
    opponent_score: null,
    mode: "casual",
    total_questions: 10,
  }), {
    played_at: "date",
    result: "loss",
    score: "0 : 0",
    opponent_label: "Raqib",
    mode: "casual",
    question_count: 10,
  });
  assert.equal(mapAssignment({ sub_status: null }).status, "not_started");
  assert.equal(mapAssignment({ sub_status: "in_progress" }).status, "in_progress");
  assert.equal(mapAssignment({ sub_status: "submitted", is_late: false }).status, "submitted");
  assert.deepEqual(mapExam({
    from_level: "A1",
    to_level: "A2",
    overall_percent: 70,
    passed: true,
    level_changed: true,
    taken_at: "date",
  }), {
    from_level: "A1",
    to_level: "A2",
    overall_percent: 70,
    passed: true,
    level_changed: true,
    taken_at: "date",
  });
});

test("parent child detail controller preserves validation and errors", async () => {
  const invalidController = createParentChildDetailController({
    pool: { query: assert.fail },
    parentLeagueName: assert.fail,
    activityLabel: assert.fail,
  });
  const invalidResponse = createResponse();
  await invalidController.getChildDetail(
    { user: { id: 3 }, params: { studentId: "bad" } },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const forbiddenController = createParentChildDetailController({
    pool: { async query() { return { rows: [] }; } },
    parentLeagueName: assert.fail,
    activityLabel: assert.fail,
  });
  const forbiddenResponse = createResponse();
  await forbiddenController.getChildDetail(
    { user: { id: 3 }, params: { studentId: "11" } },
    forbiddenResponse
  );
  assert.equal(forbiddenResponse.statusCode, 403);
  assert.deepEqual(forbiddenResponse.body, { error: "Bu farzandga ruxsatingiz yo'q" });

  const failingController = createParentChildDetailController({
    pool: { async query() { throw new Error("database unavailable"); } },
    parentLeagueName: assert.fail,
    activityLabel: assert.fail,
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await failingController.getChildDetail(
      { user: { id: 3 }, params: { studentId: "11" } },
      errorResponse
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Bola paneli xatosi:", "database unavailable"]]);
});

test("parent child detail route preserves path and middleware order", () => {
  const router = parentChildDetailRoutes({
    pool: {},
    parentLeagueName() {},
    activityLabel() {},
  });
  const route = router.stack[0].route;

  assert.equal(route.path, "/parent/children/:studentId");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireParent);
  assert.equal(route.stack.length, 3);
});
