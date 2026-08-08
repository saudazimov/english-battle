const pool = require("../db");
const {
  createLearningDiagnosticsSuccessService,
} = require("../src/services/learningDiagnosticsSuccessService");

async function main() {
  const service = createLearningDiagnosticsSuccessService({ pool });
  const result = await service.verify();
  for (const item of result.criteria) {
    console.log(`${item.passed ? "PASS" : "FAIL"} ${item.key} ${item.description}`);
    console.log(`  Evidence: ${JSON.stringify(item.evidence)}`);
  }
  console.log(`Success criteria: ${result.passedCount}/${result.totalCount}`);
  if (!result.passed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Learning diagnostics success verification failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
