"use strict";

const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const {
  createDatabaseBackup,
  verifyDatabaseBackup,
} = require("./databaseBackupService");
const {
  createUploadSnapshot,
  verifyUploadSnapshot,
} = require("./uploadBackupService");

const LOCK_FILE = ".offsite-backup.lock";
const LAST_SUCCESS_FILE = ".offsite-backup-last-success.json";
const SUCCESS_FILE = "SUCCESS.json";
const MAX_TOOL_OUTPUT_BYTES = 1024 * 1024;

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateRemoteRoot(value) {
  const remote = String(value || "").trim();
  const separator = remote.indexOf(":");
  const name = remote.slice(0, separator);
  const remotePath = remote.slice(separator + 1);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ||
      !remotePath || remotePath.startsWith("/") || remotePath.endsWith("/") ||
      /[\\\r\n\0]/.test(remotePath)) {
    throw codedError("INVALID_OFFSITE_BACKUP_REMOTE", "OFFSITE_BACKUP_REMOTE xavfsiz crypt remote path bo'lishi kerak.");
  }
  const segments = remotePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw codedError("INVALID_OFFSITE_BACKUP_REMOTE", "OFFSITE_BACKUP_REMOTE path segmentlari xavfsiz emas.");
  }
  return { remoteRoot: `${name}:${segments.join("/")}`, remoteName: `${name}:` };
}

function validateOffsiteBackupEnvironment(environment = process.env, pathImpl = path) {
  const localValue = String(environment.OFFSITE_BACKUP_LOCAL_DIR || "").trim();
  if (!localValue || !pathImpl.isAbsolute(localValue)) {
    throw codedError("INVALID_OFFSITE_BACKUP_LOCAL_DIR", "OFFSITE_BACKUP_LOCAL_DIR absolute path bo'lishi kerak.");
  }
  const localRoot = pathImpl.resolve(localValue);
  if (localRoot === pathImpl.parse(localRoot).root) {
    throw codedError("INVALID_OFFSITE_BACKUP_LOCAL_DIR", "Filesystem root backup papkasi bo'lishi mumkin emas.");
  }
  const retentionDays = Number(environment.OFFSITE_BACKUP_RETENTION_DAYS || 14);
  if (!Number.isInteger(retentionDays) || retentionDays < 14 || retentionDays > 365) {
    throw codedError("INVALID_OFFSITE_BACKUP_RETENTION", "OFFSITE_BACKUP_RETENTION_DAYS 14 dan 365 gacha bo'lishi kerak.");
  }
  const remote = validateRemoteRoot(environment.OFFSITE_BACKUP_REMOTE);
  return {
    ...remote,
    localRoot,
    retentionDays,
    rcloneBin: String(environment.RCLONE_BIN || "rclone").trim() || "rclone",
  };
}

function defaultCommandRunner(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let overflow = false;
    const collect = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next) > MAX_TOOL_OUTPUT_BYTES) overflow = true;
      return next.slice(0, MAX_TOOL_OUTPUT_BYTES);
    };
    child.stdout.on("data", (chunk) => { stdout = collect(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = collect(stderr, chunk); });
    child.once("error", () => reject(codedError("OFFSITE_BACKUP_TOOL_FAILED", `${command} ishga tushmadi.`)));
    child.once("close", (code) => {
      if (overflow) return reject(codedError("OFFSITE_BACKUP_TOOL_OUTPUT_TOO_LARGE", `${command} natijasi juda katta.`));
      if (code !== 0) return reject(codedError("OFFSITE_BACKUP_TOOL_FAILED", `${command} exit code ${code} bilan tugadi.`));
      return resolve({ stdout, stderr });
    });
  });
}

function createRunId(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseRunTimestamp(runId) {
  const match = /^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(runId);
  if (!match) return null;
  const timestamp = Date.parse(`${match[1]}${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function remoteChild(remoteRoot, child) {
  return `${remoteRoot}/${child}`;
}

async function writeJson(filePath, value, fsImpl = fs, options = {}) {
  await fsImpl.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    flag: options.flag || "w",
    mode: 0o600,
  });
}

async function acquireLock(localRoot, now, fsImpl = fs, lockFile = LOCK_FILE) {
  const lockPath = path.join(localRoot, lockFile);
  let handle;
  try {
    handle = await fsImpl.open(lockPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: now.toISOString() })}\n`);
    return { handle, lockPath };
  } catch (error) {
    if (handle) {
      await handle.close();
      try {
        await fsImpl.unlink(lockPath);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") error.cleanupError = cleanupError;
      }
    }
    if (error.code === "EEXIST") {
      throw codedError("OFFSITE_BACKUP_ALREADY_RUNNING", "Off-site backup lock mavjud; parallel run rad etildi.");
    }
    throw error;
  }
}

