const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createSchoolInviteVerificationService,
} = require("../src/services/schoolInviteVerificationService");
const {
  createSchoolInviteVerificationController,
} = require("../src/controllers/schoolInviteVerificationController");
const schoolInviteVerificationRoutes = require("../src/routes/schoolInviteVerificationRoutes");

const expectedSql = `SELECT id, school_name, region, district, used_by, expires_at
       FROM school_invites WHERE code_hash = $1`;

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

function createController(rows, options = {}) {
  const calls = [];
  const controller = createSchoolInviteVerificationController({
    pool: {
      async query(sql, params) {
        calls.push([sql, params]);
        if (options.error) throw options.error;
        return { rows };
      },
    },
    schoolInvite: {
      hashCode(code) {
        calls.push(["hashCode", code]);
        return "hashed-code";
      },
    },
    logger: options.logger,
  });
  return { calls, controller };
}

test("school invite verification service preserves hash, SQL, and parameters", async () => {
  const calls = [];
  const invite = { id: 4, school_name: "1-maktab" };
  const service = createSchoolInviteVerificationService({
    pool: {
      async query(sql, params) {
        calls.push([sql, params]);
        return { rows: [invite] };
      },
    },
    schoolInvite: {
      hashCode(code) {
        calls.push(["hashCode", code]);
        return "hash-value";
      },
    },
  });

  assert.equal(await service.findInvite("ABCD-1234"), invite);
  assert.deepEqual(calls, [
    ["hashCode", "ABCD-1234"],
    [expectedSql, ["hash-value"]],
  ]);
});

test("school invite verification preserves missing and unknown code responses", async () => {
  const missing = createController([]);
  const missingResponse = createResponse();
  await missing.controller.verify({ body: {} }, missingResponse);
  assert.equal(missingResponse.statusCode, 400);
  assert.deepEqual(missingResponse.body, { error: "Kod kiritilmadi" });
  assert.deepEqual(missing.calls, []);

  const unknown = createController([]);
  const unknownResponse = createResponse();
  await unknown.controller.verify({ body: { code: "BAD" } }, unknownResponse);
  assert.equal(unknownResponse.statusCode, 400);
  assert.deepEqual(unknownResponse.body, { error: "Kod noto'g'ri" });
});

test("school invite verification preserves used and expired responses", async () => {
  const used = createController([{ used_by: 9 }]);
  const usedResponse = createResponse();
  await used.controller.verify({ body: { code: "USED" } }, usedResponse);
  assert.equal(usedResponse.statusCode, 400);
  assert.deepEqual(usedResponse.body, { error: "Bu kod allaqachon ishlatilgan" });

  const expired = createController([{
    used_by: null,
    expires_at: "2000-01-01T00:00:00.000Z",
  }]);
  const expiredResponse = createResponse();
  await expired.controller.verify({ body: { code: "OLD" } }, expiredResponse);
  assert.equal(expiredResponse.statusCode, 400);
  assert.deepEqual(expiredResponse.body, { error: "Kod muddati tugagan" });
});

test("school invite verification preserves successful response mapping", async () => {
  const harness = createController([{
    id: 4,
    school_name: "1-maktab",
    region: "Toshkent",
    district: "Chilonzor",
    used_by: null,
    expires_at: null,
  }]);
  const response = createResponse();

  await harness.controller.verify({ body: { code: "GOOD" } }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    valid: true,
    school_name: "1-maktab",
    region: "Toshkent",
    district: "Chilonzor",
  });
});

test("school invite verification preserves error logging and response", async () => {
  const logs = [];
  const harness = createController([], {
    error: new Error("database failed"),
    logger: { error(...args) { logs.push(args); } },
  });
  const response = createResponse();

  await harness.controller.verify({ body: { code: "CODE" } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["School code tekshirish xatosi:", "database failed"]]);
});

test("school invite verification route preserves path and limiter order", () => {
  function limiter(req, res, next) { next(); }
  const router = schoolInviteVerificationRoutes({
    pool: {},
    schoolInvite: {},
    schoolCodeLookupLimiter: limiter,
  });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/verify-school-code");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, limiter);
});
