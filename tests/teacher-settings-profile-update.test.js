const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherSettingsProfileUpdateController,
} = require("../src/controllers/teacherSettingsProfileUpdateController");

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

function trimText(value) {
  return String(value).trim();
}

test("teacher settings profile update preserves sanitization, query and response", async () => {
  const sanitizeCalls = [];
  const queries = [];
  const profile = { id: 42, first_name: "Kamola", last_name: "Teacher" };
  const controller = createTeacherSettingsProfileUpdateController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [profile] };
      },
    },
    sanitizeText(value, maxLength) {
      sanitizeCalls.push([value, maxLength]);
      return trimText(value);
    },
  });
  const res = createResponse();

  await controller.updateProfile({
    user: { id: 42 },
    body: {
      first_name: " Kamola ",
      last_name: " Teacher ",
      email: " TEST@EXAMPLE.COM ",
      bio: " Bio ",
      teaching_subject: " Grammar ",
    },
  }, res);

  assert.deepEqual(sanitizeCalls, [
    [" Kamola ", 100],
    [" Teacher ", 100],
    [" Bio ", 500],
    [" Grammar ", 80],
  ]);
  assert.deepEqual(queries, [{
    sql: `UPDATE users SET first_name=$1, last_name=$2, email=$3, bio=$4, teaching_subject=$5
       WHERE id=$6
       RETURNING id, first_name, last_name, phone, email, bio, teaching_subject, profile_picture, created_at`,
    params: ["Kamola", "Teacher", "test@example.com", "Bio", "Grammar", 42],
  }]);
  assert.deepEqual(res.body, { message: "Profil saqlandi", profile });
});

test("teacher settings profile update preserves name validation", async () => {
  let queryCount = 0;
  const controller = createTeacherSettingsProfileUpdateController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    sanitizeText: trimText,
  });
  const res = createResponse();

  await controller.updateProfile({ user: { id: 42 }, body: {} }, res);

  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Ism va familiya kamida 2 belgidan iborat bo'lsin" });
});

test("teacher settings profile update preserves email validation", async () => {
  let queryCount = 0;
  const controller = createTeacherSettingsProfileUpdateController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    sanitizeText: trimText,
  });
  const res = createResponse();

  await controller.updateProfile({
    user: { id: 42 },
    body: { first_name: "Ali", last_name: "Valiyev", email: "invalid email" },
  }, res);

  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Email formati noto'g'ri" });
});

test("teacher settings profile update preserves duplicate-email response", async () => {
  const logged = [];
  const controller = createTeacherSettingsProfileUpdateController({
    pool: {
      async query() {
        const error = new Error("duplicate email");
        error.code = "23505";
        throw error;
      },
    },
    sanitizeText: trimText,
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.updateProfile({
    user: { id: 42 },
    body: { first_name: "Ali", last_name: "Valiyev", email: "ali@example.com" },
  }, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: "Bu email boshqa hisobda ishlatilgan" });
  assert.deepEqual(logged, []);
});

test("teacher settings profile update preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherSettingsProfileUpdateController({
    pool: { async query() { throw new Error("database unavailable"); } },
    sanitizeText: trimText,
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.updateProfile({
    user: { id: 42 },
    body: { first_name: "Ali", last_name: "Valiyev" },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Teacher profile update xatosi:", "database unavailable"]]);
});
