const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { authMiddleware } = require("../auth");
const {
  createUserProfileUpdateService,
} = require("../src/services/userProfileUpdateService");
const {
  createUserProfileUpdateController,
} = require("../src/controllers/userProfileUpdateController");
const createUserProfileUpdateRoutes = require("../src/routes/userProfileUpdateRoutes");

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

test("profile update validates names and uses parameterized SQL", async () => {
  const queries = [];
  const updatedUser = {
    id: 7,
    first_name: "O‘tkir",
    last_name: "Ali-Zoda",
    username: "otkir_7",
    bio: "English learner",
    profile_picture: null,
  };
  const service = createUserProfileUpdateService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [updatedUser] };
      },
    },
  });

  const outcome = await service.updateNames(7, {
    first_name: "  O‘tkir  ",
    last_name: "Ali-Zoda",
    bio: "  English learner  ",
  });

  assert.equal(outcome.status, "updated");
  assert.deepEqual(outcome.user, updatedUser);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /SET first_name = \$1, last_name = \$2, bio = \$3/);
  assert.match(queries[0].sql, /WHERE id = \$4/);
  assert.deepEqual(queries[0].params, ["O‘tkir", "Ali-Zoda", "English learner", 7]);
});

test("profile update rejects unsafe names before querying", async () => {
  let queryCount = 0;
  const service = createUserProfileUpdateService({
    pool: {
      async query() {
        queryCount += 1;
        return { rows: [] };
      },
    },
  });

  const outcome = await service.updateNames(7, {
    first_name: "<script>",
    last_name: "Azimov",
  });

  assert.equal(outcome.status, "invalid");
  assert.equal(queryCount, 0);
});

test("profile update rejects a bio longer than 500 characters", async () => {
  let queryCount = 0;
  const service = createUserProfileUpdateService({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
  });

  const outcome = await service.updateNames(7, {
    first_name: "Jasur",
    last_name: "Azimov",
    bio: "a".repeat(501),
  });

  assert.equal(outcome.status, "invalid");
  assert.equal(outcome.error, "Bio 500 belgidan oshmasin");
  assert.equal(queryCount, 0);
});

test("profile update controller returns safe success and database errors", async () => {
  const controller = createUserProfileUpdateController({
    pool: {
      async query() {
        return { rows: [{ id: 4, first_name: "Jasur", last_name: "Azimov" }] };
      },
    },
  });
  const successResponse = createResponse();
  await controller.updateProfile({
    user: { id: 4 },
    body: { first_name: "Jasur", last_name: "Azimov" },
  }, successResponse);

  assert.equal(successResponse.statusCode, 200);
  assert.equal(successResponse.body.message, "Profil saqlandi");

  const logged = [];
  const failingController = createUserProfileUpdateController({
    pool: { async query() { throw new Error("database unavailable"); } },
    logger: { error(...args) { logged.push(args); } },
  });
  const errorResponse = createResponse();
  await failingController.updateProfile({
    user: { id: 4 },
    body: { first_name: "Jasur", last_name: "Azimov" },
  }, errorResponse);

  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Profilni yangilash xatosi:", "database unavailable"]]);
});

test("profile update route preserves authentication order", () => {
  const router = createUserProfileUpdateRoutes({ pool: {} });
  const layer = router.stack.find((item) => item.route && item.route.path === "/profile");

  assert.ok(layer);
  assert.equal(layer.route.methods.put, true);
  assert.equal(layer.route.stack.length, 2);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
});

test("profile page connects the editor without the old placeholder alert", () => {
  const profile = fs.readFileSync(
    path.join(__dirname, "..", "public", "profile.html"),
    "utf8"
  );
  const editor = fs.readFileSync(
    path.join(__dirname, "..", "public", "profile-edit.js"),
    "utf8"
  );

  assert.match(profile, /onclick="window\.openProfileEditor\(\)"/);
  assert.match(profile, /src="\/profile-edit\.js"/);
  assert.match(profile, /window\.handleProfileEditSuccess/);
  assert.doesNotMatch(profile, /Profil tahrirlash - tez kunda/);
  assert.match(editor, /authFetch\("\/profile"/);
  assert.match(editor, /method: "PUT"/);
  assert.match(editor, /id="peBio"[^>]+maxlength="500"/);
  assert.match(profile, /id="abBio"/);
});
