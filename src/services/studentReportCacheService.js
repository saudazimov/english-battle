const crypto = require("crypto");

const REPORT_VERSION = "student_learning_v4";
const SCHEMA_VERSION = "student_report_v2";
const PROMPT_VERSION = "student_report_prompt_v2";
const GENERATION_LOCK_MS = 90_000;
const GENERATION_BUCKET_MS = 60_000;

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
}

function sourceSnapshotHash(snapshot) {
  const period = snapshot && snapshot.period ? snapshot.period : {};
  const periodDate = (value) => {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().slice(0, 10);
  };
  const hashable = {
    ...snapshot,
    period: {
      ...period,
      start: periodDate(period.start),
      end: periodDate(period.end),
    },
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(hashable)))
    .digest("hex");
}

function reportSources(snapshot) {
  const diagnostics = snapshot.learning_diagnostics || {};
  const sources = [];
  for (const [sourceId, count] of Object.entries(diagnostics.sources || {})) {
    if (Number(count) > 0) sources.push({ source_type: "answer_stream", source_id: sourceId });
  }
  for (const profile of diagnostics.skill_profiles || []) {
    if (profile.taxonomy_id != null) {
      sources.push({ source_type: "skill_profile", source_id: String(profile.taxonomy_id) });
    }
  }
  for (const finding of diagnostics.pattern_findings || []) {
    const sourceId = finding.id == null ? finding.finding_code : finding.id;
    if (sourceId != null) sources.push({ source_type: "learning_finding", source_id: String(sourceId) });
  }
  return sources;
}

function createStudentReportCacheService(pool, {
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  waitTimeoutMs = 32_000,
  waitIntervalMs = 250,
} = {}) {
  async function findCached({ studentId, reportType, periodStart, snapshotHash }) {
    const result = await pool.query(
      `SELECT ai_output, input_snapshot, confidence, status, created_at
       FROM ai_reports
       WHERE target_student_id=$1 AND report_type=$2 AND period_start=$3
         AND source_snapshot_hash=$4 AND COALESCE(is_stale, false)=false
         AND report_version=$5 AND schema_version=$6
       ORDER BY created_at DESC LIMIT 1`,
      [studentId, reportType, periodStart, snapshotHash, REPORT_VERSION, SCHEMA_VERSION]
    );
    return result.rows[0] || null;
  }

  async function acquireGeneration({ studentId, reportType, periodStart, periodEnd, snapshotHash }) {
    const bucket = Math.floor(now() / GENERATION_BUCKET_MS);
    const idempotencyKey = [REPORT_VERSION, studentId, reportType, periodStart, snapshotHash, bucket].join(":");
    const payload = JSON.stringify({
      student_id: studentId,
      report_type: reportType,
      period_start: periodStart,
      period_end: periodEnd,
      source_snapshot_hash: snapshotHash,
      report_version: REPORT_VERSION,
      schema_version: SCHEMA_VERSION,
    });
    const inserted = await pool.query(
      `INSERT INTO ai_generation_jobs
         (job_type,entity_type,entity_id,payload,status,locked_at,idempotency_key)
       VALUES ('student_report','student',$1,$2::jsonb,'running',NOW(),$3)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [String(studentId), payload, idempotencyKey]
    );
    if (inserted.rows[0]) return { acquired: true, jobId: inserted.rows[0].id };

    const recovered = await pool.query(
      `UPDATE ai_generation_jobs
       SET status='running', retry_count=retry_count+1, locked_at=NOW(),
           last_error=NULL, updated_at=NOW()
       WHERE idempotency_key=$1
         AND (status='failed' OR (status='running' AND locked_at < NOW() - ($2 * INTERVAL '1 millisecond')))
       RETURNING id`,
      [idempotencyKey, GENERATION_LOCK_MS]
    );
    if (recovered.rows[0]) return { acquired: true, jobId: recovered.rows[0].id };
    return { acquired: false, idempotencyKey };
  }

  async function waitForGeneratedReport(cacheKey) {
    const deadline = now() + waitTimeoutMs;
    while (now() < deadline) {
      const cached = await findCached(cacheKey);
      if (cached) return cached;
      await sleep(waitIntervalMs);
    }
    return null;
  }

  async function saveReport({
    studentId, reportType, periodStart, periodEnd, snapshot, snapshotHash,
    result, jobId,
  }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const saved = await client.query(
        `INSERT INTO ai_reports
           (user_id,target_student_id,report_type,audience,period_start,period_end,
            input_snapshot,ai_output,confidence,status,report_version,schema_version,
            prompt_version,source_snapshot_hash,generation_job_id)
         VALUES ($1,$1,$2,'student',$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id,created_at`,
        [studentId, reportType, periodStart, periodEnd, JSON.stringify(snapshot),
          JSON.stringify(result.report), result.confidence, result.status, REPORT_VERSION,
          SCHEMA_VERSION, PROMPT_VERSION, snapshotHash, jobId]
      );
      const sources = reportSources(snapshot);
      if (sources.length) {
        await client.query(
          `INSERT INTO ai_report_sources (report_id,source_type,source_id,source_snapshot_hash)
           SELECT $1,x.source_type,x.source_id,$3
           FROM jsonb_to_recordset($2::jsonb) AS x(source_type text,source_id text)
           ON CONFLICT (report_id,source_type,source_id) DO NOTHING`,
          [saved.rows[0].id, JSON.stringify(sources), snapshotHash]
        );
      }
      await client.query(
        `UPDATE ai_generation_jobs
         SET status='completed',completed_at=NOW(),updated_at=NOW(),last_error=NULL
         WHERE id=$1`,
        [jobId]
      );
      await client.query("COMMIT");
      return saved.rows[0];
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function failGeneration(jobId, error) {
    if (!jobId) return;
    await pool.query(
      `UPDATE ai_generation_jobs
       SET status='failed',last_error=$2,updated_at=NOW() WHERE id=$1`,
      [jobId, String(error && error.message ? error.message : error).slice(0, 2000)]
    );
  }

  return {
    findCached,
    acquireGeneration,
    waitForGeneratedReport,
    saveReport,
    failGeneration,
  };
}

module.exports = {
  REPORT_VERSION,
  SCHEMA_VERSION,
  PROMPT_VERSION,
  canonicalize,
  sourceSnapshotHash,
  reportSources,
  createStudentReportCacheService,
};
