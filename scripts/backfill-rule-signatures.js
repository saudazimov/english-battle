const pool = require("../db");
const { providerConfiguration } = require("../src/services/aiProviderService");
const { createQuestionAnalysisService } = require("../src/services/questionAnalysisService");

const DEFAULT_LIMIT = 10;
const DEFAULT_INPUT_TOKENS = 12000;
const DEFAULT_OUTPUT_TOKENS = 3300;

function argumentValue(argv, name) {
  const prefix = `--${name}=`;
  const argument = argv.find((item) => item.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : undefined;
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function estimatedQuestionCost(environment, argv) {
  const override = positiveNumber(argumentValue(argv, "estimated-cost-per-question-usd"));
  if (override) return override;
  const config = providerConfiguration(environment);
  if (config.inputCostPerMillion <= 0 || config.outputCostPerMillion <= 0) {
    throw new Error("AI narxlari sozlanmagan; pricing env yoki --estimated-cost-per-question-usd kiriting");
  }
  const inputTokens = positiveInteger(
    environment.AI_RULE_SIGNATURE_BACKFILL_INPUT_TOKENS,
    DEFAULT_INPUT_TOKENS,
    100000
  );
  const outputTokens = positiveInteger(
    environment.AI_RULE_SIGNATURE_BACKFILL_OUTPUT_TOKENS,
    DEFAULT_OUTPUT_TOKENS,
    20000
  );
  return Number((inputTokens * config.inputCostPerMillion / 1000000
    + outputTokens * config.outputCostPerMillion / 1000000).toFixed(8));
}

function resolveOptions(argv = process.argv.slice(2), environment = process.env) {
  const execute = argv.includes("--execute");
  const limit = positiveInteger(argumentValue(argv, "limit"), DEFAULT_LIMIT, 100);
  const afterId = Math.max(0, Number.parseInt(argumentValue(argv, "after-id"), 10) || 0);
  const unitCost = estimatedQuestionCost(environment, argv);
  const explicitCostLimit = positiveNumber(argumentValue(argv, "max-cost-usd"))
    || positiveNumber(environment.AI_RULE_SIGNATURE_BACKFILL_MAX_COST_USD);
  if (execute && !explicitCostLimit) {
    throw new Error("--execute uchun --max-cost-usd yoki AI_RULE_SIGNATURE_BACKFILL_MAX_COST_USD majburiy");
  }
  return {
    afterId,
    limit,
    dryRun: !execute,
    estimatedCostPerQuestionUsd: unitCost,
    maxEstimatedCostUsd: explicitCostLimit || Number((unitCost * limit).toFixed(8)),
  };
}

async function main() {
  const options = resolveOptions();
  const service = createQuestionAnalysisService({ pool });
  const result = await service.backfillRuleSignatures(options);
  console.log(JSON.stringify(result, null, 2));
  if (result.has_more) {
    console.log(`Keyingi batch uchun: --after-id=${result.next_after_id}`);
  }
  if (result.dry_run) {
    console.log("Dry-run: bazaga job yozilmadi. Navbatga qo'yish uchun --execute va dollar limitini kiriting.");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Rule signature backfill xatosi: ${error.message}`);
    process.exitCode = 1;
  }).finally(() => pool.end());
}

module.exports = { estimatedQuestionCost, resolveOptions, main };
