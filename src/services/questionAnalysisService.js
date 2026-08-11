const defaultAiService = require("../../aiService");
const { createDurableJobService } = require("./durableJobService");
const {
  isAllowedRuleSignature,
  quarantinedRuleSignatures,
} = require("../utils/ruleSignaturePolicy");

const TARGET_ANALYSIS_SCHEMA_VERSION = defaultAiService.QUESTION_ANALYSIS_SCHEMA_VERSION;
const TARGET_ANALYSIS_PROMPT_VERSION = defaultAiService.QUESTION_ANALYSIS_PROMPT_VERSION;
const TARGET_RULE_SIGNATURE_VERSION = defaultAiService.RULE_SIGNATURE_VERSION;
const RULE_SIGNATURE_BACKFILL_JOB_VERSION = "v6";

const SERIOUS_WARNINGS = new Set([
  "MULTIPLE_CORRECT_ANSWERS",
  "POSSIBLE_WRONG_KEY",
  "MISSING_CONTEXT",
  "AMBIGUOUS_WORDING",
  "CONFLICTING_EXPLANATION",
  "UNRELIABLE_TAXONOMY_MATCH",
]);
const VALID_LEVELS = new Set(["Pre-A1", "A1", "A2", "B1", "B2", "C1", "C2"]);
const VALID_STATUSES = new Set([
  "ANALYSIS_PENDING", "ANALYZING", "READY", "REVIEW_SUGGESTED",
  "REVIEW_REQUIRED", "ANALYSIS_FAILED", "DISABLED",
]);
const RULE_SIGNATURE_ACTIONS = new Set(["preserve", "approve", "clear"]);
const REVIEW_QUEUE_FILTERS = new Set(["all", "unreviewed", "review_required", "quarantined"]);

class QuestionAnalysisReviewValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "QuestionAnalysisReviewValidationError";
    this.code = "INVALID_QUESTION_ANALYSIS_REVIEW";
    this.statusCode = 400;
  }
}

function text(value) {
  return String(value || "").trim();
}

function clampConfidence(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
}

function taxonomyIndex(catalog) {
  const bySlug = new Map();
  for (const node of catalog) bySlug.set(node.slug, node);
  return bySlug;
}

function detectTaxonomy(question, catalog) {
  const index = taxonomyIndex(catalog);
  const content = `${text(question.question_text)} ${text(question.explanation)}`.toLowerCase();
  const legacy = text(question.skill).toLowerCase();
  let mainSlug = ["vocabulary", "reading", "listening", "writing", "speaking"].includes(legacy)
    ? legacy : "grammar";
  if (/read|passage|paragraph|text says|according to/.test(content)) mainSlug = "reading";
  if (/listen|audio|speaker|hear/.test(content)) mainSlug = "listening";
  if (/meaning|synonym|antonym|vocabulary|word/.test(content) && mainSlug === "grammar") mainSlug = "vocabulary";

  let topicSlug;
  let subskillSlug;
  let microSkillSlug = null;
  if (mainSlug === "grammar" && /\b(he|she|it|every|usually|always|often)\b/.test(content)) {
    topicSlug = "present-simple";
    subskillSlug = "third-person-singular";
    microSkillSlug = "selecting-s-es-ies";
  } else if (mainSlug === "grammar") {
    topicSlug = /\b(yesterday|tomorrow|last|ago|since|for|already|will|did|was|were)\b/.test(content)
      ? "verb-forms-and-tenses" : "general-grammar";
    subskillSlug = topicSlug === "verb-forms-and-tenses" ? "selecting-correct-tense" : "applying-grammar-rules";
  } else {
    const paths = {
      vocabulary: ["vocabulary-in-context", "inferring-word-meaning"],
      reading: ["reading-comprehension", "understanding-paraphrase"],
      listening: ["listening-comprehension", "spoken-detail"],
      writing: ["written-production", "sentence-construction"],
      speaking: ["spoken-production", "spoken-response"],
    };
    [topicSlug, subskillSlug] = paths[mainSlug];
  }
  return {
    main_skill_id: index.get(mainSlug)?.id || null,
    topic_id: index.get(topicSlug)?.id || null,
    subskill_id: index.get(subskillSlug)?.id || null,
    micro_skill_id: microSkillSlug ? index.get(microSkillSlug)?.id || null : null,
    mainSlug,
    topicSlug,
  };
}