async function releaseLock(lock, fsImpl = fs) {
  let closeError;
  try {
    await lock.handle.close();
  } catch (error) {
    closeError = error;
  }
  try {
    await fsImpl.unlink(lock.lockPath);
  } catch (error) {
    if (!closeError) throw error;
    closeError.cleanupError = error;
  }
  if (closeError) throw closeError;
}

async function assertCryptRemote(config, commandRunner) {
  const result = await commandRunner(config.rcloneBin, ["listremotes", "--long"]);
  const cryptRemote = result.stdout.split(/\r?\n/).some((line) => {
    const [name, type] = line.trim().split(/\s+/, 2);
    return name === config.remoteName && type === "crypt";
  });
  if (!cryptRemote) {
    throw codedError("OFFSITE_BACKUP_REMOTE_NOT_ENCRYPTED", "OFFSITE_BACKUP_REMOTE rclone crypt remote bo'lishi shart.");
  }
}

async function createLocalBundle({
  runDirectory,
  runId,
  createdAt,
  projectRoot,
  environment,
  fsImpl,
  createDatabaseBackupFn,
  verifyDatabaseBackupFn,
  createUploadSnapshotFn,
  verifyUploadSnapshotFn,
}) {
  await fsImpl.mkdir(runDirectory, { recursive: false, mode: 0o700 });
  const databasePath = path.join(runDirectory, "database.dump");
  const uploadsPath = path.join(runDirectory, "uploads");
  await createDatabaseBackupFn({ outputPath: databasePath, environment });
  await verifyDatabaseBackupFn({ filePath: databasePath, environment });
  const uploadResult = await createUploadSnapshotFn({ projectRoot, outputDirectory: uploadsPath, now: () => createdAt });
  const uploadManifest = await verifyUploadSnapshotFn({ snapshotDirectory: uploadsPath });
  await writeJson(path.join(runDirectory, "offsite-manifest.json"), {
    formatVersion: 1,
    runId,
    createdAt: createdAt.toISOString(),
    database: "database.dump",
    uploads: "uploads/manifest.json",
    uploadFileCount: uploadManifest.files.length,
    uploadRoots: uploadResult.manifest.roots.map(({ key, fileCount, totalBytes }) => ({ key, fileCount, totalBytes })),
  }, fsImpl, { flag: "wx" });
}

async function uploadAndVerify({ config, runDirectory, runId, completedAt, commandRunner, fsImpl }) {
  const remoteRun = remoteChild(config.remoteRoot, runId);
  const transferFlags = ["--immutable", "--checksum", "--retries", "3"];
  await commandRunner(config.rcloneBin, ["copy", runDirectory, remoteRun, "--create-empty-src-dirs", ...transferFlags]);
  await commandRunner(config.rcloneBin, ["check", runDirectory, remoteRun, "--one-way", "--size-only"]);

  const successPath = path.join(runDirectory, SUCCESS_FILE);
  try {
    await writeJson(successPath, { formatVersion: 1, runId, completedAt: completedAt.toISOString() }, fsImpl, { flag: "wx" });
    await commandRunner(config.rcloneBin, ["copyto", successPath, remoteChild(remoteRun, SUCCESS_FILE), ...transferFlags]);
    if (!await completedRemoteRun(config, runId, commandRunner)) {
      throw codedError("OFFSITE_BACKUP_REMOTE_VERIFICATION_FAILED", "Remote success marker tasdiqlanmadi.");
    }
    return remoteRun;
  } catch (error) {
    try {
      await fsImpl.unlink(successPath);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") error.cleanupError = cleanupError;
    }
    throw error;
  }
}

async function completedRemoteRun(config, runId, commandRunner) {
  const result = await commandRunner(config.rcloneBin, [
    "lsf", remoteChild(config.remoteRoot, runId), "--files-only", "--max-depth", "1", "--include", SUCCESS_FILE,
  ]);
  return result.stdout.split(/\r?\n/).some((line) => line.trim() === SUCCESS_FILE);
}

