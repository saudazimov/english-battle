"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  SUCCESS_FILE,
  acquireLock,
  assertCryptRemote,
  completedRemoteRun,
  defaultCommandRunner,
  parseRunTimestamp,
  releaseLock,
  remoteChild,
  validateOffsiteBackupEnvironment,
} = require("./offsiteBackupService");
const {
  runRestoreDrill,
  verifyDatabaseBackup,
} = require("./databaseBackupService");
const {
  runUploadRestoreDrill,
  verifyUploadSnapshot,
} = require("./uploadBackupService");

const RESTORE_LOCK_FILE = ".offsite-restore-drill.lock";
const RESTORE_WORK_DIRECTORY = ".offsite-restore-drill-work";
const MANIFEST_FILE = "offsite-manifest.json";
const MAX_METADATA_BYTES = 64 * 1024;

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateRunId(value) {
  const runId = String(value || "").trim();
  if (parseRunTimestamp(runId) === null) {
    throw codedError("INVALID_OFFSITE_RESTORE_RUN_ID", "Restore drill uchun qat'iy off-site run ID kerak.");
  }
  return runId;
}

async function readMetadata(filePath, label, fsImpl = fs) {
  let stats;
  try {
    stats = await fsImpl.lstat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") throw codedError("INVALID_OFFSITE_RESTORE_BUNDLE", `${label} topilmadi.`);
    throw error;
  }
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_METADATA_BYTES) {
    throw codedError("INVALID_OFFSITE_RESTORE_BUNDLE", `${label} xavfsiz metadata fayli emas.`);
  }
  try {
    return JSON.parse(await fsImpl.readFile(filePath, "utf8"));
  } catch (error) {
    throw codedError("INVALID_OFFSITE_RESTORE_BUNDLE", `${label} yaroqli JSON emas.`);
  }
}

function assertBundleMetadata({ runId, manifest, success }) {
  const runTimestamp = parseRunTimestamp(runId);
  const createdTimestamp = Date.parse(manifest?.createdAt);
  const completedTimestamp = Date.parse(success?.completedAt);
  const validManifest = manifest?.formatVersion === 1 && manifest.runId === runId &&
    createdTimestamp === runTimestamp && manifest.database === "database.dump" &&
    manifest.uploads === "uploads/manifest.json" &&
    Number.isInteger(manifest.uploadFileCount) && manifest.uploadFileCount >= 0;
  const validSuccess = success?.formatVersion === 1 && success.runId === runId &&
    Number.isFinite(completedTimestamp) && completedTimestamp >= createdTimestamp;
  if (!validManifest || !validSuccess) {
    throw codedError("INVALID_OFFSITE_RESTORE_BUNDLE", "Off-site bundle metadata run ID yoki formatga mos emas.");
  }
}

async function assertBundleStructure(stagingDirectory, fsImpl = fs) {
  const entries = await fsImpl.readdir(stagingDirectory, { withFileTypes: true });
  const names = entries.map(({ name }) => name).sort();
  const expected = [MANIFEST_FILE, SUCCESS_FILE, "database.dump", "uploads"].sort();
  const exactNames = names.length === expected.length &&
    names.every((name, index) => name === expected[index]);
  if (!exactNames || entries.some((entry) => entry.isSymbolicLink())) {
    throw codedError("INVALID_OFFSITE_RESTORE_BUNDLE", "Off-site bundle tarkibida kutilmagan fayl mavjud.");
  }
}

async function createStagingDirectory(config, runId, fsImpl = fs) {
  const workRoot = path.join(config.localRoot, RESTORE_WORK_DIRECTORY);
  await fsImpl.mkdir(workRoot, { recursive: true, mode: 0o700 });
  const stats = await fsImpl.lstat(workRoot);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw codedError("UNSAFE_OFFSITE_RESTORE_WORK_DIR", "Restore drill work directory xavfsiz emas.");
  }
  const stagingDirectory = await fsImpl.mkdtemp(path.join(workRoot, `${runId}-`));
  await fsImpl.chmod(stagingDirectory, 0o700);
  return stagingDirectory;
}

async function downloadBundle({ config, runId, stagingDirectory, commandRunner }) {
  if (!await completedRemoteRun(config, runId, commandRunner)) {
    throw codedError("OFFSITE_RESTORE_INCOMPLETE_RUN", "Remote backup SUCCESS.json bilan yakunlanmagan.");
  }
  const remoteRun = remoteChild(config.remoteRoot, runId);
  await commandRunner(config.rcloneBin, [
    "copy", remoteRun, stagingDirectory, "--immutable", "--checksum", "--retries", "3",
  ]);
  await commandRunner(config.rcloneBin, [
    "check", remoteRun, stagingDirectory, "--one-way", "--size-only",
  ]);
}