function detectWarnings(question, taxonomy) {
  const options = [question.option_a, question.option_b, question.option_c, question.option_d]
    .map((option) => text(option).toLowerCase());
  const warnings = [];
  if (new Set(options).size !== 4) warnings.push("MULTIPLE_CORRECT_ANSWERS");
  if (!["A", "B", "C", "D"].includes(question.correct_option) || options.some((option) => !option)) {
    warnings.push("POSSIBLE_WRONG_KEY");
  }
  if (text(question.question_text).length < 3) warnings.push("MISSING_CONTEXT");
  if (!taxonomy.main_skill_id || !taxonomy.topic_id || !taxonomy.subskill_id) {
    warnings.push("UNRELIABLE_TAXONOMY_MATCH");
  }
  return warnings;
}

function distractorCode(optionText, taxonomy) {
  const value = text(optionText).toLowerCase();
  if (taxonomy.topicSlug === "present-simple") {
    if (/ing\b/.test(value)) return "VERB_FORM_CONFUSION";
    if (/ed\b|was|were|did/.test(value)) return "TENSE_CONFUSION";
    return "THIRD_PERSON_S_MISSING";
  }
  if (taxonomy.mainSlug === "vocabulary") return "VOCABULARY_DISTRACTOR";
  if (taxonomy.mainSlug === "reading") return "PARAPHRASE_CONFUSION";
  return "INCORRECT_FORM_SELECTION";
}

function buildFallbackAnalysis(question, catalog) {
  const taxonomy = detectTaxonomy(question, catalog);
  const warnings = detectWarnings(question, taxonomy);
  const level = VALID_LEVELS.has(question.cefr_level) ? question.cefr_level : "A1";
  const options = { A: question.option_a, B: question.option_b, C: question.option_c, D: question.option_d };
  const distractors = Object.keys(options)
    .filter((option) => option !== question.correct_option)
    .map((option) => ({
      option,
      error_code: distractorCode(options[option], taxonomy),
      likely_reason: "Tanlangan variant savolda tekshirilayotgan qoida yoki ma'noga mos kelmaydi.",
      confidence: 0.65,
    }));
  const confidence = warnings.length ? 0.55 : 0.72;
  return {
    schema_version: "question_analysis_v1",
    estimated_level: level,
    level_confidence: 0.65,
    level_evidence: ["Legacy CEFR value retained by deterministic fallback."],
    ...taxonomy,
    taxonomy_confidence: confidence,
    question_type: text(question.question_text).includes("___") ? "gap_fill" : "multiple_choice",
    cognitive_task: "select_correct_option",
    grammar_structure: taxonomy.mainSlug === "grammar" ? taxonomy.topicSlug : null,
    required_vocabulary: [],
    prerequisite_skill_ids: [],
    correct_answer_explanation: text(question.explanation) || "To'g'ri variant savoldagi qoida va kontekstga mos keladi.",
    distractors,
    quality_warnings: warnings,
    contains_above_level_language: false,
    analysis_confidence: confidence,
    rule_signature: null,
    rule_signature_version: null,
    rule_signature_confidence: null,
    rule_signature_reviewed: false,
  };
}

function resolveRuleSignatureOverride(current, review = {}) {
  const action = text(review.rule_signature_action || "preserve").toLowerCase();
  if (!RULE_SIGNATURE_ACTIONS.has(action)) {
    throw new QuestionAnalysisReviewValidationError("Canonical qoida amali noto'g'ri");
  }
  if (action === "approve") {
    const signature = text(review.rule_signature);
    if (!isAllowedRuleSignature(signature)) {
      throw new QuestionAnalysisReviewValidationError("Canonical qoida formati noto'g'ri yoki bu qoida karantinda");
    }
    return {
      action,
      rule_signature: signature,
      rule_signature_version: TARGET_RULE_SIGNATURE_VERSION,
      rule_signature_confidence: 1,
      rule_signature_reviewed: true,
    };
  }
  if (action === "clear") {
    return {
      action,
      rule_signature: null,
      rule_signature_version: null,
      rule_signature_confidence: null,
      rule_signature_reviewed: false,
    };
  }
  return {
    action,
    rule_signature: current.rule_signature || null,
    rule_signature_version: current.rule_signature_version || null,
    rule_signature_confidence: current.rule_signature_confidence == null
      ? null : Number(current.rule_signature_confidence),
    rule_signature_reviewed: current.rule_signature_reviewed === true,
  };
}

