// battleRecovery.js — Server START'da yarim qolgan janglarni adolatli yakunlash
// ============================================================================
// MUAMMO: Server restart bo'lsa, RAM'dagi battles{} yo'qoladi. O'yinchilar
// "ovorada" qoladi — natija yo'q, rating noaniq.
//
// YECHIM (Grace Finish): Restart'da battle_sessions'dagi 'active' janglarni
// o'qib, HAR o'yinchining HAQIQIY javoblari (battle_answers — DB'da saqlangan)
// asosida adolatli natija beramiz. Hech kim ball/rating yo'qotmaydi.
//
// MUHIM KAFOLATLAR:
//   1. IDEMPOTENT — battle_history'da bu room uchun yozuv bo'lsa, QAYTA yozmaymiz.
//      (Server qayta-qayta restart bo'lsa ham rating ikki marta o'zgarmaydi.)
//   2. FAQAT haqiqiy javoblar hisoblanadi (battle_answers), RAM taxminlari emas.
//   3. Botli janglar — bot ballini DB'dan tik/ay olmaymiz, shuning uchun bunday
//      1v1 botli janglarni "abandoned" qilamiz (rating teginmaydi — adolatli).
//   4. Casual janglar — rating o'zgarmaydi (faqat status yopiladi).
//
// Bu modul finishBattle'ga TEGMAYDI — u jonli janglar uchun ishlaydi. Bu esa
// faqat boot paytida, RAM bo'sh bo'lganda, bir marta ishlaydi.
// ============================================================================

const pool = require("./db");
const { loadActiveSessions, finishBattleSession } = require("./battleStore");

// Liga nomi — server.js'dagi getLeagueName bilan bir xil chegara (mustaqil nusxa,
// boot paytida server.js funksiyalariga bog'lanib qolmaslik uchun).
function leagueName(rating) {
  if (rating >= 2400) return "Grandmaster";
  if (rating >= 2000) return "Master";
  if (rating >= 1600) return "Diamond";
  if (rating >= 1300) return "Platinum";
  if (rating >= 1000) return "Gold";
  if (rating >= 700) return "Silver";
  return "Bronze";
}

const RATING_CHANGE = 20; // server.js bilan bir xil

// Bitta o'yinchining HAQIQIY ballini battle_answers'dan hisoblash
async function realScore(roomId, userId) {
  const r = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE is_correct) AS correct,
       COUNT(*) AS answered
     FROM battle_answers
     WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  return {
    correct: parseInt(r.rows[0].correct) || 0,
    answered: parseInt(r.rows[0].answered) || 0,
  };
}

// Bu room uchun battle_history'da allaqachon yozuv bormi? (idempotentlik)
async function alreadyRecorded(roomId, userId) {
  const r = await pool.query(
    "SELECT 1 FROM battle_history WHERE room_id = $1 AND user_id = $2 LIMIT 1",
    [roomId, userId]
  );
  return r.rows.length > 0;
}

