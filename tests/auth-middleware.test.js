"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");

const TEST_JWT_SECRET = "auth-middleware-test-signing-key";
process.env.JWT_SECRET = TEST_JWT_SECRET;

let queryImpl = async () => ({ rows: [] });
const pool = {
  query(sql, params) {
    return queryImpl(sql, params);
  },
};

const dbPath = require.resolve("../db");
const previousDbModule = require.cache[dbPath];
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: pool,
  children: [],
  paths: module.paths,
};

const authPath = require.resolve("../auth");
delete require.cache[authPath];
const {
  authMiddleware,
  requireAdmin,
  requireParent,
  requireStudent,
  requireTeacher,
  signAdminToken,
  verifySocketToken,
} = require(authPath);

test.after(() => {
  delete require.cache[authPath];
  if (previousDbModule) require.cache[dbPath] = previousDbModule;
  else delete require.cache[dbPath];
});

function createResponse(resolve) {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      resolve({ nextCalled: false, response: this });
      return this;
    },
  };
}

function invokeMiddleware(middleware, req) {
  return new Promise((resolve, reject) => {
    const response = createResponse(resolve);
    const next = (error) => {
      if (error) reject(error);
      else resolve({ nextCalled: true, response });
    };
    try {
      const result = middleware(req, response, next);
      if (result && typeof result.catch === "function") result.catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

function bearer(payload) {
  return `Bearer ${jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: "5m" })}`;
}

test("auth middleware rejects missing credentials without querying the database", async () => {
  queryImpl = async () => assert.fail("database must not be queried");
  const result = await invokeMiddleware(authMiddleware, { headers: {} });
  assert.equal(result.response.statusCode, 401);
  assert.deepEqual(result.response.body, { error: "Avtorizatsiya tokeni yo'q" });
});

test("auth middleware trusts current database identity and session version", async () => {
  queryImpl = async (sql, params) => {
    assert.match(sql, /SELECT id, phone, is_banned, auth_version FROM users/);
    assert.deepEqual(params, [7]);
    return { rows: [{ id: 7, phone: "+998900000007", is_banned: false, auth_version: 3 }] };
  };
  const req = {
    headers: { authorization: bearer({ id: 7, phone: "stale-phone", ver: 3 }) },
  };
  const result = await invokeMiddleware(authMiddleware, req);
  assert.equal(result.nextCalled, true);
  assert.deepEqual(req.user, { id: 7, phone: "+998900000007", auth_version: 3 });
});

test("auth middleware rejects banned and revoked sessions", async (t) => {
  await t.test("banned account", async () => {
    queryImpl = async () => ({
      rows: [{ id: 8, phone: "+998900000008", is_banned: true, auth_version: 1 }],
    });
    const result = await invokeMiddleware(authMiddleware, {
      headers: { authorization: bearer({ id: 8, ver: 1 }) },
    });
    assert.equal(result.response.statusCode, 401);
    assert.deepEqual(result.response.body, { error: "Hisobingiz bloklangan" });
  });

  await t.test("revoked session version", async () => {
    queryImpl = async () => ({
      rows: [{ id: 9, phone: "+998900000009", is_banned: false, auth_version: 4 }],
    });
    const result = await invokeMiddleware(authMiddleware, {
      headers: { authorization: bearer({ id: 9, ver: 3 }) },
    });
    assert.equal(result.response.statusCode, 401);
    assert.deepEqual(result.response.body, { error: "Sessiya bekor qilingan, qaytadan kiring" });
  });
});

test("role middleware uses the database role and returns 403 for other roles", async () => {
  const cases = [
    [requireTeacher, ["teacher", "school_admin"], "student"],
    [requireStudent, ["student"], "teacher"],
    [requireParent, ["parent"], "student"],
  ];

  for (const [middleware, allowedRoles, deniedRole] of cases) {
    for (const role of allowedRoles) {
      queryImpl = async (sql, params) => {
        assert.match(sql, /SELECT role FROM users/);
        assert.deepEqual(params, [11]);
        return { rows: [{ role }] };
      };
      const req = { user: { id: 11 } };
      const allowed = await invokeMiddleware(middleware, req);
      assert.equal(allowed.nextCalled, true, `${role} should be allowed`);
      assert.equal(req.user.role, role);
    }

    queryImpl = async () => ({ rows: [{ role: deniedRole }] });
    const denied = await invokeMiddleware(middleware, { user: { id: 12 } });
    assert.equal(denied.response.statusCode, 403, `${deniedRole} should be denied`);
  }
});

test("role middleware rejects unauthenticated requests before querying roles", async () => {
  queryImpl = async () => assert.fail("database must not be queried");
  for (const middleware of [requireTeacher, requireStudent, requireParent]) {
    const result = await invokeMiddleware(middleware, {});
    assert.equal(result.response.statusCode, 401);
    assert.deepEqual(result.response.body, { error: "Avtorizatsiya kerak" });
  }
});

test("admin middleware separates user tokens and honors global session revocation", async () => {
  queryImpl = async () => assert.fail("ordinary user token must not query admin settings");
  const userResult = await invokeMiddleware(requireAdmin, {
    headers: { authorization: bearer({ id: 15, ver: 0 }) },
  });
  assert.equal(userResult.response.statusCode, 403);

  queryImpl = async (sql) => {
    assert.match(sql, /admin_auth_version/);
    return { rows: [{ setting_value: "6" }] };
  };
  const validReq = {
    headers: { authorization: `Bearer ${signAdminToken("Root", 6)}` },
  };
  const validResult = await invokeMiddleware(requireAdmin, validReq);
  assert.equal(validResult.nextCalled, true);
  assert.deepEqual(validReq.admin, { name: "Root", role: "super_admin" });

  const revokedResult = await invokeMiddleware(requireAdmin, {
    headers: { authorization: `Bearer ${signAdminToken("Root", 5)}` },
  });
  assert.equal(revokedResult.response.statusCode, 401);
});

test("auth and admin middleware report database failures as server errors", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    queryImpl = async () => {
      throw new Error("database unavailable");
    };

    const authResult = await invokeMiddleware(authMiddleware, {
      headers: { authorization: bearer({ id: 18, ver: 1 }) },
    });
    assert.equal(authResult.response.statusCode, 500);
    assert.deepEqual(authResult.response.body, { error: "Server xatosi" });

    const adminResult = await invokeMiddleware(requireAdmin, {
      headers: { authorization: `Bearer ${signAdminToken("Root", 1)}` },
    });
    assert.equal(adminResult.response.statusCode, 500);
    assert.deepEqual(adminResult.response.body, { error: "Server xatosi" });
  } finally {
    console.error = originalConsoleError;
  }
});

test("socket token verification rejects invalid signatures", () => {
  assert.equal(verifySocketToken("not-a-token"), null);
  assert.equal(verifySocketToken(jwt.sign({ id: 20 }, "different-signing-key")), null);
  assert.deepEqual(
    verifySocketToken(bearer({ id: 20, phone: "+998900000020", ver: 2 })),
    { id: 20, phone: "+998900000020", ver: 2 }
  );
});