async function verifyBundle({
  runId,
  stagingDirectory,
  environment,
  fsImpl,
  verifyDatabaseBackupFn,
  verifyUploadSnapshotFn,
}) {
  await assertBundleStructure(stagingDirectory, fsImpl);
  const manifest = await readMetadata(path.join(stagingDirectory, MANIFEST_FILE), MANIFEST_FILE, fsImpl);
  const success = await readMetadata(path.join(stagingDirectory, SUCCESS_FILE), SUCCESS_FILE, fsImpl);
  assertBundleMetadata({ runId, manifest, success });
  const databasePath = path.join(stagingDirectory, "database.dump");
  const uploadSnapshot = path.join(stagingDirectory, "uploads");
  await verifyDatabaseBackupFn({ filePath: databasePath, environment, fsImpl });
  const uploadManifest = await verifyUploadSnapshotFn({ snapshotDirectory: uploadSnapshot, fsImpl });
  if (uploadManifest.files.length !== manifest.uploadFileCount) {
    throw codedError("INVALID_OFFSITE_RESTORE_BUNDLE", "Upload manifest fayllar soni bundle metadata bilan mos emas.");
  }
  return { databasePath, uploadSnapshot, uploadManifest };
}

async function cleanupDrill({ stagingDirectory, lock, fsImpl, operationError }) {
  let cleanupError;
  if (stagingDirectory) {
    try {
      await fsImpl.rm(stagingDirectory, { recursive: true, force: false });
    } catch (error) {
      cleanupError = error;
    }
  }
  try {
    await releaseLock(lock, fsImpl);
  } catch (error) {
    if (cleanupError) cleanupError.lockCleanupError = error;
    else cleanupError = error;
  }
  if (!cleanupError) return;
  if (operationError) operationError.cleanupError = cleanupError;
  else throw cleanupError;
}

async function runOffsiteRestoreDrill({
  runId,
  targetDatabase,
  databaseConfirmation,
  uploadTargetDirectory,
  uploadConfirmation,
  environment = process.env,
  projectRoot = path.resolve(__dirname, "../.."),
  now = () => new Date(),
  fsImpl = fs,
  commandRunner = defaultCommandRunner,
  verifyDatabaseBackupFn = verifyDatabaseBackup,
  verifyUploadSnapshotFn = verifyUploadSnapshot,
  runRestoreDrillFn = runRestoreDrill,
  runUploadRestoreDrillFn = runUploadRestoreDrill,
} = {}) {
  const config = validateOffsiteBackupEnvironment(environment);
  const safeRunId = validateRunId(runId);
  const startedAt = now();
  await fsImpl.mkdir(config.localRoot, { recursive: true, mode: 0o700 });
  const lock = await acquireLock(config.localRoot, startedAt, fsImpl, RESTORE_LOCK_FILE);
  let stagingDirectory;
  let operationError;
  try {
    await assertCryptRemote(config, commandRunner);
    stagingDirectory = await createStagingDirectory(config, safeRunId, fsImpl);
    await downloadBundle({ config, runId: safeRunId, stagingDirectory, commandRunner });
    const bundle = await verifyBundle({
      runId: safeRunId, stagingDirectory, environment, fsImpl,
      verifyDatabaseBackupFn, verifyUploadSnapshotFn,
    });
    const databaseTarget = await runRestoreDrillFn({
      filePath: bundle.databasePath,
      targetDatabase,
      confirmation: databaseConfirmation,
      environment,
      fsImpl,
    });
    const uploadResult = await runUploadRestoreDrillFn({
      projectRoot,
      snapshotDirectory: bundle.uploadSnapshot,
      targetDirectory: uploadTargetDirectory,
      confirmation: uploadConfirmation,
      fsImpl,
    });
    const completedAt = now();
    return {
      formatVersion: 1,
      status: "success",
      runId: safeRunId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      databaseTarget,
      uploadTargetDirectory: uploadResult.targetDirectory,
      uploadFileCount: bundle.uploadManifest.files.length,
    };
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    await cleanupDrill({ stagingDirectory, lock, fsImpl, operationError });
  }
}

module.exports = {
  RESTORE_LOCK_FILE,
  RESTORE_WORK_DIRECTORY,
  runOffsiteRestoreDrill,
  validateRunId,
};