// Bitta o'yinchiga natijani yozish (rating/xp/coins/history) — finishBattle uslubida
async function recordPlayerResult(roomId, session, me, opp) {
  // me/opp: { userId, name, score, isBot }
  if (!me.userId) return; // bot — saqlanmaydi

  // IDEMPOTENT: allaqachon yozilgan bo'lsa — o'tkazib yuboramiz
  if (await alreadyRecorded(roomId, me.userId)) {
    console.log(`[Recovery] ${roomId} / user ${me.userId} — allaqachon yozilgan, o'tkazildi`);
    return;
  }

  const isCasual = (session.mode === "casual");

  // Natija (forfeit emas — ikkalasi ham "tark etgan", shuning uchun sof ball bo'yicha)
  let outcome = "draw";
  let ratingDelta = 0;
  if (me.score > opp.score) { outcome = "win"; ratingDelta = RATING_CHANGE; }
  else if (opp.score > me.score) { outcome = "lose"; ratingDelta = -RATING_CHANGE; }
  if (isCasual) ratingDelta = 0;

  // XP/coins — formatga qarab (length_key). Oddiy jadval (server.js BATTLE_LENGTHS bilan mos).
  const fmt = {
    quick:    { xp: 4,  coins: 1 },
    standard: { xp: 8,  coins: 2 },
    extended: { xp: 12, coins: 3 },
    marathon: { xp: 16, coins: 4 },
  }[session.length_key] || { xp: 8, coins: 2 };

  let xpEarned;
  if (outcome === "win") xpEarned = fmt.xp;
  else if (outcome === "draw") xpEarned = Math.round(fmt.xp / 2);
  else xpEarned = Math.max(1, Math.round(fmt.xp / 4));
  const coinsEarned = fmt.coins;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Reytingni yangilash + streak (finishBattle bilan bir xil mantiq)
    let streakSql;
    if (outcome === "win") streakSql = "win_streak = win_streak + 1, best_win_streak = GREATEST(best_win_streak, win_streak + 1)";
    else if (outcome === "lose") streakSql = "win_streak = 0";
    else streakSql = "win_streak = win_streak";

    await client.query(
      `UPDATE users
         SET xp = xp + $1,
             coins = coins + $2,
             rating = GREATEST(0, rating + $3),
             ${streakSql}
       WHERE id = $4`,
      [xpEarned, coinsEarned, ratingDelta, me.userId]
    );

    // Jang tarixiga yozish (room_id bilan — keyingi restart buni topadi → qayta yozmaydi)
    await client.query(
      `INSERT INTO battle_history
         (user_id, opponent_name, opponent_id, my_score, opponent_score, outcome,
          xp_earned, rating_change, cefr_level, mode, total_questions, room_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [me.userId, opp.name || "Raqib", opp.userId || null, me.score, opp.score, outcome,
       xpEarned, ratingDelta, session.cefr_level || "A1",
       isCasual ? "casual" : "ranked", (session.question_ids || []).length, roomId]
    );

    await client.query("COMMIT");
    console.log(`[Recovery] ${roomId} / user ${me.userId}: ${outcome} (${me.score}-${opp.score}), rating ${ratingDelta >= 0 ? "+" : ""}${ratingDelta}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[Recovery] user ${me.userId} natijani yozishda xato:`, err.message);
  } finally {
    client.release();
  }
}

// Bitta sessiyani qayta ishlash
async function recoverSession(session) {
  const roomId = session.room_id;
  const state = typeof session.state === "string" ? JSON.parse(session.state) : session.state;
  const playersObj = (state && state.players) || {};
  const playerKeys = Object.keys(playersObj);

  // Real (bot bo'lmagan) o'yinchilar
  const realPlayers = playerKeys
    .map((k) => playersObj[k])
    .filter((p) => p.userId != null && !p.isBot);

  // Botli 1v1 yoki yetarli ma'lumot yo'q — rating teginmasdan yopamiz
  const hasBot = playerKeys.some((k) => playersObj[k].isBot);

  // 1v1 (2 o'yinchi) — eng keng tarqalgan holat
  if (session.battle_type === "1v1") {
    if (hasBot || realPlayers.length < 2) {
      // Botli yoki yarim — adolatli: rating teginmaydi, faqat status yopiladi
      await finishBattleSession(roomId);
      console.log(`[Recovery] ${roomId} — botli/yarim 1v1, rating teginmasdan yopildi`);
      return;
    }

    // Ikkala real o'yinchining HAQIQIY ballini DB'dan hisoblaymiz
    const a = realPlayers[0];
    const b = realPlayers[1];
    const aScore = await realScore(roomId, a.userId);
    const bScore = await realScore(roomId, b.userId);

    const aRes = { userId: a.userId, name: a.name, score: aScore.correct };
    const bRes = { userId: b.userId, name: b.name, score: bScore.correct };

    await recordPlayerResult(roomId, session, aRes, bRes);
    await recordPlayerResult(roomId, session, bRes, aRes);
    await finishBattleSession(roomId);
    return;
  }

  // Jamoa janglar (2v2 / 4v4) — restart'da jamoa ballini adolatli tiklash murakkab
  // (kim qaysi jamoada — state.players[].team bor, lekin bot ballari yo'q).
  // XAVFSIZ QAROR: jamoa janglarni rating teginmasdan yopamiz (hech kim zarar ko'rmaydi).
  // Kelajakda jamoa uchun ham to'liq grace-finish qo'shilishi mumkin.
  await finishBattleSession(roomId);
  console.log(`[Recovery] ${roomId} — jamoa jang (${session.battle_type}), rating teginmasdan yopildi`);
}

// ASOSIY: boot paytida chaqiriladi
async function recoverActiveBattles() {
  try {
    const sessions = await loadActiveSessions();
    if (sessions.length === 0) {
      console.log("[Recovery] Tiklanadigan aktiv jang yo'q.");
      return;
    }
    console.log(`[Recovery] ${sessions.length} ta yarim qolgan jang topildi — adolatli yakunlanyapti...`);
    for (const s of sessions) {
      try {
        await recoverSession(s);
      } catch (err) {
        console.error(`[Recovery] ${s.room_id} sessiyasida xato:`, err.message);
        // Bitta xato boshqalarni to'xtatmasin — keyingisiga o'tamiz
      }
    }
    console.log("[Recovery] Tiklash tugadi.");
  } catch (err) {
    console.error("[Recovery] recoverActiveBattles xatosi:", err.message);
  }
}

module.exports = { recoverActiveBattles };