const test = require("node:test");
const assert = require("node:assert/strict");
const { createProfilePictureController } = require("../src/controllers/profilePictureController");

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

function createController(overrides = {}) {
  return createProfilePictureController({
    pool: { async query() { return { rows: [] }; } },
    uploadedContentMatches: () => true,
    removeUploadedFile: () => {},
    fileSystem: { existsSync() { return false; }, unlinkSync() {} },
    pathModule: {
      join(...parts) { return parts.join("/"); },
      basename(value) { return value.split("/").at(-1); },
    },
    uploadsDirectory: "C:/app/public/uploads",
    ...overrides,
  });
}

test("profile picture preserves missing-file validation", async () => {
  let queryCount = 0;
  const controller = createController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
  });
  const res = createResponse();

  await controller.update({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Rasm yuklanmadi" });
});

test("profile picture preserves invalid-content cleanup and response", async () => {
  const removed = [];
  const file = { filename: "user_42_bad.png", path: "temp/bad.png" };
  const controller = createController({
    uploadedContentMatches: () => false,
    removeUploadedFile(value) { removed.push(value); },
  });
  const res = createResponse();

  await controller.update({ user: { id: 42 }, file }, res);

  assert.deepEqual(removed, [file]);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Fayl haqiqiy rasm emas" });
});

test("profile picture preserves database update and previous-file cleanup", async () => {
  const queries = [];
  const fileCalls = [];
  const controller = createController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        if (queries.length === 1) {
          return { rows: [{ profile_picture: "/uploads/user_42_old.png" }] };
        }
        return { rowCount: 1 };
      },
    },
    fileSystem: {
      existsSync(path) { fileCalls.push(["exists", path]); return true; },
      unlinkSync(path) { fileCalls.push(["unlink", path]); },
    },
  });
  const res = createResponse();

  await controller.update({
    user: { id: 42 },
    params: { userId: "999999" },
    file: { filename: "user_42_new.png", path: "temp/new.png" },
  }, res);

  assert.equal(queries[0].sql, "SELECT profile_picture FROM users WHERE id = $1");
  assert.deepEqual(queries[0].params, [42]);
  assert.equal(queries[1].sql, "UPDATE users SET profile_picture = $1 WHERE id = $2");
  assert.deepEqual(queries[1].params, ["/uploads/user_42_new.png", 42]);
  assert.deepEqual(fileCalls, [
    ["exists", "C:/app/public/uploads/user_42_old.png"],
    ["unlink", "C:/app/public/uploads/user_42_old.png"],
  ]);
  assert.deepEqual(res.body, {
    message: "Rasm yangilandi",
    profile_picture: "/uploads/user_42_new.png",
  });
});

test("profile picture preserves uploaded-file cleanup on database errors", async () => {
  const logged = [];
  const removed = [];
  const file = { filename: "user_42_new.png", path: "temp/new.png" };
  const controller = createController({
    pool: { async query() { throw new Error("database unavailable"); } },
    removeUploadedFile(value) { removed.push(value); },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.update({ user: { id: 42 }, file }, res);

  assert.deepEqual(removed, [file]);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Rasm yuklash xatosi:", "database unavailable"]]);
});
