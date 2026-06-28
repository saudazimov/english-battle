// battleStore.js — Battle live-state persistence (Postgres)
// ----------------------------------------------------------
// MAQSAD: Aktiv janglarni DB'da saqlash — server restart va reconnect uchun.
// QOIDA: RAM (battles{}) = tezkor ishchi nusxa. Postgres = haqiqat manbai.
// KELAJAK: Agar 1000+ parallel jang bo'lsa, FAQAT shu fayl ichi Redis'ga
//          o'zgaradi. server.js'dagi chaqiruvlar (saqlash/o'qish nomlari) tegmaydi.

const pool = require("./db");

// ---- Ichki yordamchi: RAM battle obyektidan DB uchun "state" JSON tayyorlash ----
// DIQQAT: questions massivini state'ga SOLMAYMIZ (correct_option bor — xavfsizlik).
// Faqat o'yinchilar holati saqlanadi. Savollar question_ids orqali alohida ketadi.
function extractState(battle) {
  const players = {};
  for (const key in battle.players) {
    const p = battle.players[key];
    players[key] = {
      userId: p.userId != null ? p.userId : null,
      name: p.name,
      score: p.score || 0,
      finished: !!p.finished,
      answeredCount: p.answeredCount || 0,
      answeredIds: p.answeredIds || {},
      qDeadline: p.qDeadline || null,
      team: p.team || null,
      isBot: !!p.isBot,
      socketId: p.socketId || (typeof key === "string" && key.startsWith("battle") ? null : key),
    };
  }
  return { players: players };
}

// ---- 1. SAQLASH (UPSERT) — jang yaratilganda va har javobdan keyin chaqiriladi ----
async function saveBattleSession(roomId, battle) {
  try {
    const questionIds = (battle.questions || []).map((q) => q.id);
    const state = extractState(battle);
    const battleType = battle.battleType || "1v1"; // 1v1 | duo | squad
    await pool.query(
      `INSERT INTO battle_sessions
         (room_id, mode, battle_type, cefr_level, length_key, question_ids, state, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
       ON CONFLICT (room_id) DO UPDATE
         SET state = EXCLUDED.state,
             status = 'active',
             updated_at = NOW()`,
      [
        roomId,
        battle.mode || "ranked",
        battleType,
        battle.level || null,
        battle.lengthKey || null,
        questionIds,
        JSON.stringify(state),
      ]
    );
  } catch (err) {
    // Persistence xatosi jangni TO'XTATMASLIGI kerak — faqat log.
    console.error("saveBattleSession xato (" + roomId + "):", err.message);
  }
}

// ---- 2. O'QISH (bitta jang) — reconnect tekshiruvida kerak bo'lishi mumkin ----
async function loadBattleSession(roomId) {
  try {
    const res = await pool.query(
      "SELECT * FROM battle_sessions WHERE room_id = $1 AND status = 'active'",
      [roomId]
    );
    return res.rows[0] || null;
  } catch (err) {
    console.error("loadBattleSession xato (" + roomId + "):", err.message);
    return null;
  }
}

// ---- 3. O'CHIRISH (yoki finished belgilash) — jang tugaganda ----
// Audit uchun o'chirmasdan status='finished' qilamiz (afzal).
async function finishBattleSession(roomId) {
  try {
    await pool.query(
      "UPDATE battle_sessions SET status = 'finished', updated_at = NOW() WHERE room_id = $1",
      [roomId]
    );
  } catch (err) {
    console.error("finishBattleSession xato (" + roomId + "):", err.message);
  }
}

// ---- 4. BARCHA AKTIVNI O'QISH — server START'da restart recovery uchun ----
async function loadActiveSessions() {
  try {
    const res = await pool.query(
      "SELECT * FROM battle_sessions WHERE status = 'active' ORDER BY updated_at DESC"
    );
    return res.rows;
  } catch (err) {
    console.error("loadActiveSessions xato:", err.message);
    return [];
  }
}

module.exports = {
  saveBattleSession,
  loadBattleSession,
  finishBattleSession,
  loadActiveSessions,
};