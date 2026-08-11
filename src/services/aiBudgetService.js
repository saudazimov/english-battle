const AI_BUDGET_LOCK_ID = 441913355;

class AiBudgetExceededError extends Error {
  constructor(message = "AI oylik xarajat limiti tugadi") {
    super(message);
    this.name = "AiBudgetExceededError";
    this.code = "AI_BUDGET_EXCEEDED";
    this.retryable = false;
  }
}

function positiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createAiBudgetService({
  getPool,
  environment = process.env,
  logger = console,
} = {}) {
  const monthlyLimitUsd = positiveNumber(environment.AI_MONTHLY_HARD_LIMIT_USD);
  const reservationTtlMinutes = positiveNumber(environment.AI_BUDGET_RESERVATION_TTL_MINUTES, 15);

  function isEnforced() {
    return monthlyLimitUsd > 0 && typeof getPool === "function";
  }

  async function reserve({ provider, model, estimatedCostUsd, promptVersion, schemaVersion }) {
    if (!isEnforced()) return null;
    const reservedCostUsd = positiveNumber(estimatedCostUsd);
    if (reservedCostUsd <= 0) {
      throw new AiBudgetExceededError("AI narxlari sozlanmagan; hard-limitni xavfsiz tekshirib bo'lmaydi");
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [AI_BUDGET_LOCK_ID]);
      await client.query(
        `DELETE FROM ai_generation_logs
         WHERE event_type='started'
           AND metadata->>'source'='provider_budget_guard'
           AND created_at < NOW() - ($1::text || ' minutes')::interval`,
        [reservationTtlMinutes]
      );
      const usage = await client.query(
        `SELECT COALESCE(SUM(
           CASE
             WHEN event_type='provider_response' THEN (metadata->>'actual_cost_usd')::numeric
             WHEN event_type='started' THEN (metadata->>'reserved_cost_usd')::numeric
             ELSE 0
           END
         ), 0)::numeric AS spent_usd
         FROM ai_generation_logs
         WHERE metadata->>'source'='provider_budget_guard'
           AND created_at >= date_trunc('month', timezone('UTC', CURRENT_TIMESTAMP))`,
        []
      );
      const spentUsd = Number(usage.rows[0].spent_usd || 0);
      if (spentUsd + reservedCostUsd > monthlyLimitUsd) throw new AiBudgetExceededError();
      const inserted = await client.query(
        `INSERT INTO ai_generation_logs
           (event_type, provider, model, input_tokens, output_tokens, metadata)
         VALUES ('started',$1,$2,NULL,NULL,$3::jsonb)
         RETURNING id`,
        [provider, model, JSON.stringify({
          source: "provider_budget_guard",
          reserved_cost_usd: reservedCostUsd,
          prompt_version: promptVersion,
          schema_version: schemaVersion,
        })]
      );
      await client.query("COMMIT");
      return { id: inserted.rows[0].id, reservedCostUsd };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function finalize(reservation, { usage, actualCostUsd }) {
    if (!reservation) return;
    await getPool().query(
      `UPDATE ai_generation_logs
       SET event_type='provider_response', input_tokens=$2, output_tokens=$3,
           metadata=metadata || $4::jsonb
       WHERE id=$1 AND metadata->>'source'='provider_budget_guard'`,
      [reservation.id, Number(usage && usage.input || 0), Number(usage && usage.output || 0), JSON.stringify({
        actual_cost_usd: Math.max(0, Number(actualCostUsd || 0)),
      })]
    );
  }

  async function release(reservation) {
    if (!reservation) return;
    try {
      await getPool().query(
        "DELETE FROM ai_generation_logs WHERE id=$1 AND event_type='started' AND metadata->>'source'='provider_budget_guard'",
        [reservation.id]
      );
    } catch (error) {
      logger.error("AI budget rezervatsiyasini bo'shatish xatosi:", error.message);
    }
  }

  return { isEnforced, reserve, finalize, release };
}

module.exports = { AiBudgetExceededError, createAiBudgetService };
