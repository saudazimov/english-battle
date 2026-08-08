const DETECTOR_VERSION = "pattern_detection_v1";
const TIMED_MODES = new Set(["battle", "placement_exam", "level_exam", "class_exam", "targeted_retest", "spaced_review"]);

const DEFAULT_PATTERN_CONFIG = Object.freeze({
  repeated_error_min: 3,
  repeated_distractor_min: 2,
  timeout_min: 2,
  fast_error_min: 2,
  fast_response_ratio: 0.25,
  comparison_min_attempts: 3,
  accuracy_gap: 35,
  weak_accuracy: 50,
  strong_accuracy: 75,
  prerequisite_mastery: 60,
  prerequisite_confidence: 40,
});

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function safeCode(value) {
  return String(value || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9_]+/g, "_").slice(0, 100);
}

function percentage(correct, total) {
  return total ? (Number(correct) / Number(total)) * 100 : 0;
}

function grouped(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function evidenceState(count, questions, sessions, formats) {
  if (count >= 3 && questions >= 3 && (sessions >= 2 || formats >= 2)) return "CONFIRMED";
  if (count >= 3 && questions >= 3) return "LIKELY";
  if (count >= 2) return "SUSPECTED";
  return "OBSERVED";
}

function findingConfidence(rows) {
  const questions = new Set(rows.map((row) => row.question_key)).size;
  const sessions = new Set(rows.map((row) => `${row.source_mode}:${row.source_record_id}`)).size;
  const formats = new Set(rows.map((row) => row.question_type || "unknown")).size;
  const quality = rows.reduce((sum, row) => sum + Number(row.analysis_quality || 0.7), 0) / Math.max(1, rows.length);
  return Math.round(clamp01(Math.min(1, rows.length / 5) * 0.4 + Math.min(1, questions / 4) * 0.2
    + Math.min(1, sessions / 3) * 0.15 + Math.min(1, formats / 3) * 0.1 + quality * 0.15) * 10000) / 10000;
}

function makeFinding(code, type, rows, options = {}) {
  const questions = new Set(rows.map((row) => row.question_key)).size;
  const sessions = new Set(rows.map((row) => `${row.source_mode}:${row.source_record_id}`)).size;
  const formats = new Set(rows.map((row) => row.question_type || "unknown")).size;
  const count = rows.length;
  const state = options.state || evidenceState(count, questions, sessions, formats);
  const errorRate = Number(options.errorRate == null ? 100 : options.errorRate);
  const severity = options.severity || (state === "REGRESSED" || errorRate >= 70 ? "high" : count >= 3 ? "medium" : "low");
  return {
    findingCode: safeCode(code),
    findingType: type,
    classification: options.classification || "REPEATED_ERROR",
    severity,
    confidence: options.confidence == null ? findingConfidence(rows) : clamp01(options.confidence),
    state,
    occurrenceCount: count,
    evidence: {
      attempts: Number(options.attempts || count), incorrect: count,
      distinct_questions: questions, sessions, formats: Array.from(new Set(rows.map((row) => row.question_type || "unknown"))),
      source_modes: Array.from(new Set(rows.map((row) => row.source_mode))),
      error_rate: Math.round(errorRate), ...(options.evidence || {}),
    },
    recommendedAction: options.action || (state === "CONFIRMED" ? "CREATE_REMEDIATION" : "COLLECT_MORE_EVIDENCE"),
  };
}

function classifyError(event, context, repeatedCodes) {
  const expected = Number(context.expectedResponseTimeMs || 20000);
  const response = Number(event.response_time_ms || 0);
  if (event.timed_out) return { classification: "TIME_PRESSURE_ERROR", confidence: 0.95 };
  if (event.selected_distractor_error_code && repeatedCodes.get(event.selected_distractor_error_code) >= 2) {
    return { classification: "MISCONCEPTION", confidence: 0.9 };
  }
  if (response > 0 && response <= expected * context.config.fast_response_ratio) {
    return { classification: "GUESSING", confidence: 0.75 };
  }
  if (Number(event.change_count || 0) >= 2) return { classification: "INSTRUCTION_MISREAD", confidence: 0.65 };
  if (event.answer_changed && response > 0 && response <= expected * 0.5) {
    return { classification: "CARELESS_ERROR", confidence: 0.6 };
  }
  const skill = String(event.main_skill_name || "").toLowerCase();
  if (skill.includes("vocabulary")) return { classification: "VOCABULARY_GAP", confidence: 0.7 };
  if (skill.includes("reading")) return { classification: "READING_COMPREHENSION_GAP", confidence: 0.7 };
  if (event.hint_used) return { classification: "PARTIAL_UNDERSTANDING", confidence: 0.65 };
  return { classification: "KNOWLEDGE_GAP", confidence: 0.6 };
}

function comparisonFinding(groupA, groupB, config, options) {
  if (groupA.length < config.comparison_min_attempts || groupB.length < config.comparison_min_attempts) return null;
  const accuracyA = percentage(groupA.filter((row) => row.is_correct).length, groupA.length);
  const accuracyB = percentage(groupB.filter((row) => row.is_correct).length, groupB.length);
  if (accuracyA < config.strong_accuracy || accuracyB > config.weak_accuracy || accuracyA - accuracyB < config.accuracy_gap) return null;
  return makeFinding(options.code, options.type, groupB.filter((row) => !row.is_correct), {
    attempts: groupB.length, errorRate: 100 - accuracyB,
    classification: options.classification, action: options.action,
    evidence: { strong_group_accuracy: Math.round(accuracyA), weak_group_accuracy: Math.round(accuracyB) },
  });
}

function detectLearningPatterns(events, context = {}, inputConfig = {}) {
  const config = { ...DEFAULT_PATTERN_CONFIG, ...inputConfig };
  const reliable = (events || []).filter((event) => event.question_diagnostic_eligible !== false);
  const errors = reliable.filter((event) => !event.is_correct);
  const findings = [];
  const errorCodeGroups = grouped(errors.filter((event) => event.selected_distractor_error_code), (event) => event.selected_distractor_error_code);
  const repeatedCodes = new Map(Array.from(errorCodeGroups, ([code, rows]) => [code, rows.length]));
  const classifiedErrors = errors.map((event) => ({ ...event, ...classifyError(event, { ...context, config }, repeatedCodes) }));

  if (errors.length >= config.repeated_error_min) {
    findings.push(makeFinding(`${context.taxonomyLevel || "skill"}_recurring_errors`, "RECURRING_ERRORS", errors, {
      attempts: reliable.length, errorRate: 100 - percentage(reliable.length - errors.length, reliable.length),
    }));
  }
  for (const [code, rows] of errorCodeGroups) {
    if (rows.length >= config.repeated_distractor_min) {
      findings.push(makeFinding(`${code}_repeated`, "REPEATED_DISTRACTOR", rows, {
        classification: "MISCONCEPTION", action: "CREATE_TARGETED_PRACTICE",
        evidence: { distractor_error_code: code },
      }));
    }
  }
  const recurringRuleCodes = Array.from(errorCodeGroups.values()).filter((rows) => rows.length >= 2);
  if (recurringRuleCodes.length >= 2) {
    findings.push(makeFinding("related_rule_confusion", "RELATED_RULE_CONFUSION", recurringRuleCodes.flat(), {
      classification: "MISCONCEPTION", action: "CREATE_CONTRAST_LESSON",
    }));
  }

  const timed = reliable.filter((row) => TIMED_MODES.has(row.source_mode));
  const untimed = reliable.filter((row) => !TIMED_MODES.has(row.source_mode));
  const timedFinding = comparisonFinding(untimed, timed, config, {
    code: "timed_performance_gap", type: "TIMED_VS_UNTIMED", classification: "TIME_PRESSURE_ERROR", action: "PRACTICE_TIMED_GRADUALLY",
  });
  if (timedFinding) findings.push(timedFinding);

  const direct = reliable.filter((row) => ["gap_fill", "multiple_choice"].includes(row.question_type));
  const contextual = reliable.filter((row) => !["gap_fill", "multiple_choice", null, undefined].includes(row.question_type));
  const transferFinding = comparisonFinding(direct, contextual, config, {
    code: "context_transfer_gap", type: "DIRECT_VS_CONTEXT", classification: "PARTIAL_UNDERSTANDING", action: "CREATE_TRANSFER_PRACTICE",
  });
  if (transferFinding) findings.push(transferFinding);
  const immediateRetest = reliable.filter((row) => ["personalized_lesson", "targeted_retest"].includes(row.source_mode));
  const delayedReview = reliable.filter((row) => row.source_mode === "spaced_review");
  const retentionFinding = comparisonFinding(immediateRetest, delayedReview, config, {
    code: "delayed_retention_gap", type: "DELAYED_RETENTION_GAP",
    classification: "PARTIAL_UNDERSTANDING", action: "SHORTEN_REVIEW_INTERVAL",
  });
  if (retentionFinding) findings.push(retentionFinding);

  const fastErrors = errors.filter((row) => Number(row.response_time_ms || 0) > 0
    && Number(row.response_time_ms) <= Number(context.expectedResponseTimeMs || 20000) * config.fast_response_ratio);
  if (fastErrors.length >= config.fast_error_min) findings.push(makeFinding("fast_incorrect_answers", "FAST_INCORRECT", fastErrors, {
    classification: "GUESSING", action: "SLOW_DOWN_AND_VERIFY",
  }));
  const timeouts = errors.filter((row) => row.timed_out);
  if (timeouts.length >= config.timeout_min) findings.push(makeFinding("repeated_timeouts", "REPEATED_TIMEOUT", timeouts, {
    classification: "TIME_PRESSURE_ERROR", action: "BUILD_FLUENCY_UNTIMED",
  }));

  for (const [format, rows] of grouped(reliable, (row) => row.question_type || "unknown")) {
    const formatErrors = rows.filter((row) => !row.is_correct);
    if (rows.length >= config.comparison_min_attempts && percentage(rows.length - formatErrors.length, rows.length) <= config.weak_accuracy) {
      findings.push(makeFinding(`format_${format}_weakness`, "QUESTION_FORMAT_WEAKNESS", formatErrors, {
        attempts: rows.length, errorRate: percentage(formatErrors.length, rows.length),
        classification: "QUESTION_FORMAT_WEAKNESS", action: "PRACTICE_QUESTION_FORMAT", evidence: { question_format: format },
      }));
    }
  }

  const modeGroups = Array.from(grouped(reliable, (row) => row.source_mode).entries())
    .filter(([, rows]) => rows.length >= config.comparison_min_attempts)
    .map(([mode, rows]) => ({ mode, rows, accuracy: percentage(rows.filter((row) => row.is_correct).length, rows.length) }));
  if (modeGroups.length >= 2) {
    const strongest = modeGroups.reduce((a, b) => a.accuracy >= b.accuracy ? a : b);
    const weakest = modeGroups.reduce((a, b) => a.accuracy <= b.accuracy ? a : b);
    if (strongest.accuracy - weakest.accuracy >= config.accuracy_gap) {
      findings.push(makeFinding("cross_mode_inconsistency", "MODE_INCONSISTENCY", weakest.rows.filter((row) => !row.is_correct), {
        attempts: weakest.rows.length, errorRate: 100 - weakest.accuracy, classification: "PARTIAL_UNDERSTANDING",
        action: "PRACTICE_ACROSS_MODES", evidence: { strongest_mode: strongest.mode, strongest_accuracy: Math.round(strongest.accuracy),
          weakest_mode: weakest.mode, weakest_accuracy: Math.round(weakest.accuracy) },
      }));
    }
  }

  for (const prerequisite of context.prerequisites || []) {
    if (Number(prerequisite.mastery_score || 0) < config.prerequisite_mastery
        && Number(prerequisite.confidence_score || 0) >= config.prerequisite_confidence) {
      findings.push(makeFinding(`prerequisite_${prerequisite.taxonomy_id}_gap`, "PREREQUISITE_GAP", errors, {
        classification: "PREREQUISITE_GAP", severity: "high", action: "REMEDIATE_PREREQUISITE",
        evidence: { prerequisite_id: prerequisite.taxonomy_id, prerequisite_name: prerequisite.name,
          prerequisite_mastery: Number(prerequisite.mastery_score || 0), importance: Number(prerequisite.importance || 1) },
      }));
    }
  }
  if (context.regressionFlag) findings.push(makeFinding("regression_after_mastery", "REGRESSION", errors.slice(-5), {
    classification: "REPEATED_ERROR", severity: "high", state: "REGRESSED", confidence: 0.9, action: "REOPEN_REMEDIATION",
  }));

  return { classifiedErrors, findings };
}

function dominantClassification(classifiedErrors) {
  const counts = new Map();
  for (const item of classifiedErrors) counts.set(item.classification, (counts.get(item.classification) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
}

function createPatternDetectionService({ pool, logger = console }) {
  async function loadConfig() {
    const result = await pool.query("SELECT setting_value FROM system_learning_settings WHERE setting_key='pattern_detection_v1'");
    return { ...DEFAULT_PATTERN_CONFIG, ...(result.rows[0]?.setting_value || {}) };
  }

  async function rebuildSkillPatterns(studentId, taxonomyId, context = {}) {
    const [config, eventResult, prerequisiteResult] = await Promise.all([
      loadConfig(),
      pool.query(
        `SELECT e.*, COALESCE(e.question_id::text,e.source_mode || ':' || e.source_question_id::text) AS question_key,
                a.question_type, COALESCE(a.analysis_confidence,0.70)::float AS analysis_quality,
                ms.name AS main_skill_name,
                COALESCE(e.micro_skill_id,e.subskill_id,e.topic_id,e.main_skill_id)::bigint AS diagnostic_taxonomy_id
         FROM student_answer_events e
         LEFT JOIN question_ai_analysis a ON a.question_id=e.question_id
         LEFT JOIN learning_taxonomy ms ON ms.id=e.main_skill_id
         WHERE e.student_id=$1 AND e.question_diagnostic_eligible=true
           AND $2::bigint = ANY(ARRAY[e.main_skill_id,e.topic_id,e.subskill_id,e.micro_skill_id]::bigint[])
         ORDER BY e.answered_at,e.id`,
        [studentId,taxonomyId]
      ),
      pool.query(
        `SELECT tp.prerequisite_taxonomy_id AS taxonomy_id,tp.importance,t.name,
                p.mastery_score,p.confidence_score
         FROM taxonomy_prerequisites tp
         JOIN learning_taxonomy t ON t.id=tp.prerequisite_taxonomy_id
         LEFT JOIN student_skill_profiles p ON p.student_id=$1 AND p.taxonomy_id=tp.prerequisite_taxonomy_id
         WHERE tp.taxonomy_id=$2`,
        [studentId,taxonomyId]
      ),
    ]);
    const result = detectLearningPatterns(eventResult.rows, { ...context, prerequisites: prerequisiteResult.rows }, config);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE learning_findings SET is_active=false,resolved_at=NOW(),updated_at=NOW()
         WHERE student_id=$1 AND taxonomy_id=$2 AND detector_version=$3 AND is_active=true`,
        [studentId,taxonomyId,DETECTOR_VERSION]
      );
      for (const item of result.classifiedErrors) {
        if (Number(item.diagnostic_taxonomy_id) !== Number(taxonomyId)) continue;
        await client.query(
          `INSERT INTO student_error_events (answer_event_id,student_id,taxonomy_id,system_classification,
             final_classification,classification_confidence,evidence,classifier_version)
           VALUES ($1,$2,$3,$4,$4,$5,$6::jsonb,$7)
           ON CONFLICT (answer_event_id) DO UPDATE SET taxonomy_id=EXCLUDED.taxonomy_id,
             system_classification=EXCLUDED.system_classification,final_classification=EXCLUDED.final_classification,
             classification_confidence=EXCLUDED.classification_confidence,evidence=EXCLUDED.evidence,
             classifier_version=EXCLUDED.classifier_version,updated_at=NOW()`,
          [item.id,studentId,item.diagnostic_taxonomy_id || taxonomyId,item.classification,item.confidence,
            JSON.stringify({ distractor_error_code: item.selected_distractor_error_code || null,
              response_time_ms: item.response_time_ms, timed_out: item.timed_out,
              answer_changed: item.answer_changed, change_count: item.change_count }),DETECTOR_VERSION]
        );
      }
      for (const finding of result.findings) {
        await client.query(
          `INSERT INTO learning_findings (student_id,taxonomy_id,finding_code,finding_type,error_classification,
             severity,confidence,evidence_state,occurrence_count,evidence,recommended_action,detector_version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
           ON CONFLICT (student_id,taxonomy_id,finding_code) DO UPDATE SET finding_type=EXCLUDED.finding_type,
             error_classification=EXCLUDED.error_classification,severity=EXCLUDED.severity,
             confidence=EXCLUDED.confidence,evidence_state=EXCLUDED.evidence_state,
             occurrence_count=EXCLUDED.occurrence_count,evidence=EXCLUDED.evidence,
             recommended_action=EXCLUDED.recommended_action,is_active=true,resolved_at=NULL,
             last_detected_at=NOW(),detector_version=EXCLUDED.detector_version,updated_at=NOW()`,
          [studentId,taxonomyId,finding.findingCode,finding.findingType,finding.classification,
            finding.severity,finding.confidence,finding.state,finding.occurrenceCount,
            JSON.stringify(finding.evidence),finding.recommendedAction,DETECTOR_VERSION]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    const dominant = dominantClassification(result.classifiedErrors);
    return {
      activeFindingCount: result.findings.length,
      dominantClassification: dominant,
      prerequisiteGap: result.findings.some((item) => item.findingType === "PREREQUISITE_GAP"),
      regressionFlag: result.findings.some((item) => item.findingType === "REGRESSION"),
      repeatedMisconceptions: result.findings.filter((item) => item.findingType === "REPEATED_DISTRACTOR")
        .reduce((sum, item) => sum + item.occurrenceCount, 0),
      summary: {
        detector_version: DETECTOR_VERSION,
        finding_codes: result.findings.map((item) => item.findingCode),
        classifications: Array.from(new Set(result.classifiedErrors.map((item) => item.classification))),
      },
    };
  }

  return { loadConfig, rebuildSkillPatterns };
}

module.exports = {
  DETECTOR_VERSION, DEFAULT_PATTERN_CONFIG, TIMED_MODES,
  classifyError, detectLearningPatterns, dominantClassification,
  createPatternDetectionService,
};
