"use strict";

require("dotenv").config({ quiet: true });

const {
  createDatabaseBackup,
  runRestoreDrill,
  verifyDatabaseBackup,
} = require("../src/services/databaseBackupService");

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw new Error(`Noma'lum argument: ${argument}`);
    const equalIndex = argument.indexOf("=");
    if (equalIndex > 2) {
      options[argument.slice(2, equalIndex)] = argument.slice(equalIndex + 1);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} qiymati majburiy`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function requiredOption(options, key) {
  if (options[key]) return options[key];
  throw new Error(`--${key} argumenti majburiy`);
}

async function main(args = process.argv.slice(2), logger = console) {
  const [command, ...rawOptions] = args;
  const options = parseOptions(rawOptions);

  if (command === "create") {
    const output = await createDatabaseBackup({
      outputPath: requiredOption(options, "output"),
    });
    logger.log(`Backup yaratildi va tekshirildi: ${output}`);
    return;
  }
  if (command === "verify") {
    const file = await verifyDatabaseBackup({
      filePath: requiredOption(options, "file"),
    });
    logger.log(`Backup tekshirildi: ${file}`);
    return;
  }
  if (command === "restore-drill") {
    const target = await runRestoreDrill({
      filePath: requiredOption(options, "file"),
      targetDatabase: requiredOption(options, "target-db"),
      confirmation: requiredOption(options, "confirm-target"),
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

module.exports = { main, parseOptions };