function analysisStatus(analysis) {
  const warnings = new Set(analysis.quality_warnings || []);
  if ([...warnings].some((warning) => SERIOUS_WARNINGS.has(warning))) return "REVIEW_REQUIRED";
  const confidence = Math.min(
    clampConfidence(analysis.level_confidence, 0),
    clampConfidence(analysis.taxonomy_confidence, 0),
    clampConfidence(analysis.analysis_confidence, 0)
  );
  if (confidence < 0.6) return "REVIEW_REQUIRED";
  if (confidence < 0.85) return "REVIEW_SUGGESTED";
  return "READY";
}

function createQuestionAnalysisService({
  pool,
  aiService = defaultAiService,
  logger = console,
  durableJobService,
}) {
  let workerTimer = null;
  let workerBusy = false;
  const jobs = durableJobService || createDurableJobService({
    pool,
    jobType: "question_analysis",
    logger,
    retryDelayMs: (retryCount) => (2 ** retryCount) * 30000,
  });

  async function loadCatalog(db = pool) {
    const result = await db.query(
      `SELECT id, node_type, parent_id, name, slug, legacy_skill
       FROM learning_taxonomy WHERE is_active=true ORDER BY id`
    );
    return result.rows;
  }

  async function enqueue(questionId, reason = "question_saved") {
    const result = await pool.query("SELECT id, updated_at FROM questions WHERE id=$1", [questionId]);
    if (!result.rows.length) return false;
    const version = new Date(result.rows[0].updated_at).getTime();
    const nonce = reason === "admin_reanalysis" ? `:${Date.now()}` : "";
    const key = `question-analysis:${questionId}:${version}${nonce}`;
    await pool.query(
      `INSERT INTO question_ai_analysis (question_id, status)
       VALUES ($1, 'ANALYSIS_PENDING')
       ON CONFLICT (question_id) DO UPDATE SET status='ANALYSIS_PENDING', updated_at=NOW(), last_error=NULL`,
      [questionId]
    );
    await pool.query(
      `INSERT INTO ai_generation_jobs
       (job_type, entity_type, entity_id, payload, idempotency_key)
       VALUES ('question_analysis','question',$1,$2::jsonb,$3)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [String(questionId), JSON.stringify({ question_id: questionId, reason }), key]
    );
    await pool.query(
      `UPDATE questions SET analysis_status='ANALYSIS_PENDING', diagnostic_eligible=false
       WHERE id=$1`,
      [questionId]
    );
    return true;
  }

  async function enqueueSafe(questionId, reason) {
    try {
      const queued = await enqueue(questionId, reason);
      if (queued) setImmediate(() => processBatchSafe(1));
      return queued;
    } catch (error) {
      logger.error("Question analysis enqueue xatosi:", error.message);
      return false;
    }
  }

  async function backfillRuleSignatures({
    afterId = 0,
    limit = 10,
    dryRun = true,
    maxEstimatedCostUsd,
    estimatedCostPerQuestionUsd,
  } = {}) {
    const safeAfterId = Math.max(0, Number.parseInt(afterId, 10) || 0);
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 10));
    const unitCost = Number(estimatedCostPerQuestionUsd);
    const costLimit = Number(maxEstimatedCostUsd);
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      throw new Error("Backfill uchun bitta savolning taxminiy AI xarajati musbat bo'lishi kerak");
    }
    if (!Number.isFinite(costLimit) || costLimit <= 0) {
      throw new Error("Backfill uchun taxminiy dollar limiti musbat bo'lishi kerak");
    }
    const affordableCount = Math.floor(costLimit / unitCost);
    if (affordableCount < 1) {
      throw new Error("Xarajat limiti hatto bitta savol tahlili uchun yetarli emas");
    }
    const batchSize = Math.min(safeLimit, affordableCount);
    const candidates = await pool.query(
      `SELECT q.id,a.analysis_version
       FROM questions q
       JOIN question_ai_analysis a ON a.question_id=q.id
       WHERE q.id>$1 AND q.diagnostic_eligible=true AND a.diagnostic_eligible=true
         AND (COALESCE(a.schema_version,'')<>$2 OR COALESCE(a.prompt_version,'')<>$3)
         AND COALESCE(a.rule_signature_reviewed,false)=false
       ORDER BY q.id ASC LIMIT $4`,
      [safeAfterId, TARGET_ANALYSIS_SCHEMA_VERSION, TARGET_ANALYSIS_PROMPT_VERSION, batchSize + 1]
    );
    const selected = candidates.rows.slice(0, batchSize);
    let queuedCount = 0;
    if (!dryRun) {
      for (const candidate of selected) {
        const job = await jobs.enqueue({
          entityType: "question",
          entityId: candidate.id,
          payload: {
            question_id: Number(candidate.id),
            reason: "rule_signature_backfill",
            target_schema_version: TARGET_ANALYSIS_SCHEMA_VERSION,
            target_prompt_version: TARGET_ANALYSIS_PROMPT_VERSION,
            target_rule_signature_version: TARGET_RULE_SIGNATURE_VERSION,
            estimated_cost_usd: unitCost,
          },
          idempotencyKey: `question-rule-signature-backfill-${RULE_SIGNATURE_BACKFILL_JOB_VERSION}:${candidate.id}:${TARGET_RULE_SIGNATURE_VERSION}`,
        });
        if (job) queuedCount += 1;
      }
    }
    const estimatedBatchCostUsd = Number((selected.length * unitCost).toFixed(8));
    return {
      dry_run: Boolean(dryRun),
      selected_count: selected.length,
      queued_count: queuedCount,
      duplicate_count: dryRun ? 0 : selected.length - queuedCount,
      estimated_cost_per_question_usd: unitCost,
      estimated_batch_cost_usd: estimatedBatchCostUsd,
      max_estimated_cost_usd: costLimit,
      next_after_id: selected.length ? Number(selected.at(-1).id) : safeAfterId,
      has_more: candidates.rows.length > batchSize,
      question_ids: selected.map((candidate) => Number(candidate.id)),
    };
  }

  async function claimNext() {
    return jobs.claimNext();
  }

  async function persistAnalysis(question, analysis, source, provider, model) {
    const status = analysisStatus(analysis);
    const eligible = ![...(analysis.quality_warnings || [])]
      .some((warning) => SERIOUS_WARNINGS.has(warning));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT analysis_version FROM question_ai_analysis WHERE question_id=$1 FOR UPDATE",
        [question.id]
      );
      const version = (current.rows[0]?.analysis_version || 0) + 1;
      await client.query(
        `INSERT INTO question_ai_analysis (
          question_id, schema_version, prompt_version, analysis_version, status,
          estimated_level, level_confidence, level_evidence, main_skill_id, topic_id,
          subskill_id, micro_skill_id, taxonomy_confidence, question_type, cognitive_task,
          grammar_structure, required_vocabulary, prerequisite_skill_ids,
          correct_answer_explanation, quality_warnings, diagnostic_eligible,
          contains_above_level_language, analysis_confidence, provider, model,
          raw_analysis, rule_signature, rule_signature_version,
          rule_signature_confidence, rule_signature_reviewed, analyzed_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,
          $17::jsonb,$18::jsonb,$19,$20::jsonb,$21,$22,$23,$24,$25,$26::jsonb,
          $27,$28,$29,$30,NOW(),NOW()
        ) ON CONFLICT (question_id) DO UPDATE SET
          schema_version=EXCLUDED.schema_version, prompt_version=EXCLUDED.prompt_version,
          analysis_version=EXCLUDED.analysis_version, status=EXCLUDED.status,
          estimated_level=EXCLUDED.estimated_level, level_confidence=EXCLUDED.level_confidence,
          level_evidence=EXCLUDED.level_evidence, main_skill_id=EXCLUDED.main_skill_id,
          topic_id=EXCLUDED.topic_id, subskill_id=EXCLUDED.subskill_id,
          micro_skill_id=EXCLUDED.micro_skill_id, taxonomy_confidence=EXCLUDED.taxonomy_confidence,
          question_type=EXCLUDED.question_type, cognitive_task=EXCLUDED.cognitive_task,
          grammar_structure=EXCLUDED.grammar_structure, required_vocabulary=EXCLUDED.required_vocabulary,
          prerequisite_skill_ids=EXCLUDED.prerequisite_skill_ids,
          correct_answer_explanation=EXCLUDED.correct_answer_explanation,
          quality_warnings=EXCLUDED.quality_warnings, diagnostic_eligible=EXCLUDED.diagnostic_eligible,
          contains_above_level_language=EXCLUDED.contains_above_level_language,
          analysis_confidence=EXCLUDED.analysis_confidence, provider=EXCLUDED.provider,
          model=EXCLUDED.model, raw_analysis=EXCLUDED.raw_analysis,
          rule_signature=EXCLUDED.rule_signature,
          rule_signature_version=EXCLUDED.rule_signature_version,
          rule_signature_confidence=EXCLUDED.rule_signature_confidence,
          rule_signature_reviewed=EXCLUDED.rule_signature_reviewed,
          last_error=NULL, analyzed_at=NOW(), updated_at=NOW()`,
        [
          question.id, analysis.schema_version || "question_analysis_v1",
          analysis.prompt_version || (analysis.schema_version === "question_analysis_v2"
            ? TARGET_ANALYSIS_PROMPT_VERSION : "question_analysis_prompt_v1"),
          version, status,
          analysis.estimated_level, analysis.level_confidence, JSON.stringify(analysis.level_evidence || []),
          analysis.main_skill_id, analysis.topic_id, analysis.subskill_id, analysis.micro_skill_id,
          analysis.taxonomy_confidence, analysis.question_type, analysis.cognitive_task,
          analysis.grammar_structure, JSON.stringify(analysis.required_vocabulary || []),
          JSON.stringify(analysis.prerequisite_skill_ids || []), analysis.correct_answer_explanation,
          JSON.stringify(analysis.quality_warnings || []), eligible,
          Boolean(analysis.contains_above_level_language), analysis.analysis_confidence,
          provider, model, JSON.stringify(analysis),
          analysis.rule_signature || null, analysis.rule_signature_version || null,
          analysis.rule_signature_confidence == null ? null : analysis.rule_signature_confidence,
          Boolean(analysis.rule_signature_reviewed),
        ]
      );
      await client.query("DELETE FROM question_taxonomy_tags WHERE question_id=$1", [question.id]);
      const tags = [
        [analysis.main_skill_id, "main_skill"], [analysis.topic_id, "topic"],
        [analysis.subskill_id, "subskill"], [analysis.micro_skill_id, "micro_skill"],
      ].filter(([id]) => id);
      for (const [taxonomyId, role] of tags) {
        await client.query(
          `INSERT INTO question_taxonomy_tags
           (question_id, taxonomy_id, tag_role, confidence, source) VALUES ($1,$2,$3,$4,$5)`,
          [question.id, taxonomyId, role, analysis.taxonomy_confidence, source]
        );
      }
      const suggestion = analysis.taxonomy_suggestion;
      if (suggestion && ["topic", "subskill", "micro_skill"].includes(suggestion.node_type)
          && text(suggestion.name)) {
        await client.query(
          `INSERT INTO taxonomy_suggestions
           (question_id, suggested_node_type, suggested_name, suggested_parent_id, reason, confidence)
           SELECT $1,$2,$3,$4,$5,$6
           WHERE NOT EXISTS (
             SELECT 1 FROM taxonomy_suggestions
             WHERE question_id=$1 AND suggested_node_type=$2
               AND LOWER(suggested_name)=LOWER($3) AND status='pending'
           )`,
          [
            question.id, suggestion.node_type, text(suggestion.name).slice(0, 160),
            suggestion.parent_id || null, text(suggestion.reason).slice(0, 1000) || null,
            clampConfidence(suggestion.confidence, 0.5),
          ]
        );
      }
      await client.query("DELETE FROM question_distractor_analysis WHERE question_id=$1", [question.id]);
      for (const distractor of analysis.distractors || []) {
        await client.query(
          `INSERT INTO question_distractor_analysis
           (question_id, option_code, error_code, likely_reason, confidence, source)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [question.id, distractor.option, distractor.error_code, distractor.likely_reason, distractor.confidence, source]
        );
      }
      const main = tags.length ? await client.query(
        "SELECT legacy_skill FROM learning_taxonomy WHERE id=$1", [analysis.main_skill_id]
      ) : { rows: [] };
      await client.query(
        `UPDATE questions SET cefr_level=$2, skill=COALESCE($3, skill), analysis_status=$4,
         diagnostic_eligible=$5, analysis_version=$6, updated_at=updated_at WHERE id=$1`,
        [question.id, analysis.estimated_level, main.rows[0]?.legacy_skill || null, status, eligible, version]
      );
      await client.query(
        `UPDATE student_answer_events e SET
           detected_cefr_level=$2, main_skill_id=$3, topic_id=$4,
           subskill_id=$5, micro_skill_id=$6,
           selected_distractor_error_code=CASE WHEN e.is_correct THEN NULL ELSE (
             SELECT d.error_code FROM question_distractor_analysis d
             WHERE d.question_id=e.question_id AND d.option_code=e.selected_option
           ) END,
           question_diagnostic_eligible=$7, question_analysis_version=$8,
           updated_at=NOW()
         WHERE e.question_id=$1`,
        [
          question.id, analysis.estimated_level, analysis.main_skill_id, analysis.topic_id,
          analysis.subskill_id, analysis.micro_skill_id, eligible, String(version),
        ]
      );
      await client.query(
        `UPDATE ai_reports SET is_stale=true, stale_at=NOW()
         WHERE is_stale=false AND target_student_id IN (
           SELECT DISTINCT student_id FROM student_answer_events WHERE question_id=$1
         )`,
        [question.id]
      );
      await client.query("COMMIT");
      return { status, diagnostic_eligible: eligible, analysis_version: version };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function analyzeQuestion(questionId, { requireAi = false } = {}) {
    await pool.query(
      `UPDATE question_ai_analysis SET status='ANALYZING', updated_at=NOW() WHERE question_id=$1`,
      [questionId]
    );
    await pool.query(
      `UPDATE questions SET analysis_status='ANALYZING' WHERE id=$1`,
      [questionId]
    );
    const questionResult = await pool.query("SELECT * FROM questions WHERE id=$1", [questionId]);
    if (!questionResult.rows.length) throw new Error("Question not found");
    const question = questionResult.rows[0];
    const catalog = await loadCatalog();
    let generated;
    try {
      generated = await aiService.generateQuestionAnalysis(question, catalog);
    } catch (error) {
      if (requireAi) throw error;
      logger.error("Question AI analysis fallback:", error.message);
      generated = { analysis: null, used_ai: false, provider: "fallback", model: "fallback" };
    }
    if (requireAi && (!generated.analysis || !generated.used_ai || generated.ruleSignatureReviewFailed)) {
      const error = new Error("Rule signature backfill uchun to'liq AI tahlili mavjud emas");
      error.code = "RULE_SIGNATURE_AI_REQUIRED";
      throw error;
    }
    const analysis = generated.analysis || buildFallbackAnalysis(question, catalog);
    const source = generated.used_ai ? "ai" : "fallback";
    return persistAnalysis(question, analysis, source, generated.provider, generated.model);
  }

  async function markAnalysisFailure(job, error, failure) {
    const failed = failure.failed;
    await pool.query(
      `UPDATE question_ai_analysis SET status=$2, last_error=$3, updated_at=NOW() WHERE question_id=$1`,
      [Number(job.entity_id), failed ? "ANALYSIS_FAILED" : "ANALYSIS_PENDING", text(error.message).slice(0, 2000)]
    );
    await pool.query(
      "UPDATE questions SET analysis_status=$2 WHERE id=$1",
      [Number(job.entity_id), failed ? "ANALYSIS_FAILED" : "ANALYSIS_PENDING"]
    );
  }

  async function processNext() {
    const job = await claimNext();
    if (!job) return false;
    const requireAi = job.payload && job.payload.reason === "rule_signature_backfill";
    await jobs.execute(job, () => analyzeQuestion(Number(job.entity_id), { requireAi }), {
      metadata: { question_id: Number(job.entity_id) },
      onFailure: (error, failure) => markAnalysisFailure(job, error, failure),
    });
    return true;
  }

  async function processBatchSafe(limit = 5) {
    if (workerBusy) return 0;
    workerBusy = true;
    let processed = 0;
    try {
      while (processed < limit && await processNext()) processed++;
    } catch (error) {
      logger.error("Question analysis worker xatosi:", error.message);
    } finally {
      workerBusy = false;
    }
    return processed;
  }

  function startWorker(intervalMs = 5000) {
    if (workerTimer) return workerTimer;
    setImmediate(() => processBatchSafe(10));
    workerTimer = setInterval(() => processBatchSafe(5), intervalMs);
    if (typeof workerTimer.unref === "function") workerTimer.unref();
    return workerTimer;
  }

  function stopWorker() {
    if (workerTimer) clearInterval(workerTimer);
    workerTimer = null;
  }

  async function getAnalysis(questionId) {
    const analysis = await pool.query(
      `SELECT a.*, ms.name AS main_skill_name, t.name AS topic_name,
              ss.name AS subskill_name, mi.name AS micro_skill_name,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', prerequisite.id,
                  'name', prerequisite.name,
                  'node_type', prerequisite.node_type
                ) ORDER BY prerequisite.name)
                FROM learning_taxonomy prerequisite
                WHERE prerequisite.id IN (
                  SELECT value::bigint
                  FROM jsonb_array_elements_text(COALESCE(a.prerequisite_skill_ids, '[]'::jsonb))
                )
              ), '[]'::jsonb) AS prerequisites
       FROM question_ai_analysis a
       LEFT JOIN learning_taxonomy ms ON ms.id=a.main_skill_id
       LEFT JOIN learning_taxonomy t ON t.id=a.topic_id
       LEFT JOIN learning_taxonomy ss ON ss.id=a.subskill_id
       LEFT JOIN learning_taxonomy mi ON mi.id=a.micro_skill_id
       WHERE a.question_id=$1`,
      [questionId]
    );
    if (!analysis.rows.length) return null;
    const distractors = await pool.query(
      `SELECT option_code, error_code, likely_reason, confidence, source
       FROM question_distractor_analysis WHERE question_id=$1 ORDER BY option_code`,
      [questionId]
    );
    const overrides = await pool.query(
      `SELECT field_name, original_value, override_value, reason, override_author, created_at
       FROM question_analysis_overrides WHERE question_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [questionId]
    );
    return { ...analysis.rows[0], distractors: distractors.rows, overrides: overrides.rows };
  }

  async function listReviewQueue({ filter = "all", limit = 25, offset = 0 } = {}) {
    const normalizedFilter = text(filter).toLowerCase() || "all";
    if (!REVIEW_QUEUE_FILTERS.has(normalizedFilter)) {
      throw new QuestionAnalysisReviewValidationError("Review navbati filtri noto'g'ri");
    }
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 25, 1), 100);
    const safeOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);
    const quarantined = quarantinedRuleSignatures();
    const quarantineCondition = `(a.rule_signature=ANY($1::text[])
      OR a.raw_analysis->>'rule_signature_candidate'=ANY($1::text[]))`;
    const filterConditions = {
      all: `(a.status='REVIEW_REQUIRED'
        OR COALESCE(a.rule_signature_reviewed,false)=false
        OR ${quarantineCondition})`,
      unreviewed: "COALESCE(a.rule_signature_reviewed,false)=false",
      review_required: "a.status='REVIEW_REQUIRED'",
      quarantined: quarantineCondition,
    };
    const result = await pool.query(
      `SELECT q.id AS question_id, q.question_text, q.correct_option, q.cefr_level, q.skill,
              a.status, a.estimated_level, a.analysis_confidence, a.rule_signature,
              a.rule_signature_version, a.rule_signature_confidence,
              COALESCE(a.rule_signature_reviewed,false) AS rule_signature_reviewed,
              a.raw_analysis->>'rule_signature_candidate' AS rule_signature_candidate,
              ${quarantineCondition} AS rule_signature_quarantined,
              t.name AS topic_name, a.updated_at, COUNT(*) OVER() AS total_count
       FROM question_ai_analysis a
       JOIN questions q ON q.id=a.question_id
       LEFT JOIN learning_taxonomy t ON t.id=a.topic_id
       WHERE ${filterConditions[normalizedFilter]}
       ORDER BY ${quarantineCondition} DESC,
                (a.status='REVIEW_REQUIRED') DESC,
                COALESCE(a.rule_signature_reviewed,false) ASC,
                a.updated_at DESC, q.id ASC
       LIMIT $2 OFFSET $3`,
      [quarantined, safeLimit, safeOffset]
    );
    const total = result.rows.length ? Number(result.rows[0].total_count) : 0;
    const items = result.rows.map(({ total_count: ignoredTotal, ...item }) => item);
    return { items, total, filter: normalizedFilter, limit: safeLimit, offset: safeOffset };
  }

  async function review(questionId, review = {}, author) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query(
        `SELECT status, estimated_level, diagnostic_eligible, rule_signature,
                rule_signature_version, rule_signature_confidence, rule_signature_reviewed
         FROM question_ai_analysis WHERE question_id=$1 FOR UPDATE`,
        [questionId]
      );
      if (!locked.rows.length) {
        await client.query("ROLLBACK");
        return null;
      }
      const current = locked.rows[0];
      const status = VALID_STATUSES.has(review.status) ? review.status : current.status;
      const eligible = review.diagnostic_eligible == null
        ? current.diagnostic_eligible : Boolean(review.diagnostic_eligible);
      const level = VALID_LEVELS.has(review.estimated_level) ? review.estimated_level : current.estimated_level;
      const signature = resolveRuleSignatureOverride(current, review);
      await client.query(
        `INSERT INTO question_analysis_overrides
         (question_id, field_name, original_value, override_value, reason, override_author)
         VALUES ($1,'admin_review',$2::jsonb,$3::jsonb,$4,$5)`,
        [
          questionId,
          JSON.stringify({
            status: current.status,
            estimated_level: current.estimated_level,
            diagnostic_eligible: current.diagnostic_eligible,
            rule_signature: current.rule_signature,
            rule_signature_version: current.rule_signature_version,
            rule_signature_confidence: current.rule_signature_confidence,
            rule_signature_reviewed: current.rule_signature_reviewed,
          }),
          JSON.stringify({
            status,
            estimated_level: level,
            diagnostic_eligible: eligible,
            rule_signature_action: signature.action,
            rule_signature: signature.rule_signature,
            rule_signature_version: signature.rule_signature_version,
            rule_signature_confidence: signature.rule_signature_confidence,
            rule_signature_reviewed: signature.rule_signature_reviewed,
          }),
          text(review.reason).slice(0, 1000) || null,
          text(author).slice(0, 120) || "Admin",
        ]
      );
      await client.query(
        `UPDATE question_ai_analysis SET status=$2, estimated_level=$3,
         diagnostic_eligible=$4, rule_signature=$5, rule_signature_version=$6,
         rule_signature_confidence=$7, rule_signature_reviewed=$8,
         updated_at=NOW() WHERE question_id=$1`,
        [
          questionId, status, level, eligible, signature.rule_signature,
          signature.rule_signature_version, signature.rule_signature_confidence,
          signature.rule_signature_reviewed,
        ]
      );
      await client.query(
        `UPDATE questions SET analysis_status=$2, cefr_level=$3,
         diagnostic_eligible=$4 WHERE id=$1`,
        [questionId, status, level, eligible]
      );
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        logger.error("Savol analysis review rollback xatosi:", rollbackError.message);
      }
      throw error;
    } finally {
      client.release();
    }
    return getAnalysis(questionId);
  }

  return {
    enqueue, enqueueSafe, backfillRuleSignatures, analyzeQuestion, processNext, processBatchSafe,
    startWorker, stopWorker, getAnalysis, listReviewQueue, review, loadCatalog,
  };
}

module.exports = {
  createQuestionAnalysisService,
  buildFallbackAnalysis,
  analysisStatus,
  detectTaxonomy,
  SERIOUS_WARNINGS,
  resolveRuleSignatureOverride,
  QuestionAnalysisReviewValidationError,
};
