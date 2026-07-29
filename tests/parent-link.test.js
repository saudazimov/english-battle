const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireParent } = require("../auth");
const { createParentLinkService } = require("../src/services/parentLinkService");
const { createParentLinkController } = require("../src/controllers/parentLinkController");
const parentLinkRoutes = require("../src/routes/parentLinkRoutes");

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

function createClient(responses, calls) {
  return {
    async query(sql, params) {
      calls.push([sql, params]);
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response || { rows: [] };
    },
    release() {
      calls.push(["release"]);
    },
  };
}

test("parent link preserves SQL order, transaction, code clearing, and response", async () => {
  const poolCalls = [];
  const clientCalls = [];
  const child = {
    id: 20,
    first_name: "Ali",
    last_name: "Valiyev",
    cefr_level: "A2",
    rating: 1300,
    role: "student",
  };
  const poolResponses = [
    { rows: [child] },
    { rows: [{ c: 1 }] },
    { rows: [{ c: 2 }] },
    { rows: [] },
    { rows: [] },
  ];
  const client = createClient([
    { rows: [] },
    { rows: [] },
    { rows: [] },
  ], clientCalls);
  const service = createParentLinkService({
    pool: {
      async query(sql, params) {
        poolCalls.push([sql.replace(/\s+/g, " ").trim(), params]);
        return poolResponses.shift();
      },
      async connect() {
        poolCalls.push(["connect"]);
        return client;
      },
    },
    parentCode: {
      hashCode(code) {
        assert.equal(code, "ABC12345");
        return "hashed-code";
      },
    },
  });

  assert.deepEqual(await service.linkParent(10, "ABC12345", "father"), {
    status: "linked",
    child,
  });
  assert.deepEqual(poolCalls.map((call) => call[1]), [
    ["hashed-code"],
    [20],
    [10],
    [10, 20],
    undefined,
    [20],
  ]);
  assert.equal(clientCalls[0][0], "BEGIN");
  assert.equal(clientCalls[1][0], "INSERT INTO parent_links (parent_id, student_id, relationship, status, linked_at) VALUES ($1,$2,$3,'active',NOW())");
  assert.deepEqual(clientCalls[1][1], [10, 20, "father"]);
  assert.equal(clientCalls[2][0], "COMMIT");
  assert.equal(clientCalls[3][0], "release");
  assert.equal(poolCalls[5][0], "UPDATE users SET parent_connect_code_hash = NULL, parent_connect_code_expires_at = NULL WHERE id = $1");
});

test("parent link preserves revoked update and active idempotency", async () => {
  for (const existing of [{ id: 4, status: "revoked" }, { id: 4, status: "active" }]) {
    const clientCalls = [];
    const responses = [
      { rows: [{ id: 20, role: "student" }] },
      { rows: [{ c: 0 }] },
      { rows: [{ c: 0 }] },
      { rows: [existing] },
      { rows: [] },
    ];
    const service = createParentLinkService({
      pool: {
        async query() { return responses.shift(); },
        async connect() {
          return createClient([{ rows: [] }, { rows: [] }, { rows: [] }], clientCalls);
        },
      },
      parentCode: { hashCode() { return "hash"; } },
    });

    assert.equal((await service.linkParent(10, "ABC123", "guardian")).status, "linked");
    const mutations = clientCalls.filter((call) => (
      typeof call[0] === "string" && (call[0].startsWith("INSERT") || call[0].startsWith("UPDATE"))
    ));
    if (existing.status === "revoked") {
      assert.equal(mutations.length, 1);
      assert.deepEqual(mutations[0][1], [4, 10, "guardian"]);
    } else {
      assert.equal(mutations.length, 0);
    }
  }
});

test("parent link preserves invalid, self, and capacity short circuits", async () => {
  const fixtures = [
    [[{ rows: [] }], { status: "invalid-code" }, 1],
    [[{ rows: [{ id: 10, role: "student" }] }], { status: "self-link" }, 1],
    [[{ rows: [{ id: 20, role: "student" }] }, { rows: [{ c: 5 }] }], { status: "parent-limit" }, 2],
    [[{ rows: [{ id: 20, role: "student" }] }, { rows: [{ c: 0 }] }, { rows: [{ c: 10 }] }], { status: "child-limit" }, 3],
  ];
  for (const [responses, expected, expectedCalls] of fixtures) {
    let calls = 0;
    const service = createParentLinkService({
      pool: {
        async query() {
          calls++;
          return responses.shift();
        },
        connect: assert.fail,
      },
      parentCode: { hashCode() { return "hash"; } },
    });
    assert.deepEqual(await service.linkParent(10, "ABC123", "guardian"), expected);
    assert.equal(calls, expectedCalls);
  }
});

