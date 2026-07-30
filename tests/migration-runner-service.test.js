const assert = require("node:assert/strict");
const test = require("node:test");

const {
  checksumOf,
  runMigrations,
  showMigrationStatus,
  verifyAppliedChecksum,
} = require("../src/services/migrationRunnerService");

function createLogger() {
  const entries = { log: [], warn: [], error: [] };
  return {
    entries,
    log: (...args) => entries.log.push(args),
    warn: (...args) => entries.warn.push(args),
    error: (...args) => entries.error.push(args),
  };
}

function createFileSystem(files) {
  return {
    existsSync: () => true,
    readdirSync: () => Object.keys(files),
    readFileSync: (filePath) => files[filePath.split(/[\\/]/).pop()],
  };
}

function createPool(queryHandler) {
  const queries = [];
  const state = { released: false, ended: false };
  const client = {
    query: async (text, params) => {
      queries.push({ text, params });
      return queryHandler(text, params);
    },
    release: () => {
      state.released = true;
    },
  };
  const pool = {
    connect: async () => client,
    end: async () => {
      state.ended = true;
    },
  };

  return { pool, queries, state };
}

function successfulQueryHandler(appliedRows = []) {
  return async (text) => {
    if (text.includes("pg_try_advisory_lock")) {
      return { rows: [{ acquired: true }] };
    }
    if (text.includes("pg_advisory_unlock")) {
      return { rows: [{ released: true }] };
    }
    if (text.includes("SELECT version, checksum")) {
      return { rows: appliedRows };
    }
    return { rows: [] };
  };
}

test("production rejects an applied migration checksum mismatch", async () => {
  const sql = "SELECT 1;";
  const logger = createLogger();
  const { pool, queries, state } = createPool(
    successfulQueryHandler([{ version: "001_test.sql", checksum: "old" }])
  );

  await assert.rejects(
    runMigrations({
      pool,
      migrationsDir: "migrations",
      nodeEnv: "production",
      logger,
      fsImpl: createFileSystem({ "001_test.sql": sql }),
    }),
    (error) => error.code === "MIGRATION_CHECKSUM_MISMATCH"
  );

  assert.equal(queries.some(({ text }) => text === "BEGIN"), false);
  assert.equal(queries.some(({ text }) => text.includes("pg_advisory_unlock")), true);
  assert.equal(state.released, true);
  assert.equal(state.ended, true);
});

test("production treats a legacy null checksum as a mismatch", async () => {
  const logger = createLogger();
  const { pool, queries, state } = createPool(
    successfulQueryHandler([{ version: "001_test.sql", checksum: null }])
  );

  await assert.rejects(
    runMigrations({
      pool,
      migrationsDir: "migrations",
      nodeEnv: "production",
      logger,
      fsImpl: createFileSystem({ "001_test.sql": "SELECT 1;" }),
    }),
    (error) => error.code === "MIGRATION_CHECKSUM_MISMATCH"
  );

  assert.equal(queries.some(({ text }) => text === "BEGIN"), false);
  assert.equal(state.released, true);
  assert.equal(state.ended, true);
});

test("development preserves checksum mismatch warning behavior", () => {
  const logger = createLogger();

  verifyAppliedChecksum({
    file: "001_test.sql",
    appliedChecksum: "old",
    currentChecksum: "new",
    nodeEnv: "development",
    logger,
  });

  assert.equal(logger.entries.warn.length, 2);
});

test("a concurrent migration runner is rejected without applying SQL", async () => {
  const logger = createLogger();
  const { pool, queries, state } = createPool(async (text) => {
    if (text.includes("pg_try_advisory_lock")) {
      return { rows: [{ acquired: false }] };
    }
    return { rows: [] };
  });

  await assert.rejects(
    runMigrations({
      pool,
      migrationsDir: "migrations",
      nodeEnv: "production",
      logger,
      fsImpl: createFileSystem({ "001_test.sql": "SELECT 1;" }),
    }),
    (error) => error.code === "MIGRATION_LOCK_UNAVAILABLE"
  );

  assert.equal(queries.length, 1);
  assert.equal(queries[0].params.length, 1);
  assert.equal(state.released, true);
  assert.equal(state.ended, true);
});

test("a pending migration is transactional and releases the lock", async () => {
  const sql = "CREATE TABLE test_table (id INTEGER);";
  const logger = createLogger();
  const { pool, queries, state } = createPool(successfulQueryHandler());

  const count = await runMigrations({
    pool,
    migrationsDir: "migrations",
    nodeEnv: "production",
    logger,
    fsImpl: createFileSystem({ "001_test.sql": sql }),
  });

  assert.equal(count, 1);
  assert.equal(queries.some(({ text }) => text === "BEGIN"), true);
  assert.equal(queries.some(({ text }) => text === sql), true);
  assert.deepEqual(
    queries.find(({ text }) => text.startsWith("INSERT INTO"))?.params,
    ["001_test.sql", checksumOf(sql)]
  );
  assert.equal(queries.some(({ text }) => text === "COMMIT"), true);
  assert.equal(queries.some(({ text }) => text.includes("pg_advisory_unlock")), true);
  assert.equal(state.released, true);
  assert.equal(state.ended, true);
});

test("migration failure rolls back and still releases resources", async () => {
  const sql = "BROKEN SQL";
  const logger = createLogger();
  const handler = successfulQueryHandler();
  const { pool, queries, state } = createPool(async (text, params) => {
    if (text === sql) throw new Error("syntax error");
    return handler(text, params);
  });

  await assert.rejects(
    runMigrations({
      pool,
      migrationsDir: "migrations",
      nodeEnv: "production",
      logger,
      fsImpl: createFileSystem({ "001_test.sql": sql }),
    }),
    /syntax error/
  );

  assert.equal(queries.some(({ text }) => text === "ROLLBACK"), true);
  assert.equal(queries.some(({ text }) => text.includes("pg_advisory_unlock")), true);
  assert.equal(state.released, true);
  assert.equal(state.ended, true);
});

test("status does not acquire a lock or execute migration SQL", async () => {
  const logger = createLogger();
  const { pool, queries, state } = createPool(
    successfulQueryHandler([{ version: "001_test.sql", checksum: "sum" }])
  );

  await showMigrationStatus({
    pool,
    migrationsDir: "migrations",
    logger,
    fsImpl: createFileSystem({ "001_test.sql": "SELECT 1;" }),
  });

  assert.equal(queries.some(({ text }) => text.includes("advisory")), false);
  assert.equal(queries.some(({ text }) => text === "SELECT 1;"), false);
  assert.equal(state.released, true);
  assert.equal(state.ended, true);
});
