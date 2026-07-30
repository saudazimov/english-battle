const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Application-specific signed 32-bit key used only by this migration runner.
const MIGRATION_ADVISORY_LOCK_KEY = 1229737287;

function checksumOf(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function readMigrationFiles(migrationsDir, fsImpl = fs) {
  if (!fsImpl.existsSync(migrationsDir)) {
    const error = new Error(`migrations/ papkasi topilmadi: ${migrationsDir}`);
    error.code = "MIGRATIONS_DIRECTORY_MISSING";
    throw error;
  }

  return fsImpl
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     VARCHAR(255) PRIMARY KEY,
      applied_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      checksum    VARCHAR(64)
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(
    "SELECT version, checksum FROM schema_migrations"
  );
  const applied = {};

  result.rows.forEach((row) => {
    applied[row.version] = row.checksum;
  });

  return applied;
}

function verifyAppliedChecksum({
  file,
  appliedChecksum,
  currentChecksum,
  nodeEnv,
  logger,
}) {
  if (appliedChecksum === currentChecksum) return;

  const message =
    `"${file}" allaqachon bajarilgan, lekin mazmuni o'zgargan.`;

  if (nodeEnv === "production") {
    const error = new Error(message);
    error.code = "MIGRATION_CHECKSUM_MISMATCH";
    throw error;
  }

  logger.warn(`⚠️  OGOHLANTIRISH: ${message}`);
  logger.warn(
    "    Bajarilgan migration'ni o'zgartirmang — yangi migration fayl yarating."
  );
}

async function acquireMigrationLock(client) {
  const result = await client.query(
    "SELECT pg_try_advisory_lock($1) AS acquired",
    [MIGRATION_ADVISORY_LOCK_KEY]
  );

  if (result.rows[0]?.acquired !== true) {
    const error = new Error(
      "Boshqa migration jarayoni hozir ishlamoqda. Keyinroq qayta urinib ko'ring."
    );
    error.code = "MIGRATION_LOCK_UNAVAILABLE";
    throw error;
  }
}

async function releaseMigrationLock(client) {
  const result = await client.query(
    "SELECT pg_advisory_unlock($1) AS released",
    [MIGRATION_ADVISORY_LOCK_KEY]
  );

  if (result.rows[0]?.released !== true) {
    const error = new Error("Migration advisory lock bo'shatilmadi.");
    error.code = "MIGRATION_LOCK_RELEASE_FAILED";
    throw error;
  }
}

async function applyMigration(client, file, sql, checksum, logger) {
  logger.log(`▶️  Qo'llanyapti: ${file}`);
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
      [file, checksum]
    );
    await client.query("COMMIT");
    logger.log(`✅ Bajarildi: ${file}`);
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        logger.error(`❌ ROLLBACK xatosi (${file}):`, rollbackError.message);
      }
    }

    logger.error(`❌ XATO (${file}):`, error.message);
    logger.error(
      "    Migration to'xtatildi. Hech qanday yarim o'zgarish saqlanmadi."
    );
    error.alreadyReported = true;
    throw error;
  }
}

async function closeResources({ pool, client, lockAcquired, primaryError, logger }) {
  let cleanupError;

  const rememberCleanupError = (error) => {
    cleanupError ||= error;
  };

  if (client && lockAcquired) {
    try {
      await releaseMigrationLock(client);
    } catch (error) {
      rememberCleanupError(error);
    }
  }

  if (client) {
    try {
      client.release();
    } catch (error) {
      rememberCleanupError(error);
    }
  }

  try {
    await pool.end();
  } catch (error) {
    rememberCleanupError(error);
  }

  if (!cleanupError) return;
  if (!primaryError) throw cleanupError;

  primaryError.cleanupError = cleanupError;
  logger.error("Migration cleanup xatosi:", cleanupError.message);
}

async function runMigrations({
  pool,
  migrationsDir,
  nodeEnv,
  logger = console,
  fsImpl = fs,
}) {
  let client;
  let lockAcquired = false;
  let primaryError;

  try {
    client = await pool.connect();
    await acquireMigrationLock(client);
    lockAcquired = true;
    await ensureMigrationsTable(client);

    const files = readMigrationFiles(migrationsDir, fsImpl);
    const applied = await getAppliedMigrations(client);
    let ranCount = 0;

    for (const file of files) {
      const sql = fsImpl.readFileSync(path.join(migrationsDir, file), "utf8");
      const checksum = checksumOf(sql);

      if (Object.hasOwn(applied, file)) {
        verifyAppliedChecksum({
          file,
          appliedChecksum: applied[file],
          currentChecksum: checksum,
          nodeEnv,
          logger,
        });
        continue;
      }

      await applyMigration(client, file, sql, checksum, logger);
      ranCount += 1;
    }

    logger.log(
      ranCount === 0
        ? "✨ Hammasi yangilangan — kutilayotgan migration yo'q."
        : `✨ Tugadi — ${ranCount} ta migration qo'llandi.`
    );

    return ranCount;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeResources({ pool, client, lockAcquired, primaryError, logger });
  }
}

async function showMigrationStatus({
  pool,
  migrationsDir,
  logger = console,
  fsImpl = fs,
}) {
  let client;
  let primaryError;

  try {
    client = await pool.connect();
    await ensureMigrationsTable(client);
    const files = readMigrationFiles(migrationsDir, fsImpl);
    const applied = await getAppliedMigrations(client);

    logger.log("\n  Holat   Migration");
    logger.log("  ──────  ─────────────────────────────");
    files.forEach((file) => {
      const mark = Object.hasOwn(applied, file) ? "✅ done" : "⏳ kutil";
      logger.log(`  ${mark}  ${file}`);
    });
    logger.log("");
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeResources({
      pool,
      client,
      lockAcquired: false,
      primaryError,
      logger,
    });
  }
}

module.exports = {
  MIGRATION_ADVISORY_LOCK_KEY,
  checksumOf,
  readMigrationFiles,
  verifyAppliedChecksum,
  runMigrations,
  showMigrationStatus,
};
