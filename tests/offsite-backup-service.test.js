"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  LAST_SUCCESS_FILE,
  LOCK_FILE,
  SUCCESS_FILE,
  createRunId,
  parseRunTimestamp,
  runOffsiteBackup,
  validateOffsiteBackupEnvironment,
} = require("../src/services/offsiteBackupService");

async function withTempDirectory(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ilm-liga-offsite-"));
  try {
    return await callback(root);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^ilm-liga-offsite-/);
    await fs.rm(root, { recursive: true, force: true });
  }
}

function environment(localRoot, overrides = {}) {
  return {
    OFFSITE_BACKUP_LOCAL_DIR: localRoot,
    OFFSITE_BACKUP_REMOTE: "encrypted-backup:ilm-liga/production",
    OFFSITE_BACKUP_RETENTION_DAYS: "14",
    DB_PASSWORD: "must-not-be-an-argument",
    ...overrides,
  };
}

function fakeBackupServices() {
  return {
    createDatabaseBackupFn: async ({ outputPath }) => {
      await fs.writeFile(outputPath, "PGDMP-backup", { mode: 0o600 });
      return outputPath;
    },
    verifyDatabaseBackupFn: async ({ filePath }) => filePath,
    createUploadSnapshotFn: async ({ outputDirectory, now }) => {
      await fs.mkdir(outputDirectory, { recursive: true });
      const manifest = {
        createdAt: now().toISOString(),
        roots: [{ key: "public-uploads", fileCount: 1, totalBytes: 6 }],
        files: [{ root: "public-uploads", path: "avatar.png", size: 6, sha256: "abc" }],
      };
      await fs.writeFile(path.join(outputDirectory, "manifest.json"), JSON.stringify(manifest));
      return { snapshotDirectory: outputDirectory, manifest };
    },
    verifyUploadSnapshotFn: async ({ snapshotDirectory }) =>
      JSON.parse(await fs.readFile(path.join(snapshotDirectory, "manifest.json"), "utf8")),
  };
}

test("off-site configuration requires a scoped crypt remote and safe retention", () => {
  assert.throws(
    () => validateOffsiteBackupEnvironment(environment("relative/path")),
    (error) => error.code === "INVALID_OFFSITE_BACKUP_LOCAL_DIR"
  );
  assert.throws(
    () => validateOffsiteBackupEnvironment(environment(path.parse(process.cwd()).root)),
    (error) => error.code === "INVALID_OFFSITE_BACKUP_LOCAL_DIR"
  );
  assert.throws(
    () => validateOffsiteBackupEnvironment(environment(path.resolve("backups"), { OFFSITE_BACKUP_REMOTE: "remote:" })),
    (error) => error.code === "INVALID_OFFSITE_BACKUP_REMOTE"
  );
  assert.throws(
    () => validateOffsiteBackupEnvironment(environment(path.resolve("backups"), { OFFSITE_BACKUP_RETENTION_DAYS: "7" })),
    (error) => error.code === "INVALID_OFFSITE_BACKUP_RETENTION"
  );
});

test("run IDs round-trip to timestamps and reject unrelated directories", () => {
  const date = new Date("2026-08-04T12:34:56.789Z");
  const runId = createRunId(date);
  assert.equal(parseRunTimestamp(runId), date.getTime());
  assert.equal(parseRunTimestamp("uploads"), null);
  assert.equal(parseRunTimestamp("../../unsafe"), null);
});

test("off-site run verifies crypt remote, uploads twice, and retains only completed old runs", async () => {
  await withTempDirectory(async (root) => {
    const localRoot = path.join(root, "backups");
    const oldRun = createRunId(new Date("2026-07-01T00:00:00.000Z"));
    const partialRun = createRunId(new Date("2026-07-02T00:00:00.000Z"));
    await fs.mkdir(path.join(localRoot, oldRun), { recursive: true });
    await fs.writeFile(path.join(localRoot, oldRun, SUCCESS_FILE), "{}");
    await fs.mkdir(path.join(localRoot, partialRun), { recursive: true });

    const calls = [];
    const commandRunner = async (command, args) => {
      calls.push({ command, args });
      if (args[0] === "listremotes") return { stdout: "encrypted-backup: crypt\n", stderr: "" };
      if (args[0] === "lsf" && args[2] === "--dirs-only") {
        return { stdout: `${oldRun}/\n${partialRun}/\n`, stderr: "" };
      }
      if (args[0] === "lsf" && args.includes("--include") && !args[1].endsWith(partialRun)) {
        return { stdout: `${SUCCESS_FILE}\n`, stderr: "" };
      }
      if (args[0] === "lsf") return { stdout: "", stderr: "" };
      return { stdout: "", stderr: "" };
    };
    const times = [
      new Date("2026-08-04T03:00:00.000Z"),
      new Date("2026-08-04T03:01:00.000Z"),
    ];
    const result = await runOffsiteBackup({
      environment: environment(localRoot),
      projectRoot: root,
      now: () => times.shift(),
      commandRunner,
      ...fakeBackupServices(),
    });

    assert.equal(result.status, "success");
    assert.equal(result.remoteRemoved, 1);
    assert.equal(result.localRemoved, 1);
    assert.equal(calls.filter(({ args }) => args[0] === "check").length, 1);
    assert.equal(calls.filter(({ args }) => args[0] === "copyto").length, 1);
    assert.deepEqual(
      calls.filter(({ args }) => args[0] === "purge").map(({ args }) => args[1]),
      [`encrypted-backup:ilm-liga/production/${oldRun}`]
    );
    assert.equal(calls.flatMap(({ args }) => args).includes("must-not-be-an-argument"), false);
    assert.equal(await fs.stat(path.join(localRoot, partialRun)).then(() => true), true);
    await assert.rejects(fs.stat(path.join(localRoot, oldRun)), (error) => error.code === "ENOENT");
    const status = JSON.parse(await fs.readFile(path.join(localRoot, LAST_SUCCESS_FILE), "utf8"));
    assert.equal(status.runId, result.runId);
    assert.equal(JSON.parse(await fs.readFile(path.join(localRoot, result.runId, SUCCESS_FILE), "utf8")).runId, result.runId);
    await assert.rejects(fs.stat(path.join(localRoot, LOCK_FILE)), (error) => error.code === "ENOENT");
  });
});

