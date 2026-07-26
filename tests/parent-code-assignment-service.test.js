const test = require("node:test");
const assert = require("node:assert/strict");

const { createParentCodeAssignmentService } = require("../src/services/parentCodeAssignmentService");

const UPDATE_SQL = `UPDATE users
           SET parent_connect_code_hash = $1,
               parent_connect_code = NULL,
               parent_connect_code_created_at = NOW(),
               parent_connect_code_expires_at = NOW() + INTERVAL '48 hours'
           WHERE id = $2
           RETURNING parent_connect_code_created_at, parent_connect_code_expires_at`;

function createParentCode(rawCodes) {
  const generateCalls = [];
  const hashCalls = [];
  return {
    PARENT_CODE_TTL_HOURS: 48,
    generateCalls,
    hashCalls,
    generateRawCode() {
      const rawCode = rawCodes[generateCalls.length];
      generateCalls.push(rawCode);
      return rawCode;
    },
    hashCode(rawCode) {
      hashCalls.push(rawCode);
      return "hash:" + rawCode;
    },
  };
}

test("parent-code assignment preserves SQL, hash storage and raw response", async () => {
  const calls = [];
  const createdAt = new Date("2026-07-26T10:00:00Z");
  const expiresAt = new Date("2026-07-28T10:00:00Z");
  const parentCode = createParentCode(["ABCDEFGH"]);
  const service = createParentCodeAssignmentService({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return {
          rows: [{
            parent_connect_code_created_at: createdAt,
            parent_connect_code_expires_at: expiresAt,
          }],
        };
      },
    },
    parentCode,
  });

  const result = await service(44);

  assert.deepEqual(calls, [{ sql: UPDATE_SQL, params: ["hash:ABCDEFGH", 44] }]);
  assert.deepEqual(parentCode.generateCalls, ["ABCDEFGH"]);
  assert.deepEqual(parentCode.hashCalls, ["ABCDEFGH"]);
  assert.deepEqual(result, {
    rawCode: "ABCDEFGH",
    created_at: createdAt,
    expires_at: expiresAt,
  });
});

test("parent-code assignment preserves collision retry", async () => {
  const parentCode = createParentCode(["CODEAAA2", "CODEBBB3"]);
  let queryCalls = 0;
  const service = createParentCodeAssignmentService({
    pool: {
      async query() {
        queryCalls += 1;
        if (queryCalls === 1) {
          const collision = new Error("duplicate");
          collision.code = "23505";
          throw collision;
        }
        return {
          rows: [{
            parent_connect_code_created_at: "created",
            parent_connect_code_expires_at: "expires",
          }],
        };
      },
    },
    parentCode,
  });

  const result = await service(7);

  assert.equal(queryCalls, 2);
  assert.deepEqual(parentCode.hashCalls, ["CODEAAA2", "CODEBBB3"]);
  assert.equal(result.rawCode, "CODEBBB3");
});

test("parent-code assignment preserves six-collision limit", async () => {
  const parentCode = createParentCode([
    "CODEAA22", "CODEBB33", "CODECC44", "CODEDD55", "CODEEE66", "CODEFF77",
  ]);
  let queryCalls = 0;
  const service = createParentCodeAssignmentService({
    pool: {
      async query() {
        queryCalls += 1;
        const collision = new Error("duplicate");
        collision.code = "23505";
        throw collision;
      },
    },
    parentCode,
  });

  await assert.rejects(() => service(8), {
    message: "Kod yaratib bo'lmadi (collision)",
  });
  assert.equal(queryCalls, 6);
  assert.equal(parentCode.generateCalls.length, 6);
});

test("parent-code assignment preserves non-collision error propagation", async () => {
  const databaseError = new Error("database unavailable");
  const parentCode = createParentCode(["ABCDEFGH"]);
  const service = createParentCodeAssignmentService({
    pool: { async query() { throw databaseError; } },
    parentCode,
  });

  await assert.rejects(() => service(9), (error) => error === databaseError);
  assert.equal(parentCode.generateCalls.length, 1);
});
