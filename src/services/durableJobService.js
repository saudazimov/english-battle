class JobTimeoutError extends Error {
  constructor(jobType, timeoutMs) {
    super(`${jobType} job ${timeoutMs} ms ichida yakunlanmadi`);
    this.name = "JobTimeoutError";
    this.code = "JOB_TIMEOUT";
  }
}

function errorDetails(error) {
  return {
    code: String(error && (error.code || error.name) || "JOB_FAILED").slice(0, 100),
    message: String(error && error.message ? error.message : error).slice(0, 2000),
  };
}

function createDurableJobService({
  pool,
  jobType,
  logger = console,
  lockTimeoutMs = 300000,
  executionTimeoutMs = 120000,
  retryDelayMs = (retryCount) => 30000 * (2 ** Math.min(retryCount, 10)),
}) {
  if (!pool || !jobType) throw new Error("Durable job service uchun pool va jobType majburiy");

  async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function logEvent(db, job, eventType, metadata = {}, error = null, latencyMs = null) {
    const details = error ? errorDetails(error) : { code: null, message: null };
    await db.query(
      `INSERT INTO ai_generation_logs
         (generation_job_id,event_type,attempt_number,latency_ms,error_code,error_message,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [job.id, eventType, Number(job.retry_count || 0) + 1, latencyMs,
        details.code, details.message, JSON.stringify({ job_type: jobType, ...metadata })]
    );
  }

  async function enqueue({ entityType, entityId, payload = {}, idempotencyKey, maxRetries = 3 }) {
    return transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO ai_generation_jobs
           (job_type,entity_type,entity_id,payload,max_retries,idempotency_key)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6)
         ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
        [jobType, entityType, String(entityId), JSON.stringify(payload), maxRetries, idempotencyKey]
      );
      const job = inserted.rows[0] || null;
      if (job) await logEvent(client, job, "queued", { entity_type: entityType });
      return job;
    });
  }

  async function claimNext() {
    return transaction(async (client) => {
      const selected = await client.query(
        `SELECT * FROM ai_generation_jobs
         WHERE job_type=$1 AND retry_count < max_retries
           AND ((status='pending' AND run_after <= NOW())
             OR (status='running' AND locked_at < NOW() - ($2::bigint * INTERVAL '1 millisecond')))
         ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [jobType, lockTimeoutMs]
      );
      if (!selected.rows.length) return null;
      const updated = await client.query(
        `UPDATE ai_generation_jobs
         SET status='running',locked_at=NOW(),completed_at=NULL,updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [selected.rows[0].id]
      );
      const job = updated.rows[0];
      await logEvent(client, job, "started", { recovered_stale_lock: selected.rows[0].status === "running" });
      return job;
    });
  }

  async function complete(job, metadata = {}, latencyMs = null) {
    return transaction(async (client) => {
      const updated = await client.query(
        `UPDATE ai_generation_jobs SET status='completed',completed_at=NOW(),locked_at=NULL,
           last_error=NULL,updated_at=NOW() WHERE id=$1 AND status='running' RETURNING *`,
        [job.id]
      );
      if (!updated.rows.length) return false;
      await logEvent(client, updated.rows[0], "completed", metadata, null, latencyMs);
      return true;
    });
  }

  async function fail(job, error, metadata = {}, latencyMs = null) {
    const nextRetry = Number(job.retry_count || 0) + 1;
    const failed = nextRetry >= Number(job.max_retries || 3);
    const delayMs = failed ? 0 : Math.max(0, Number(retryDelayMs(nextRetry)) || 0);
    const details = errorDetails(error);
    return transaction(async (client) => {
      const updated = await client.query(
        `UPDATE ai_generation_jobs SET status=$2,retry_count=$3,last_error=$4,locked_at=NULL,
           run_after=NOW()+($5::bigint * INTERVAL '1 millisecond'),updated_at=NOW()
         WHERE id=$1 AND status='running' RETURNING *`,
        [job.id, failed ? "failed" : "pending", nextRetry, details.message, delayMs]
      );
      if (!updated.rows.length) return { updated: false, failed };
      const attemptedJob = { ...updated.rows[0], retry_count: Number(job.retry_count || 0) };
      await logEvent(client, attemptedJob, failed ? "failed" : "retry_scheduled",
        { ...metadata, retry_delay_ms: delayMs }, error, latencyMs);
      return { updated: true, failed, retryCount: nextRetry, delayMs };
    });
  }

  async function execute(job, handler, hooks = {}) {
    const startedAt = Date.now();
    const abortController = new AbortController();
    let timeout;
    const timeoutPromise = new Promise((resolve, reject) => {
      timeout = setTimeout(() => {
        abortController.abort();
        reject(new JobTimeoutError(jobType, executionTimeoutMs));
      }, executionTimeoutMs);
      if (typeof timeout.unref === "function") timeout.unref();
    });
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => handler({ job, signal: abortController.signal })),
        timeoutPromise,
      ]);
      await complete(job, hooks.metadata, Date.now() - startedAt);
      return result;
    } catch (error) {
      const failure = await fail(job, error, hooks.metadata, Date.now() - startedAt);
      if (hooks.onFailure) {
        try {
          await hooks.onFailure(error, failure);
        } catch (hookError) {
          error.failureHookError = hookError;
          logger.error(`${jobType} failure hook xatosi:`, hookError.message);
        }
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return { enqueue, claimNext, complete, fail, execute };
}

module.exports = { JobTimeoutError, createDurableJobService };
