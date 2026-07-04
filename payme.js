// payme.js — Payme Merchant API protokoli (JSON-RPC)
// ============================================================================
// Payme serveri webhook'ga 5 metod yuboradi. Bu modul ularni qayta ishlaydi.
// Hujjat: https://developer.help.paycom.uz/protokol-merchant-api/
//
// XAVFSIZLIK: har so'rov Authorization: Basic <base64(Paycom:KEY)> bilan keladi.
// KEY .env'дан olinadi. Noto'g'ri bo'lsa — -32504 (ruxsat yo'q).
//
// PUL BIRLIGI: Payme TIYIN ishlatadi (1 so'm = 100 tiyin). payments.amount tiyinда.
//
// KALIT KELGANДА: .env ga PAYME_MERCHANT_ID, PAYME_KEY (test), keyin PAYME_KEY (prod).
// ============================================================================

const pool = require("./db");
const premium = require("./premium");

const PAYME_KEY = process.env.PAYME_KEY || "";          // test yoki prod kalit
const PAYME_TEST_KEY = process.env.PAYME_TEST_KEY || ""; // (ixtiyoriy) alohida test kalit

// ===== Payme xato kodlari =====
const ERR = {
  TRANSPORT: -32300,
  PARSE: -32700,
  RPC_METHOD_NOT_FOUND: -32601,
  INSUFFICIENT_PRIVILEGE: -32504,
  INVALID_AMOUNT: -31001,
  ORDER_NOT_FOUND: -31050,        // order topilmadi (bizда -31050..-31099 oralig'i)
  ORDER_AVAILABLE: -31051,        // order to'lovga tayyor emas
  TX_NOT_FOUND: -31003,
  CANT_PERFORM: -31008,           // amalni bajarib bo'lmaydi (holat noto'g'ri)
  CANT_CANCEL: -31007,
};

// state qiymatlari
const STATE = { CREATED: 1, PERFORMED: 2, CANCELLED: 1 * -1, CANCELLED_AFTER_PERFORM: -2 };

// JSON-RPC xato javobи
function rpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id: id != null ? id : 0,
    error: { code, message: typeof message === "string" ? { ru: message, uz: message, en: message } : message, data },
  };
}
function rpcResult(id, result) {
  return { jsonrpc: "2.0", id: id != null ? id : 0, result };
}

// ===== Authorization tekshiruvi (Basic auth) =====
// Payme: Authorization: Basic base64("Paycom:" + KEY)
function checkAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;
  const key = PAYME_KEY || PAYME_TEST_KEY;
  if (!key) return false; // kalit sozlanmagan
  try {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    // format: "Paycom:KEY"
    const idx = decoded.indexOf(":");
    if (idx === -1) return false;
    const passedKey = decoded.slice(idx + 1);
    return passedKey === key;
  } catch (e) {
    return false;
  }
}

// ===== Asosiy router: metodni aniqlaydi va bajaradi =====
async function handlePaymeRequest(body, authHeader) {
  // 1. Avtorizatsiya
  if (!checkAuth(authHeader)) {
    return rpcError(body && body.id, ERR.INSUFFICIENT_PRIVILEGE, "Ruxsat yo'q");
  }
  if (!body || !body.method) {
    return rpcError(body && body.id, ERR.RPC_METHOD_NOT_FOUND, "Metod yo'q");
  }

  const { method, params, id } = body;
  try {
    switch (method) {
      case "CheckPerformTransaction": return await checkPerform(id, params);
      case "CreateTransaction": return await createTransaction(id, params);
      case "PerformTransaction": return await performTransaction(id, params);
      case "CancelTransaction": return await cancelTransaction(id, params);
      case "CheckTransaction": return await checkTransaction(id, params);
      case "GetStatement": return await getStatement(id, params);
      default: return rpcError(id, ERR.RPC_METHOD_NOT_FOUND, "Metod topilmadi: " + method);
    }
  } catch (e) {
    console.error("[Payme] " + method + " xatosi:", e.message);
    return rpcError(id, ERR.TRANSPORT, "Server xatosi");
  }
}

// order'ни params.account'dan topish. Biz account.payment_id ishlatamiz.
async function findPayment(params) {
  const account = params && params.account;
  if (!account || !account.payment_id) return { error: "no_account" };
  const pid = parseInt(account.payment_id, 10);
  if (isNaN(pid)) return { error: "bad_id" };
  const r = await pool.query("SELECT * FROM payments WHERE id = $1", [pid]);
  if (r.rows.length === 0) return { error: "not_found" };
  return { payment: r.rows[0] };
}

