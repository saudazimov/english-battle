const DEFAULT_WAIT_MS = 30000;
const DEFAULT_POLL_MS = 250;
const { isAllowedRuleSignature } = require("../utils/ruleSignaturePolicy");
const { learningTextDuplicateIndexes } = require("../utils/learningContentSimilarity");
const RULE_SIGNATURE_VERSION = "canonical_rule_signature_v1";
const RULE_SIGNATURE_MIN_CONFIDENCE = 0.9;

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function sourceQuestionId(target) {
  const value = Number(target && target.evidence && target.evidence.question_id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function canonicalRuleScope(target) {
  const signature = String(target && target.rule_signature || "").trim();
  const confidence = Number(target && target.rule_signature_confidence);
  if (target && target.rule_signature_reviewed === true
      && target.rule_signature_version === RULE_SIGNATURE_VERSION
      && Number.isFinite(confidence) && confidence >= RULE_SIGNATURE_MIN_CONFIDENCE
      && isAllowedRuleSignature(signature)) {
    return { type: "rule", key: signature, version: RULE_SIGNATURE_VERSION };
  }
  const questionId = sourceQuestionId(target);
  return questionId ? { type: "question", key: String(questionId), version: null } : null;
}

function cacheIdentity(target, schemaVersion, promptVersion) {
  const scope = canonicalRuleScope(target);
  if (!scope) return null;
  return ["remediation-content", schemaVersion, promptVersion, Number(target.taxonomy_id),
    scope.type, scope.version, scope.key, String(target.cefr_level || "unknown")]
    .filter((part) => part != null).join(":");
}

function validCachedExercise(item) {
  return item && Number(item.source_question_id) > 0 && Number(item.position) > 0
    && typeof item.prompt === "string" && item.prompt.length > 0
    && item.options && typeof item.options === "object"
    && ["A", "B", "C", "D"].includes(item.correct_option)
    && typeof item.explanation === "string" && item.explanation.length > 0;
}

function validSharedContent(content, target, schemaVersion, validateRuleContract = null) {
  const privateKeys = ["source_error", "diagnostic_summary", "student_error_examples", "worked_examples"];
  const scope = canonicalRuleScope(target);
  const contractIsValid = !scope || scope.type !== "rule"
    || (typeof validateRuleContract === "function"
      && validateRuleContract(content && content.rule_contract,scope.key));
  return contractIsValid && content && typeof content === "object"
    && !privateKeys.some((key) => Object.prototype.hasOwnProperty.call(content, key))
    && content.schema_version === schemaVersion
    && Number(content.target_skill_id) === Number(target.taxonomy_id)
    && typeof content.lesson_title === "string" && content.lesson_title.length > 0
    && typeof content.learning_objective === "string" && content.learning_objective.length > 0
    && content.micro_explanation && typeof content.micro_explanation.rule === "string"
    && Array.isArray(content.micro_explanation.examples)
    && content.micro_explanation.examples.length === 10
    && learningTextDuplicateIndexes(content.micro_explanation.examples.map((item) => (
      item && item.sentence
    ))).length === 0;
}

function createRemediationContentCacheService({
  pool,
  schemaVersion,
  promptVersion,
  environment = process.env,
  validateRuleContract = null,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const waitMs = positiveInteger(environment.AI_CONTENT_CACHE_WAIT_MS, DEFAULT_WAIT_MS, 60000);
  const pollMs = positiveInteger(environment.AI_CONTENT_CACHE_POLL_MS, DEFAULT_POLL_MS, 5000);

  async function load(target, executor = pool) {
    const scope = canonicalRuleScope(target);
    if (!scope) return null;
    const scopeFilter = scope.type === "rule"
      ? `rp.evidence_snapshot->>'rule_signature'=$4
         AND rp.evidence_snapshot->>'rule_signature_version'=$5
         AND rp.evidence_snapshot->>'cefr_level'=$6`
      : `rp.evidence_snapshot #>> '{evidence,question_id}'=$4
         AND rp.evidence_snapshot->>'cefr_level'=$5`;
    const params = scope.type === "rule"
      ? [target.taxonomy_id, schemaVersion, promptVersion, scope.key, scope.version, String(target.cefr_level)]
      : [target.taxonomy_id, schemaVersion, promptVersion, scope.key, String(target.cefr_level)];
    const result = await executor.query(
      `SELECT l.id,l.generation_source,l.quality_warnings,
              l.lesson_content - 'source_error' - 'diagnostic_summary'
                - 'student_error_examples' - 'worked_examples' AS shared_content
       FROM personalized_lessons l
       JOIN remediation_plans rp ON rp.id=l.remediation_plan_id
       WHERE l.taxonomy_id=$1 AND l.schema_version=$2 AND l.prompt_version=$3
         AND l.quality_status='APPROVED'
         AND ${scopeFilter}
       ORDER BY l.updated_at DESC,l.id DESC LIMIT 1`,
      params
    );
    if (!result.rows[0] || !validSharedContent(result.rows[0].shared_content,target,schemaVersion,
      validateRuleContract)) return null;
    const exercises = await executor.query(
      `SELECT source_question_id,section,position,question_format,prompt,options,correct_option,explanation
       FROM personalized_lesson_exercises WHERE lesson_id=$1 ORDER BY position`,
      [result.rows[0].id]
    );
    if (exercises.rows.length !== 10 || exercises.rows.some((item) => !validCachedExercise(item))
        || learningTextDuplicateIndexes(exercises.rows.map((item) => item.prompt)).length > 0) return null;
    return {
      sharedContent: result.rows[0].shared_content,
      exercises: exercises.rows,
      source: result.rows[0].generation_source,
      warnings: Array.isArray(result.rows[0].quality_warnings) ? result.rows[0].quality_warnings : [],
    };
  }

  async function waitForContent(target) {
    const attempts = Math.max(1, Math.ceil(waitMs / pollMs));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await sleep(pollMs);
      const cached = await load(target);
      if (cached) return cached;
    }
    return null;
  }

  async function acquire(target) {
    const identity = cacheIdentity(target, schemaVersion, promptVersion);
    if (!identity) return { disabled: true };
    const cached = await load(target);
    if (cached) return { cached };
    const client = await pool.connect();
    let locked = false;
    try {
      const lock = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS acquired", [identity]);
      if (!lock.rows[0].acquired) {
        client.release();
        return { cached: await waitForContent(target), pending: true };
      }
      locked = true;
      const rechecked = await load(target, client);
      if (rechecked) {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [identity]);
        locked = false;
        client.release();
        return { cached: rechecked };
      }
      return { lease: { client, identity } };
    } catch (error) {
      if (locked) {
        try {
          await client.query("SELECT pg_advisory_unlock(hashtext($1))", [identity]);
          client.release();
        } catch (unlockError) {
          client.release(unlockError);
        }
      } else {
        client.release();
      }
      throw error;
    }
  }

  async function release(lease) {
    if (!lease) return;
    try {
      await lease.client.query("SELECT pg_advisory_unlock(hashtext($1))", [lease.identity]);
      lease.client.release();
    } catch (error) {
      lease.client.release(error);
      throw error;
    }
  }

  return { load, acquire, release };
}

module.exports = {
  cacheIdentity,
  canonicalRuleScope,
  sourceQuestionId,
  validCachedExercise,
  validSharedContent,
  createRemediationContentCacheService,
  RULE_SIGNATURE_VERSION,
};