test("failed remote verification never runs retention or writes last-success", async () => {
  await withTempDirectory(async (root) => {
    const localRoot = path.join(root, "backups");
    const calls = [];
    const commandRunner = async (_command, args) => {
      calls.push(args);
      if (args[0] === "listremotes") return { stdout: "encrypted-backup: crypt\n", stderr: "" };
      if (args[0] === "check") {
        const error = new Error("remote check failed without credentials");
        error.code = "OFFSITE_BACKUP_TOOL_FAILED";
        throw error;
      }
      return { stdout: "", stderr: "" };
    };

    await assert.rejects(
      runOffsiteBackup({
        environment: environment(localRoot),
        projectRoot: root,
        now: () => new Date("2026-08-04T03:00:00.000Z"),
        commandRunner,
        ...fakeBackupServices(),
      }),
      (error) => error.code === "OFFSITE_BACKUP_TOOL_FAILED"
    );
    assert.equal(calls.some((args) => args[0] === "purge"), false);
    await assert.rejects(fs.stat(path.join(localRoot, LAST_SUCCESS_FILE)), (error) => error.code === "ENOENT");
    await assert.rejects(fs.stat(path.join(localRoot, LOCK_FILE)), (error) => error.code === "ENOENT");
  });
});

test("missing remote success marker removes local marker and skips retention", async () => {
  await withTempDirectory(async (root) => {
    const localRoot = path.join(root, "backups");
    const runId = createRunId(new Date("2026-08-04T03:00:00.000Z"));
    const calls = [];
    const commandRunner = async (_command, args) => {
      calls.push(args);
      if (args[0] === "listremotes") return { stdout: "encrypted-backup: crypt\n", stderr: "" };
      if (args[0] === "lsf") return { stdout: "", stderr: "" };
      return { stdout: "", stderr: "" };
    };

    await assert.rejects(
      runOffsiteBackup({
        environment: environment(localRoot),
        projectRoot: root,
        now: () => new Date("2026-08-04T03:00:00.000Z"),
        commandRunner,
        ...fakeBackupServices(),
      }),
      (error) => error.code === "OFFSITE_BACKUP_REMOTE_VERIFICATION_FAILED"
    );
    assert.equal(calls.some((args) => args[0] === "purge"), false);
    await assert.rejects(
      fs.stat(path.join(localRoot, runId, SUCCESS_FILE)),
      (error) => error.code === "ENOENT"
    );
    await assert.rejects(
      fs.stat(path.join(localRoot, LAST_SUCCESS_FILE)),
      (error) => error.code === "ENOENT"
    );
  });
});

test("existing lock rejects parallel backup before any tool or backup work", async () => {
  await withTempDirectory(async (root) => {
    const localRoot = path.join(root, "backups");
    await fs.mkdir(localRoot, { recursive: true });
    await fs.writeFile(path.join(localRoot, LOCK_FILE), "existing");
    await assert.rejects(
      runOffsiteBackup({
        environment: environment(localRoot),
        commandRunner: async () => assert.fail("rclone must not run"),
        createDatabaseBackupFn: async () => assert.fail("backup must not run"),
      }),
      (error) => error.code === "OFFSITE_BACKUP_ALREADY_RUNNING"
    );
  });
});

test("non-crypt rclone remote is rejected before local backup creation", async () => {
  await withTempDirectory(async (root) => {
    const localRoot = path.join(root, "backups");
    await assert.rejects(
      runOffsiteBackup({
        environment: environment(localRoot),
        commandRunner: async () => ({ stdout: "encrypted-backup: s3\n", stderr: "" }),
        createDatabaseBackupFn: async () => assert.fail("backup must not run"),
      }),
      (error) => error.code === "OFFSITE_BACKUP_REMOTE_NOT_ENCRYPTED"
    );
    await assert.rejects(fs.stat(path.join(localRoot, LOCK_FILE)), (error) => error.code === "ENOENT");
  });
});