async function applyRemoteRetention({ config, currentRunId, cutoff, commandRunner }) {
  const listing = await commandRunner(config.rcloneBin, ["lsf", config.remoteRoot, "--dirs-only", "--max-depth", "1"]);
  let removed = 0;
  for (const line of listing.stdout.split(/\r?\n/)) {
    const runId = line.trim().replace(/\/$/, "");
    const timestamp = parseRunTimestamp(runId);
    if (runId === currentRunId || timestamp === null || timestamp >= cutoff) continue;
    if (!await completedRemoteRun(config, runId, commandRunner)) continue;
    await commandRunner(config.rcloneBin, ["purge", remoteChild(config.remoteRoot, runId)]);
    removed += 1;
  }
  return removed;
}

async function applyLocalRetention({ config, currentRunId, cutoff, fsImpl = fs }) {
  const entries = await fsImpl.readdir(config.localRoot, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    const timestamp = parseRunTimestamp(entry.name);
    if (!entry.isDirectory() || entry.name === currentRunId || timestamp === null || timestamp >= cutoff) continue;
    try {
      await fsImpl.access(path.join(config.localRoot, entry.name, SUCCESS_FILE));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    await fsImpl.rm(path.join(config.localRoot, entry.name), { recursive: true, force: false });
    removed += 1;
  }
  return removed;
}

async function writeLastSuccess({ config, result, fsImpl = fs }) {
  const target = path.join(config.localRoot, LAST_SUCCESS_FILE);
  const temporary = `${target}.partial-${process.pid}-${randomUUID()}`;
  try {
    await writeJson(temporary, result, fsImpl, { flag: "wx" });
    await fsImpl.rename(temporary, target);
  } catch (error) {
    try {
      await fsImpl.unlink(temporary);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") error.cleanupError = cleanupError;
    }
    throw error;
  }
}

async function runOffsiteBackup({
  environment = process.env,
  projectRoot = path.resolve(__dirname, "../.."),
  now = () => new Date(),
  fsImpl = fs,
  commandRunner = defaultCommandRunner,
  createDatabaseBackupFn = createDatabaseBackup,
  verifyDatabaseBackupFn = verifyDatabaseBackup,
  createUploadSnapshotFn = createUploadSnapshot,
  verifyUploadSnapshotFn = verifyUploadSnapshot,
} = {}) {
  const config = validateOffsiteBackupEnvironment(environment);
  const createdAt = now();
  const runId = createRunId(createdAt);
  const runDirectory = path.join(config.localRoot, runId);
  await fsImpl.mkdir(config.localRoot, { recursive: true, mode: 0o700 });
  const lock = await acquireLock(config.localRoot, createdAt, fsImpl);
  let operationError;
  try {
    await assertCryptRemote(config, commandRunner);
    await createLocalBundle({
      runDirectory, runId, createdAt, projectRoot, environment, fsImpl,
      createDatabaseBackupFn, verifyDatabaseBackupFn, createUploadSnapshotFn, verifyUploadSnapshotFn,
    });
    const completedAt = now();
    await uploadAndVerify({ config, runDirectory, runId, completedAt, commandRunner, fsImpl });
    const cutoff = completedAt.getTime() - config.retentionDays * 24 * 60 * 60 * 1000;
    const remoteRemoved = await applyRemoteRetention({ config, currentRunId: runId, cutoff, commandRunner });
    const localRemoved = await applyLocalRetention({ config, currentRunId: runId, cutoff, fsImpl });
    const result = {
      formatVersion: 1, status: "success", runId,
      completedAt: completedAt.toISOString(), retentionDays: config.retentionDays,
      remoteRemoved, localRemoved,
    };
    await writeLastSuccess({ config, result, fsImpl });
    return result;
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await releaseLock(lock, fsImpl);
    } catch (cleanupError) {
      if (!operationError) throw cleanupError;
      operationError.cleanupError = cleanupError;
    }
  }
}

module.exports = {
  LAST_SUCCESS_FILE,
  LOCK_FILE,
  SUCCESS_FILE,
  acquireLock,
  assertCryptRemote,
  completedRemoteRun,
  createRunId,
  defaultCommandRunner,
  parseRunTimestamp,
  releaseLock,
  remoteChild,
  runOffsiteBackup,
  validateOffsiteBackupEnvironment,
};
