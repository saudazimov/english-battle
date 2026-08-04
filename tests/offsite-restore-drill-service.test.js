"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  RESTORE_LOCK_FILE,
  RESTORE_WORK_DIRECTORY,
  runOffsiteRestoreDrill,
  validateRunId,
} = require("../src/services/offsiteRestoreDrillService");

const RUN_ID = "2026-08-04T03-00-00-000Z";

async function withTempDirectory(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "offsite-restore-test-"));
  try {
    return await callback(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function environment(localRoot, overrides = {}) {
  return {
    OFFSITE_BACKUP_LOCAL_DIR: localRoot,
    OFFSITE_BACKUP_REMOTE: "encrypted-backup:ilm-liga/production",
    OFFSITE_BACKUP_RETENTION_DAYS: "14",
    DB_NAME: "english_battle",
    ...overrides,
  };
}

async function writeBundle(directory, overrides = {}) {
  await fs.mkdir(path.join(directory, "uploads"), { recursive: true });
  await fs.writeFile(path.join(directory, "database.dump"), "PGDMP-test");
  await fs.writeFile(path.join(directory, "uploads", "manifest.json"), "{}\n");
  await fs.writeFile(path.join(directory, "offsite-manifest.json"), `${JSON.stringify({
    formatVersion: 1,
    runId: RUN_ID,
    createdAt: "2026-08-04T03:00:00.000Z",
    database: "database.dump",
    uploads: "uploads/manifest.json",
    uploadFileCount: 2,
    ...overrides,
  })}\n`);
  await fs.writeFile(path.join(directory, "SUCCESS.json"), `${JSON.stringify({
    formatVersion: 1,
    runId: RUN_ID,
    completedAt: "2026-08-04T03:05:00.000Z",
  })}\n`);
}

function fakeRclone({ onCopy = writeBundle, encrypted = true, completed = true } = {}) {
  const calls = [];
  return {
    calls,
    async run(_command, args) {
      calls.push(args);
      if (args[0] === "listremotes") {
        return { stdout: `encrypted-backup: ${encrypted ? "crypt" : "s3"}\n`, stderr: "" };
      }
      if (args[0] === "lsf") {
        return { stdout: completed ? "SUCCESS.json\n" : "", stderr: "" };
      }
      if (args[0] === "copy") await onCopy(args[2]);
      return { stdout: "", stderr: "" };
    },
  };
}

function fakeRestoreServices(calls) {
  return {
    verifyDatabaseBackupFn: async ({ filePath }) => calls.push(["verify-db", filePath]),
    verifyUploadSnapshotFn: async ({ snapshotDirectory }) => {
      calls.push(["verify-uploads", snapshotDirectory]);
      return { files: [{ path: "one" }, { path: "two" }] };
    },
    runRestoreDrillFn: async (options) => {
      calls.push(["restore-db", options]);
      return options.targetDatabase;
    },
    runUploadRestoreDrillFn: async (options) => {
      calls.push(["restore-uploads", options]);
      return { targetDirectory: path.resolve(options.targetDirectory) };
    },
  };
}

test("off-site restore drill downloads, verifies and restores one completed run", async () => {
  await withTempDirectory(async (root) => {
    const localRoot = path.join(root, "backups");
    const uploadTarget = path.join(root, "uploads-restore-test");
    const rclone = fakeRclone();
    const serviceCalls = [];
    const times = [new Date("2026-08-04T04:00:00.000Z"), new Date("2026-08-04T04:02:00.000Z")];
    const result = await runOffsiteRestoreDrill({
      runId: RUN_ID,
      targetDatabase: "english_battle_restore_test",
      databaseConfirmation: "english_battle_restore_test",
      uploadTargetDirectory: uploadTarget,
      uploadConfirmation: uploadTarget,
      environment: environment(localRoot),
      projectRoot: path.join(root, "project"),
      now: () => times.shift(),
      commandRunner: rclone.run,
      ...fakeRestoreServices(serviceCalls),
    });

    assert.equal(result.status, "success");
    assert.equal(result.runId, RUN_ID);
    assert.equal(result.durationMs, 120000);
    assert.equal(result.uploadFileCount, 2);
    assert.deepEqual(serviceCalls.map(([name]) => name), [
      "verify-db", "verify-uploads", "restore-db", "restore-uploads",
    ]);
    assert.equal(rclone.calls.some((args) => args[0] === "check"), true);
    assert.deepEqual(await fs.readdir(path.join(localRoot, RESTORE_WORK_DIRECTORY)), []);
    await assert.rejects(fs.stat(path.join(localRoot, RESTORE_LOCK_FILE)), (error) => error.code === "ENOENT");
  });
});

test("restore drill rejects invalid run IDs before invoking rclone", async () => {
  assert.throws(() => validateRunId("latest"), (error) => error.code === "INVALID_OFFSITE_RESTORE_RUN_ID");
  await assert.rejects(
    runOffsiteRestoreDrill({
      runId: "../production",
      environment: environment(path.resolve("restore-test-backups")),
      commandRunner: async () => assert.fail("rclone must not run"),
    }),
    (error) => error.code === "INVALID_OFFSITE_RESTORE_RUN_ID"
  );
});

test("restore drill rejects non-crypt remotes before downloading", async () => {
  await withTempDirectory(async (root) => {
    const rclone = fakeRclone({ encrypted: false });
    await assert.rejects(
      runOffsiteRestoreDrill({
        runId: RUN_ID,
        environment: environment(path.join(root, "backups")),
        commandRunner: rclone.run,
      }),
      (error) => error.code === "OFFSITE_BACKUP_REMOTE_NOT_ENCRYPTED"
    );
    assert.equal(rclone.calls.some((args) => args[0] === "copy"), false);
  });
});

test("restore drill refuses incomplete remote runs", async () => {
  await withTempDirectory(async (root) => {
    const rclone = fakeRclone({ completed: false });
    await assert.rejects(
      runOffsiteRestoreDrill({
        runId: RUN_ID,
        environment: environment(path.join(root, "backups")),
        commandRunner: rclone.run,
      }),
      (error) => error.code === "OFFSITE_RESTORE_INCOMPLETE_RUN"
    );
    assert.equal(rclone.calls.some((args) => args[0] === "copy"), false);
  });
});

test("invalid bundle metadata prevents restores and staging is cleaned", async () => {
  await withTempDirectory(async (root) => {
    const localRoot = path.join(root, "backups");
    const rclone = fakeRclone({ onCopy: (directory) => writeBundle(directory, { runId: "wrong" }) });
    const serviceCalls = [];
    await assert.rejects(
      runOffsiteRestoreDrill({
        runId: RUN_ID,
        environment: environment(localRoot),
        commandRunner: rclone.run,
        ...fakeRestoreServices(serviceCalls),
      }),
      (error) => error.code === "INVALID_OFFSITE_RESTORE_BUNDLE"
    );
    assert.deepEqual(serviceCalls, []);
    assert.deepEqual(await fs.readdir(path.join(localRoot, RESTORE_WORK_DIRECTORY)), []);
  });
});

test("unexpected bundle files are rejected before verification or restore", async () => {
  await withTempDirectory(async (root) => {
    const localRoot = path.join(root, "backups");
    const rclone = fakeRclone({
      async onCopy(directory) {
        await writeBundle(directory);
        await fs.writeFile(path.join(directory, "unexpected.txt"), "not part of a verified bundle");
      },
    });
    const serviceCalls = [];
    await assert.rejects(
      runOffsiteRestoreDrill({
        runId: RUN_ID,
        environment: environment(localRoot),
        commandRunner: rclone.run,
        ...fakeRestoreServices(serviceCalls),
      }),
      (error) => error.code === "INVALID_OFFSITE_RESTORE_BUNDLE"
    );
    assert.deepEqual(serviceCalls, []);
    assert.deepEqual(await fs.readdir(path.join(localRoot, RESTORE_WORK_DIRECTORY)), []);
  });
});
