"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  assertSafeRestoreTarget,
  createDatabaseBackup,
  runRestoreDrill,
  validateDatabaseEnvironment,
  verifyDatabaseBackup,
} = require("../src/services/databaseBackupService");

const environment = {
  DB_HOST: "localhost",
  DB_PORT: "5432",
  DB_USER: "eb_user",
  DB_PASSWORD: "not-logged-secret",
  DB_NAME: "english_battle",
  DB_SSL: "false",
};

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ilm-liga-backup-"));
  try {
    return await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("database backup configuration errors expose names but not secrets", () => {
  assert.throws(
    () => validateDatabaseEnvironment({ DB_PASSWORD: "sensitive-value" }),
    (error) => {
      assert.equal(error.code, "INVALID_DATABASE_BACKUP_ENVIRONMENT");
      assert.doesNotMatch(error.message, /sensitive-value/);
      assert.match(error.message, /DB_HOST/);
      return true;
    }
  );
});

test("backup uses argument arrays, verifies archive and never exposes password", async () => {
  await withTempDirectory(async (directory) => {
    const outputPath = path.join(directory, "daily.dump");
    const calls = [];
    const commandRunner = async (command, args, options) => {
      calls.push({ command, args, options });
      if (command === "pg_dump") {
        const fileIndex = args.indexOf("--file");
        await fs.writeFile(args[fileIndex + 1], Buffer.from("PGDMP-valid-archive"));
      }
      return { stdout: "", stderr: "" };
    };

    const result = await createDatabaseBackup({
      outputPath,
      environment,
      commandRunner,
    });

    assert.equal(result, outputPath);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].command, "pg_dump");
    assert.equal(calls[1].command, "pg_restore");
    assert.equal(calls[1].args[0], "--list");
    assert.equal(calls.flatMap((call) => call.args).includes(environment.DB_PASSWORD), false);
    assert.equal(calls[0].options.env.PGPASSWORD, environment.DB_PASSWORD);
    assert.equal(calls[0].options.env.PGSSLMODE, "disable");
    assert.equal((await fs.readFile(outputPath, "utf8")).startsWith("PGDMP"), true);
    assert.deepEqual(
      (await fs.readdir(directory)).filter((file) => file.includes(".partial-")),
      []
    );
  });
});

test("existing backup is never overwritten", async () => {
  await withTempDirectory(async (directory) => {
    const outputPath = path.join(directory, "daily.dump");
    await fs.writeFile(outputPath, "existing");

    await assert.rejects(
      createDatabaseBackup({
        outputPath,
        environment,
        commandRunner: async () => assert.fail("pg_dump must not run"),
      }),
      (error) => error.code === "DATABASE_BACKUP_ALREADY_EXISTS"
    );
    assert.equal(await fs.readFile(outputPath, "utf8"), "existing");
  });
});

test("failed pg_dump removes partial output and redacts database password", async () => {
  await withTempDirectory(async (directory) => {
    const outputPath = path.join(directory, "failed.dump");
    const commandRunner = async (command, args) => {
      const fileIndex = args.indexOf("--file");
      await fs.writeFile(args[fileIndex + 1], "partial");
      const error = new Error("pg_dump failed");
      error.stderr = `connection failed with ${environment.DB_PASSWORD}`;
      throw error;
    };

    await assert.rejects(
      createDatabaseBackup({ outputPath, environment, commandRunner }),
      (error) => {
        assert.equal(error.code, "DATABASE_TOOL_FAILED");
        assert.doesNotMatch(error.message, new RegExp(environment.DB_PASSWORD));
        assert.match(error.message, /\[REDACTED\]/);
        return true;
      }
    );
    assert.deepEqual(await fs.readdir(directory), []);
  });
});

test("invalid or truncated archive is rejected before pg_restore", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "invalid.dump");
    await fs.writeFile(filePath, "invalid");

    await assert.rejects(
      verifyDatabaseBackup({
        filePath,
        environment,
        commandRunner: async () => assert.fail("pg_restore must not run"),
      }),
      (error) => error.code === "INVALID_DATABASE_BACKUP"
    );
  });
});

test("restore target requires a safe suffix and exact confirmation", () => {
  assert.throws(
    () => assertSafeRestoreTarget({
      targetDatabase: "english_battle",
      confirmation: "english_battle",
      productionDatabase: "english_battle",
    }),
    (error) => error.code === "UNSAFE_RESTORE_TARGET"
  );
  assert.throws(
    () => assertSafeRestoreTarget({
      targetDatabase: "english_battle_restore_test",
      confirmation: "wrong",
      productionDatabase: "english_battle",
    }),
    (error) => error.code === "RESTORE_TARGET_NOT_CONFIRMED"
  );
});

test("restore drill verifies archive and uses only safe pg_restore options", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "daily.dump");
    await fs.writeFile(filePath, "PGDMP-valid-archive");
    const calls = [];
    const commandRunner = async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: command === "psql" ? "1\n" : "", stderr: "" };
    };

    const target = await runRestoreDrill({
      filePath,
      targetDatabase: "english_battle_restore_test",
      confirmation: "english_battle_restore_test",
      environment,
      commandRunner,
    });

    assert.equal(target, "english_battle_restore_test");
    assert.deepEqual(calls.map(({ command }) => command), ["pg_restore", "pg_restore", "psql"]);
    const restoreArgs = calls[1].args;
    assert.equal(restoreArgs.includes("--clean"), false);
    assert.equal(restoreArgs.includes("--single-transaction"), true);
    assert.equal(restoreArgs.includes("--exit-on-error"), true);
    assert.equal(restoreArgs.includes("english_battle_restore_test"), true);
    assert.equal(calls[2].args.includes("SELECT COUNT(*) FROM schema_migrations;"), true);
    assert.equal(calls.flatMap((call) => call.args).includes(environment.DB_PASSWORD), false);
  });
});

test("restore drill fails when the restored migration table is empty", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "daily.dump");
    await fs.writeFile(filePath, "PGDMP-valid-archive");

    await assert.rejects(
      runRestoreDrill({
        filePath,
        targetDatabase: "english_battle_restore_test",
        confirmation: "english_battle_restore_test",
        environment,
        commandRunner: async (command) => ({
          stdout: command === "psql" ? "0\n" : "",
          stderr: "",
        }),
      }),
      (error) => error.code === "RESTORE_DRILL_VERIFICATION_FAILED"
    );
  });
});
