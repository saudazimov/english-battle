"use strict";

require("dotenv").config({ quiet: true });

const {
  createDatabaseBackup,
  runRestoreDrill,
  verifyDatabaseBackup,
} = require("../src/services/databaseBackupService");
const {
  assertOnlyCliOptions,
  parseCliOptions,
  requiredCliOption,
} = require("../src/utils/cliOptions");

async function main(args = process.argv.slice(2), logger = console) {
  const [command, ...rawOptions] = args;
  const options = parseCliOptions(rawOptions);

  if (command === "create") {
    assertOnlyCliOptions(options, ["output"]);
    const output = await createDatabaseBackup({
      outputPath: requiredCliOption(options, "output"),
    });
    logger.log(`Backup yaratildi va tekshirildi: ${output}`);
    return;
  }
  if (command === "verify") {
    assertOnlyCliOptions(options, ["file"]);
    const file = await verifyDatabaseBackup({
      filePath: requiredCliOption(options, "file"),
    });
    logger.log(`Backup tekshirildi: ${file}`);
    return;
  }
  if (command === "restore-drill") {
    assertOnlyCliOptions(options, ["file", "target-db", "confirm-target"]);
    const target = await runRestoreDrill({
      filePath: requiredCliOption(options, "file"),
      targetDatabase: requiredCliOption(options, "target-db"),
      confirmation: requiredCliOption(options, "confirm-target"),
    });
    logger.log(`Restore drill yakunlandi: ${target}`);
    return;
  }

  throw new Error("Buyruq create, verify yoki restore-drill bo'lishi kerak.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main };