test("parent link preserves rollback, release, and transaction error propagation", async () => {
  const clientCalls = [];
  const responses = [
    { rows: [{ id: 20, role: "student" }] },
    { rows: [{ c: 0 }] },
    { rows: [{ c: 0 }] },
    { rows: [] },
  ];
  const service = createParentLinkService({
    pool: {
      async query() { return responses.shift(); },
      async connect() {
        return createClient([
          { rows: [] },
          new Error("insert failed"),
          { rows: [] },
        ], clientCalls);
      },
    },
    parentCode: { hashCode() { return "hash"; } },
  });

  await assert.rejects(service.linkParent(10, "ABC123", "guardian"), {
    message: "insert failed",
  });
  assert.deepEqual(clientCalls.slice(-2), [["ROLLBACK", undefined], ["release"]]);
});

test("parent link controller preserves rate, validation, attempts, and success mapping", async () => {
  const blockedController = createParentLinkController({
    pool: {},
    parentCode: {},
    parentLinkBlocked: () => true,
    parentLinkNoteFail: assert.fail,
    parentLinkNoteOk: assert.fail,
  });
  const blockedResponse = createResponse();
  await blockedController.link({ user: { id: 10 } }, blockedResponse);
  assert.equal(blockedResponse.statusCode, 429);

  const attempts = [];
  const validationController = createParentLinkController({
    pool: {},
    parentCode: {},
    parentLinkBlocked: () => false,
    parentLinkNoteFail: (req) => attempts.push(["fail", req]),
    parentLinkNoteOk: assert.fail,
  });
  const validationRequest = {
    user: { id: 10 },
    body: { code: "ab-1", relationship: "invalid" },
  };
  const validationResponse = createResponse();
  await validationController.link(validationRequest, validationResponse);
  assert.equal(validationResponse.statusCode, 400);
  assert.deepEqual(validationResponse.body, { error: "Kod noto'g'ri" });
  assert.deepEqual(attempts, [["fail", validationRequest]]);

  const poolResponses = [
    { rows: [{ id: 20, first_name: null, last_name: null, role: "student" }] },
    { rows: [{ c: 0 }] },
    { rows: [{ c: 0 }] },
    { rows: [{ id: 3, status: "active" }] },
    { rows: [] },
  ];
  const successes = [];
  const successRequest = {
    user: { id: 10 },
    body: { code: "ab-c1_23", relationship: "invalid" },
  };
  const successController = createParentLinkController({
    pool: {
      async query() { return poolResponses.shift(); },
      async connect() {
        return createClient([{ rows: [] }, { rows: [] }], []);
      },
    },
    parentCode: {
      hashCode(code) {
        assert.equal(code, "ABC123");
        return "hash";
      },
    },
    parentLinkBlocked: () => false,
    parentLinkNoteFail: assert.fail,
    parentLinkNoteOk: (req) => successes.push(req),
  });
  const successResponse = createResponse();
  await successController.link(successRequest, successResponse);
  assert.deepEqual(successResponse.body, {
    success: true,
    child: { id: 20, name: "Farzand", cefr_level: "A1", rating: 0 },
  });
  assert.deepEqual(successes, [successRequest]);
});

test("parent link controller preserves database error logging and response", async () => {
  const controller = createParentLinkController({
    pool: { async query() { throw new Error("database unavailable"); } },
    parentCode: { hashCode() { return "hash"; } },
    parentLinkBlocked: () => false,
    parentLinkNoteFail: assert.fail,
    parentLinkNoteOk: assert.fail,
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller.link({
      user: { id: 10 },
      body: { code: "ABC123", relationship: "mother" },
    }, response);
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Parent link xatosi:", "database unavailable"]]);
});

test("parent link route preserves path and middleware order", () => {
  const router = parentLinkRoutes({
    pool: {},
    parentCode: {},
    parentLinkBlocked: assert.fail,
    parentLinkNoteFail: assert.fail,
    parentLinkNoteOk: assert.fail,
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/parent/link");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireParent);
  assert.equal(layer.route.stack.length, 3);
});