// ===== 1. CheckPerformTransaction =====
async function checkPerform(id, params) {
  const f = await findPayment(params);
  if (f.error) return rpcError(id, ERR.ORDER_NOT_FOUND, "Order topilmadi");
  const p = f.payment;
  // Summa mosligi (tiyin)
  if (parseInt(params.amount) !== parseInt(p.amount)) {
    return rpcError(id, ERR.INVALID_AMOUNT, "Noto'g'ri summa");
  }
  // Allaqachon to'langan bo'lsa — qayta to'lab bo'lmaydi
  if (p.status === "paid") {
    return rpcError(id, ERR.ORDER_AVAILABLE, "Order allaqachon to'langan");
  }
  return rpcResult(id, { allow: true });
}

// ===== 2. CreateTransaction =====
async function createTransaction(id, params) {
  const txId = params.id; // Payme'ning transaction id
  // Bu tranzaksiya allaqachon yaratilganmi?
  const existing = await pool.query("SELECT * FROM payme_transactions WHERE paycom_transaction_id = $1", [txId]);
  if (existing.rows.length > 0) {
    const tx = existing.rows[0];
    if (tx.state === STATE.CREATED) {
      return rpcResult(id, { create_time: parseInt(tx.create_time), transaction: String(tx.id), state: tx.state });
    }
    return rpcError(id, ERR.CANT_PERFORM, "Tranzaksiya holati noto'g'ri");
  }

  // Yangi tranzaksiya: order tekshiruvi
  const f = await findPayment(params);
  if (f.error) return rpcError(id, ERR.ORDER_NOT_FOUND, "Order topilmadi");
  const p = f.payment;
  if (parseInt(params.amount) !== parseInt(p.amount)) {
    return rpcError(id, ERR.INVALID_AMOUNT, "Noto'g'ri summa");
  }
  if (p.status === "paid") {
    return rpcError(id, ERR.ORDER_AVAILABLE, "Order allaqachon to'langan");
  }

  const createTime = Date.now();
  const ins = await pool.query(
    `INSERT INTO payme_transactions (paycom_transaction_id, payment_id, paycom_time, amount, state, create_time)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [txId, p.id, params.time || createTime, p.amount, STATE.CREATED, createTime]
  );
  return rpcResult(id, { create_time: createTime, transaction: String(ins.rows[0].id), state: STATE.CREATED });
}

// ===== 3. PerformTransaction (to'lov amalga oshdi → obuna ber) =====
async function performTransaction(id, params) {
  const txRes = await pool.query("SELECT * FROM payme_transactions WHERE paycom_transaction_id = $1", [params.id]);
  if (txRes.rows.length === 0) return rpcError(id, ERR.TX_NOT_FOUND, "Tranzaksiya topilmadi");
  const tx = txRes.rows[0];

  if (tx.state === STATE.PERFORMED) {
    // Allaqachon bajarilgan — idempotent javob
    return rpcResult(id, { transaction: String(tx.id), perform_time: parseInt(tx.perform_time), state: STATE.PERFORMED });
  }
  if (tx.state !== STATE.CREATED) {
    return rpcError(id, ERR.CANT_PERFORM, "Tranzaksiyani bajarib bo'lmaydi");
  }

  const performTime = Date.now();
  // Tranzaksiyani performed qilamiz
  await pool.query(
    "UPDATE payme_transactions SET state = $1, perform_time = $2, updated_at = NOW() WHERE id = $3",
    [STATE.PERFORMED, performTime, tx.id]
  );
  // Payment'ни paid qilamiz + obuna beramiz
  const pRes = await pool.query("SELECT * FROM payments WHERE id = $1", [tx.payment_id]);
  if (pRes.rows.length > 0) {
    const p = pRes.rows[0];
    await pool.query("UPDATE payments SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = $1", [p.id]);
    // Obuna ber (grantSubscription — premium.js)
    try {
      await premium.grantSubscription(p.user_id, p.plan, (p.months || 1) * 30);
      console.log(`[Payme] To'lov muvaffaqiyatli: user ${p.user_id}, ${p.plan}, ${p.months} oy`);
    } catch (e) {
      console.error("[Payme] Obuna berishда xato:", e.message);
    }
  }
  return rpcResult(id, { transaction: String(tx.id), perform_time: performTime, state: STATE.PERFORMED });
}

