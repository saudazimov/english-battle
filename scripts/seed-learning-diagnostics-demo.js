const pool = require("../db");
const {
  DEFAULT_DEMO_PASSWORD,
  removeLearningDiagnosticsDemo,
  seedLearningDiagnosticsDemo,
} = require("../src/services/learningDiagnosticsDemoService");

function printUsage() {
  console.log("Learning diagnostics demo data");
  console.log("  npm run demo:learning -- --dry-run  Validate all inserts and roll back");
  console.log("  npm run demo:learning -- --apply    Replace and commit isolated demo data");
  console.log("  npm run demo:learning -- --cleanup  Remove only isolated demo data");
  console.log("Production execution is always blocked.");
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  if (flags.has("--cleanup")) {
    await removeLearningDiagnosticsDemo(pool);
    console.log("Learning diagnostics demo data removed.");
    return;
  }
  const mode = flags.has("--apply") ? "apply" : flags.has("--dry-run") ? "dry-run" : null;
  if (!mode) {
    printUsage();
    return;
  }
  const summary = await seedLearningDiagnosticsDemo(pool, { mode });
  console.log(JSON.stringify(summary, null, 2));
  if (mode === "apply") {
    console.log(`Demo password: ${process.env.DEMO_LEARNING_PASSWORD || DEFAULT_DEMO_PASSWORD}`);
  } else {
    console.log("Dry-run complete. The transaction was rolled back.");
  }
}

main()
  .catch((error) => {
    console.error("Learning diagnostics demo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
