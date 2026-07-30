"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  MANIFEST_FILE,
  assertSafeRelativePath,
  createUploadSnapshot,
  runUploadRestoreDrill,
  verifyUploadSnapshot,
} = require("../src/services/uploadBackupService");
const { assertOnlyCliOptions, parseCliOptions } = require("../src/utils/cliOptions");

async function withProject(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ilm-liga-uploads-"));
  try {
    await fs.mkdir(path.join(root, "public/uploads/avatars"), { recursive: true });
    await fs.mkdir(path.join(root, "uploads/resources"), { recursive: true });
    await fs.writeFile(path.join(root, "public/uploads/avatars/user.png"), "avatar-content");
    await fs.writeFile(path.join(root, "uploads/resources/book.pdf"), "resource-content");
    return await callback(root);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^ilm-liga-uploads-/);
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("shared CLI parser accepts split and equals options", () => {
  assert.deepEqual(parseCliOptions(["--output", "a", "--target=b"]), {
    output: "a",
    target: "b",
  });
  assert.throws(
    () => assertOnlyCliOptions({ ouptut: "a" }, ["output"]),
    /Noma'lum argument: --ouptut/
  );
});

test("snapshot copies both upload roots and verifies checksums", async () => {
  await withProject(async (root) => {
    const output = path.join(root, "backups/upload-snapshot");
    const result = await createUploadSnapshot({
      projectRoot: root,
      outputDirectory: output,
      now: () => new Date("2026-07-30T12:00:00.000Z"),
    });

    assert.equal(result.manifest.files.length, 2);
    assert.equal(result.manifest.createdAt, "2026-07-30T12:00:00.000Z");
    const verified = await verifyUploadSnapshot({ snapshotDirectory: output });
    assert.equal(verified.files.length, 2);
    assert.equal(
      await fs.readFile(path.join(output, "data/public-uploads/avatars/user.png"), "utf8"),
      "avatar-content"
    );
  });
});

test("snapshot never overwrites an existing output directory", async () => {
  await withProject(async (root) => {
    const output = path.join(root, "backups/upload-snapshot");
    await fs.mkdir(output, { recursive: true });
    await assert.rejects(
      createUploadSnapshot({ projectRoot: root, outputDirectory: output }),
      (error) => error.code === "UPLOAD_BACKUP_ALREADY_EXISTS"
    );
  });
});

test("tampered snapshot content fails checksum verification", async () => {
  await withProject(async (root) => {
    const output = path.join(root, "backups/upload-snapshot");
    await createUploadSnapshot({ projectRoot: root, outputDirectory: output });
    await fs.writeFile(path.join(output, "data/private-resources/book.pdf"), "tampered-content");
    await assert.rejects(
      verifyUploadSnapshot({ snapshotDirectory: output }),
      (error) => error.code === "UPLOAD_BACKUP_INTEGRITY_FAILED"
    );
  });
});

test("manifest path traversal is rejected", async () => {
  await withProject(async (root) => {
    assert.throws(
      () => assertSafeRelativePath("../outside.txt"),
      (error) => error.code === "UNSAFE_UPLOAD_BACKUP_PATH"
    );
    const output = path.join(root, "backups/upload-snapshot");
    await createUploadSnapshot({ projectRoot: root, outputDirectory: output });
    const manifestPath = path.join(output, MANIFEST_FILE);
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    manifest.files[0].path = "../outside.txt";
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(
      verifyUploadSnapshot({ snapshotDirectory: output }),
      (error) => error.code === "UNSAFE_UPLOAD_BACKUP_PATH"
    );
  });
});

test("tampered root counts fail manifest verification", async () => {
  await withProject(async (root) => {
    const output = path.join(root, "backups/upload-snapshot");
    await createUploadSnapshot({ projectRoot: root, outputDirectory: output });
    const manifestPath = path.join(output, MANIFEST_FILE);
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    manifest.roots[0].fileCount += 1;
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(
      verifyUploadSnapshot({ snapshotDirectory: output }),
      (error) => error.code === "INVALID_UPLOAD_BACKUP_MANIFEST"
    );
  });
});

test("unexpected snapshot files fail structural verification", async () => {
  await withProject(async (root) => {
    const output = path.join(root, "backups/upload-snapshot");
    await createUploadSnapshot({ projectRoot: root, outputDirectory: output });
    await fs.writeFile(path.join(output, "unexpected.txt"), "not in manifest");
    await assert.rejects(
      verifyUploadSnapshot({ snapshotDirectory: output }),
      (error) => error.code === "UPLOAD_BACKUP_FILE_SET_MISMATCH"
    );
  });
});

test("restore drill refuses live upload directories", async () => {
  await withProject(async (root) => {
    const snapshot = path.join(root, "backups/upload-snapshot");
    await createUploadSnapshot({ projectRoot: root, outputDirectory: snapshot });
    const liveTarget = path.join(root, "public/uploads");
    await assert.rejects(
      runUploadRestoreDrill({
        projectRoot: root,
        snapshotDirectory: snapshot,
        targetDirectory: liveTarget,
        confirmation: liveTarget,
      }),
      (error) => error.code === "UNSAFE_UPLOAD_RESTORE_TARGET"
    );
  });
});

test("restore drill recreates and verifies both roots in an isolated target", async () => {
  await withProject(async (root) => {
    const snapshot = path.join(root, "backups/upload-snapshot");
    const target = path.join(root, "drills/uploads-restore-test");
    await createUploadSnapshot({ projectRoot: root, outputDirectory: snapshot });
    const result = await runUploadRestoreDrill({
      projectRoot: root,
      snapshotDirectory: snapshot,
      targetDirectory: target,
      confirmation: target,
    });

    assert.equal(result.targetDirectory, target);
    assert.equal(
      await fs.readFile(path.join(target, "public/uploads/avatars/user.png"), "utf8"),
      "avatar-content"
    );
    assert.equal(
      await fs.readFile(path.join(target, "uploads/resources/book.pdf"), "utf8"),
      "resource-content"
    );
  });
});
