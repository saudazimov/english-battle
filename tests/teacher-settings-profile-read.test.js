const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherSettingsProfileReadController,
} = require("../src/controllers/teacherSettingsProfileReadController");

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

test("teacher settings profile read preserves query and response", async () => {
  const profile = {
    id: 42,
    first_name: "Kamola",
    last_name: "Teacher",
    phone: "+998900000000",
    email: null,
  };
  const queries = [];
  const controller = createTeacherSettingsProfileReadController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [profile] };
      },
    },
  });
  const res = createResponse();

  await controller.getProfile({ user: { id: 42 } }, res);

  assert.deepEqual(queries, [{
    sql: `SELECT id, first_name, last_name, phone, email, bio, teaching_subject,
              profile_picture, created_at
       FROM users WHERE id = $1`,
    params: [42],
  }]);
  assert.deepEqual(res.body, { profile });
});

test("teacher settings profile read preserves user-not-found response", async () => {
  const controller = createTeacherSettingsProfileReadController({
    pool: { async query() { return { rows: [] }; } },
  });
  const res = createResponse();

  await controller.getProfile({ user: { id: 42 } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Foydalanuvchi topilmadi" });
});

test("teacher settings profile read preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherSettingsProfileReadController({
    pool: { async query() { throw new Error("database unavailable"); } },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.getProfile({ user: { id: 42 } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Teacher settings profile xatosi:", "database unavailable"]]);
});
