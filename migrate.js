// migrate.js — versiyalangan PostgreSQL migration runner CLI

const path = require("path");
const pool = require("./db");
const {
  runMigrations,
  showMigrationStatus,
} = require("./src/services/migrationRunnerService");

const migrationsDir = path.join(__dirname, "migrations");

async function main() {
  const options = {
    pool,
    migrationsDir,
    nodeEnv: process.env.NODE_ENV,
    logger: console,
  };

  if (process.argv[2] === "status") {
    await showMigrationStatus(options);
    return;
  }

  await runMigrations(options);
}

if (require.main === module) {
  main().catch((error) => {
    if (!error.alreadyReported) {
      console.error(`❌ Migration xatosi: ${error.message}`);
    }
    process.exitCode = 1;
  });
}

module.exports = { main };
