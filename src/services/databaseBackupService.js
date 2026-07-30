"use strict";

const { execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const { constants: fsConstants } = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const CUSTOM_ARCHIVE_MAGIC = Buffer.from("PGDMP");

async function defaultCommandRunner(command, args, options) {
  return execFileAsync(command, args, {
    ...options,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
}

function valueOf(environment, key) {
  return String(environment[key] || "").trim();
}

function validateDatabaseEnvironment(environment) {
  const errors = [];
  for (const key of ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"]) {
    if (!valueOf(environment, key)) errors.push(`${key} majburiy`);
  }

  const port = Number(valueOf(environment, "DB_PORT"));
  if (valueOf(environment, "DB_PORT") &&
      (!Number.isInteger(port) || port < 1 || port > 65535)) {
    errors.push("DB_PORT 1-65535 oralig'idagi port bo'lishi kerak");
  }
  const dbSsl = valueOf(environment, "DB_SSL");
  if (dbSsl && !/^(true|false)$/i.test(dbSsl)) {
    errors.push("DB_SSL true yoki false bo'lishi kerak");
  }

  if (!errors.length) return;
  const error = new Error(`Database backup konfiguratsiyasi noto'g'ri:\n- ${errors.join("\n- ")}`);
  error.code = "INVALID_DATABASE_BACKUP_ENVIRONMENT";
  throw error;
}

function databaseConnectionArgs(environment, databaseName) {
  return [
    "--host", valueOf(environment, "DB_HOST"),
    "--port", valueOf(environment, "DB_PORT"),
    "--username", valueOf(environment, "DB_USER"),
    "--dbname", databaseName,
  ];
}

function childEnvironment(environment) {
  const dbSsl = valueOf(environment, "DB_SSL").toLowerCase();
  const configuredSslMode = valueOf(environment, "PGSSLMODE");
  const pgSslMode = configuredSslMode ||
    (dbSsl === "true" ? "require" : dbSsl === "false" ? "disable" : "");

  return {
    ...process.env,
    ...environment,
    PGPASSWORD: valueOf(environment, "DB_PASSWORD"),
    ...(pgSslMode ? { PGSSLMODE: pgSslMode } : {}),
  };
}

function executable(environment, key, fallback) {
  return valueOf(environment, key) || fallback;
}

function safeCommandError(label, error, environment) {
  let detail = String(error.stderr || error.message || "").trim();
  for (const key of ["DB_PASSWORD", "DATABASE_URL"]) {
    const secret = valueOf(environment, key);
    if (secret) detail = detail.split(secret).join("[REDACTED]");
  }

  const wrapped = new Error(`${label} bajarilmadi${detail ? `: ${detail}` : ""}`);
  wrapped.code = "DATABASE_TOOL_FAILED";
  wrapped.cause = error;
  return wrapped;
}

async function runDatabaseTool({
  label,
  command,
  args,
  environment,
  commandRunner,
}) {
  try {
    return await commandRunner(command, args, {
      env: childEnvironment(environment),
      encoding: "utf8",
    });
  } catch (error) {
    throw safeCommandError(label, error, environment);
  }
}

async function assertCustomArchive(filePath, fsImpl = fs) {
  const stats = await fsImpl.lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < CUSTOM_ARCHIVE_MAGIC.length) {
    const error = new Error("Backup oddiy, o'qiladigan PostgreSQL custom archive fayli emas.");
    error.code = "INVALID_DATABASE_BACKUP";
    throw error;
  }

  const file = await fsImpl.open(filePath, "r");
  try {
    const header = Buffer.alloc(CUSTOM_ARCHIVE_MAGIC.length);
    await file.read(header, 0, header.length, 0);
    if (!header.equals(CUSTOM_ARCHIVE_MAGIC)) {
      const error = new Error("Backup PostgreSQL custom archive (PGDMP) formatida emas.");
      error.code = "INVALID_DATABASE_BACKUP";
      throw error;
    }
  } finally {
    await file.close();
  }
}

async function verifyDatabaseBackup({
  filePath,
  environment = process.env,
  commandRunner = defaultCommandRunner,
  fsImpl = fs,
}) {
  const resolvedPath = path.resolve(filePath);
  await assertCustomArchive(resolvedPath, fsImpl);
  await runDatabaseTool({
    label: "Backup strukturasi tekshiruvi",
    command: executable(environment, "PG_RESTORE_BIN", "pg_restore"),
    args: ["--list", resolvedPath],
    environment,
    commandRunner,
  });
  return resolvedPath;
}

async function pathExists(filePath, fsImpl) {
  try {
    await fsImpl.lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function removeIfExists(filePath, fsImpl) {
  try {
    await fsImpl.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function createDatabaseBackup({
  outputPath,
  environment = process.env,
  commandRunner = defaultCommandRunner,
  fsImpl = fs,
}) {
  validateDatabaseEnvironment(environment);
  const resolvedPath = path.resolve(outputPath);
  if (path.extname(resolvedPath).toLowerCase() !== ".dump") {
    throw new Error("Backup output fayli .dump kengaytmasiga ega bo'lishi kerak.");
  }
  if (await pathExists(resolvedPath, fsImpl)) {
    const error = new Error(`Mavjud backup ustiga yozish rad etildi: ${resolvedPath}`);
    error.code = "DATABASE_BACKUP_ALREADY_EXISTS";
    throw error;
  }

  await fsImpl.mkdir(path.dirname(resolvedPath), { recursive: true });
  const temporaryPath = `${resolvedPath}.partial-${process.pid}-${randomUUID()}`;
  let finalCreated = false;
  let operationError;

  try {
    await runDatabaseTool({
      label: "Database backup",
      command: executable(environment, "PG_DUMP_BIN", "pg_dump"),
      args: [
        ...databaseConnectionArgs(environment, valueOf(environment, "DB_NAME")),
        "--format=custom", "--no-owner", "--no-privileges",
        "--file", temporaryPath,
      ],
      environment,
      commandRunner,
    });
    await verifyDatabaseBackup({
      filePath: temporaryPath,
      environment,
      commandRunner,
      fsImpl,
    });
    await fsImpl.copyFile(temporaryPath, resolvedPath, fsConstants.COPYFILE_EXCL);
    finalCreated = true;
    await fsImpl.chmod(resolvedPath, 0o600);
    return resolvedPath;
  } catch (error) {
    operationError = error;
    if (finalCreated) {
      try {
        await removeIfExists(resolvedPath, fsImpl);
      } catch (cleanupError) {
        error.cleanupError = cleanupError;
      }
    }
    throw error;
  } finally {
    try {
      await removeIfExists(temporaryPath, fsImpl);
    } catch (cleanupError) {
      if (!operationError) throw cleanupError;
      operationError.cleanupError ||= cleanupError;
    }
  }
}

function assertSafeRestoreTarget({ targetDatabase, confirmation, productionDatabase }) {
  const target = String(targetDatabase || "").trim();
  const production = String(productionDatabase || "").trim();

  if (!/^[a-z_][a-z0-9_]*_restore_test(?:_[a-z0-9_]+)?$/i.test(target)) {
    const error = new Error("Restore drill database nomi _restore_test bilan tugashi kerak.");
    error.code = "UNSAFE_RESTORE_TARGET";
    throw error;
  }
  if (target.toLowerCase() === production.toLowerCase()) {
    const error = new Error("Production database restore target bo'lishi mumkin emas.");
    error.code = "UNSAFE_RESTORE_TARGET";
    throw error;
  }
  if (confirmation !== target) {
    const error = new Error("--confirm-target qiymati restore target nomiga aynan teng bo'lishi kerak.");
    error.code = "RESTORE_TARGET_NOT_CONFIRMED";
    throw error;
  }

  return target;
}

async function runRestoreDrill({
  filePath,
  targetDatabase,
  confirmation,
  environment = process.env,
  commandRunner = defaultCommandRunner,
  fsImpl = fs,
}) {
  validateDatabaseEnvironment(environment);
  const target = assertSafeRestoreTarget({
    targetDatabase,
    confirmation,
    productionDatabase: valueOf(environment, "DB_NAME"),
  });
  const archivePath = await verifyDatabaseBackup({
    filePath,
    environment,
    commandRunner,
    fsImpl,
  });
  const connectionArgs = databaseConnectionArgs(environment, target);

  await runDatabaseTool({
    label: "Restore drill",
    command: executable(environment, "PG_RESTORE_BIN", "pg_restore"),
    args: [
      ...connectionArgs, "--single-transaction", "--exit-on-error",
      "--no-owner", "--no-privileges",
      archivePath,
    ],
    environment,
    commandRunner,
  });
  const validation = await runDatabaseTool({
    label: "Restore drill tekshiruvi",
    command: executable(environment, "PSQL_BIN", "psql"),
    args: [
      ...connectionArgs, "--no-psqlrc", "--set", "ON_ERROR_STOP=1",
      "--tuples-only", "--command", "SELECT COUNT(*) FROM schema_migrations;",
    ],
    environment,
    commandRunner,
  });

  const migrationCount = String(validation.stdout || "").trim();
  if (!/^\d+$/.test(migrationCount) || Number(migrationCount) < 1) {
    const error = new Error("Restore drill schema_migrations tekshiruvidan o'tmadi.");
    error.code = "RESTORE_DRILL_VERIFICATION_FAILED";
    throw error;
  }

  return target;
}

module.exports = {
  assertSafeRestoreTarget,
  createDatabaseBackup,
  runRestoreDrill,
  validateDatabaseEnvironment,
  verifyDatabaseBackup,
};