// ===== 4. CancelTransaction =====
async function cancelTransaction(id, params) {
  const txRes = await pool.query("SELECT * FROM payme_transactions WHERE paycom_transaction_id = $1", [params.id]);
  if (txRes.rows.length === 0) return rpcError(id, ERR.TX_NOT_FOUND, "Tranzaksiya topilmadi");
  const tx = txRes.rows[0];

  const cancelTime = Date.now();
  let newState;

  // IDEMPOTENTLIK: faqat HAQIQIY holat o'tishida obunaga tegamiz.
  // Agar tx allaqachon bekor qilingan bo'lsa (refund ikki marta kelsa),
  // tx.state != PERFORMED bo'ladi → revoke qayta chaqirilmaydi.
  const wasPerformedNow = (tx.state === STATE.PERFORMED);

  if (wasPerformedNow) {
    newState = STATE.CANCELLED_AFTER_PERFORM; // -2 (to'lov bajarilgandan keyin qaytarildi)
    await pool.query("UPDATE payments SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [tx.payment_id]);

    // To'lov qaytarildi → premium obunani bekor qilamiz (business rule).
    // revokeSubscription o'zi ham idempotent (faqat 'active' obunaga tegadi).
    try {
      const pRes = await pool.query("SELECT user_id, plan FROM payments WHERE id = $1", [tx.payment_id]);
      if (pRes.rows.length > 0) {
        const p = pRes.rows[0];
        await premium.revokeSubscription(p.user_id, p.plan);
        console.log(`[Payme] Refund → obuna bekor qilindi: user ${p.user_id}, ${p.plan}`);
      }
    } catch (e) {
      // Obuna bekor qilish xatosi Payme javobini BUZMASIN (protokol 200 qaytishi kerak).
      console.error("[Payme] Refund'da obunani bekor qilish xatosi:", e.message);
    }
  } else if (tx.state === STATE.CREATED) {
    newState = STATE.CANCELLED; // -1 (bajarilmasdan bekor qilindi — obuna berilmagan edi)
    await pool.query("UPDATE payments SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [tx.payment_id]);
  } else {
    // Allaqachon bekor qilingan (idempotent qayta chaqiruv) — holatni saqlaymiz
    newState = tx.state;
  }

  await pool.query(
    "UPDATE payme_transactions SET state = $1, reason = $2, cancel_time = $3, updated_at = NOW() WHERE id = $4",
    [newState, params.reason || null, cancelTime, tx.id]
  );
  return rpcResult(id, { transaction: String(tx.id), cancel_time: cancelTime, state: newState });
}

// ===== 5. CheckTransaction =====
async function checkTransaction(id, params) {
  const txRes = await pool.query("SELECT * FROM payme_transactions WHERE paycom_transaction_id = $1", [params.id]);
  if (txRes.rows.length === 0) return rpcError(id, ERR.TX_NOT_FOUND, "Tranzaksiya topilmadi");
  const tx = txRes.rows[0];
  return rpcResult(id, {
    create_time: parseInt(tx.create_time) || 0,
    perform_time: parseInt(tx.perform_time) || 0,
    cancel_time: parseInt(tx.cancel_time) || 0,
    transaction: String(tx.id),
    state: tx.state,
    reason: tx.reason != null ? tx.reason : null,
  });
}

// ===== 6. GetStatement =====
async function getStatement(id, params) {
  const from = params.from, to = params.to;
  const txRes = await pool.query(
    `SELECT pt.*, p.user_id FROM payme_transactions pt
     JOIN payments p ON p.id = pt.payment_id
     WHERE pt.paycom_time >= $1 AND pt.paycom_time <= $2
     ORDER BY pt.paycom_time ASC`,
    [from, to]
  );
  const transactions = txRes.rows.map((tx) => ({
    id: tx.paycom_transaction_id,
    time: parseInt(tx.paycom_time) || 0,
    amount: parseInt(tx.amount),
    account: { payment_id: String(tx.payment_id) },
    create_time: parseInt(tx.create_time) || 0,
    perform_time: parseInt(tx.perform_time) || 0,
    cancel_time: parseInt(tx.cancel_time) || 0,
    transaction: String(tx.id),
    state: tx.state,
    reason: tx.reason != null ? tx.reason : null,
  }));
  return rpcResult(id, { transactions });
}

module.exports = {
  handlePaymeRequest,
  checkAuth,
  ERR,
  STATE,
};