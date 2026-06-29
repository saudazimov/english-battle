// premium.js — Premium obuna mantig'i (payment hali yo'q, lekin lock to'liq ishlaydi)
// ============================================================================
// MAQSAD: Premium feature lock'ni payment'siz test qilish. Obuna `subscriptions`
// jadvalida saqlanadi, dev/admin qo'lda aktivlashtiradi. Keyin Payme/Click
// qo'shilganda — faqat obuna yaratish joyi o'zgaradi, qolgan hammasi shu yerda.
//
// FALSAFA: Premium tekshiruvi DOIM serverda (frontendga ishonmaymiz). Muddati
// o'tgan obuna avtomatik "expired" hisoblanadi (expires_at > NOW() sharti).
// ============================================================================

const pool = require("./db");

// Plan guruhlari — qaysi rol qaysi planга tegishli
const PLAN_GROUPS = {
  student: ["student_premium"],
  parent: ["parent_premium"],
  teacher: ["teacher_pro"],
  center: ["center_pro"],
};

// Foydalanuvchining AKTIV obunasini olish (muddati o'tmagan)
// Qaytaradi: { plan, status, expires_at } yoki null
async function getUserPlan(userId) {
  if (!userId) return null;
  try {
    const r = await pool.query(
      `SELECT plan, status, started_at, expires_at
       FROM subscriptions
       WHERE user_id = $1
         AND status = 'active'
         AND expires_at > NOW()
       ORDER BY expires_at DESC
       LIMIT 1`,
      [userId]
    );
    return r.rows[0] || null;
  } catch (e) {
    console.error("getUserPlan xatosi:", e.message);
    return null; // xatoда — premium emas (fail-closed, xavfsiz)
  }
}

// Foydalanuvchi premium'mi? planGroup berilsa — faqat o'sha guruh planini tekshiradi.
//   isPremium(uid)                  → har qanday aktiv premium bo'lsa true
//   isPremium(uid, "parent")        → faqat parent_premium bo'lsa true
async function isPremium(userId, planGroup = null) {
  const sub = await getUserPlan(userId);
  if (!sub) return false;
  if (!planGroup) return true;
  const allowed = PLAN_GROUPS[planGroup] || [];
  return allowed.includes(sub.plan);
}

// Middleware fabrikasi: ma'lum plan guruhini talab qiladi
//   app.get("...", authMiddleware, requireParent, requirePremium("parent"), handler)
function requirePremium(planGroup = null) {
  return async function (req, res, next) {
    try {
      const ok = await isPremium(req.user.id, planGroup);
      if (!ok) {
        return res.status(402).json({   // 402 Payment Required
          error: "premium_required",
          message: planGroup === "parent"
            ? "Bu funksiya Premium ota-onalar uchun."
            : "Bu funksiya Premium foydalanuvchilar uchun.",
          plan_group: planGroup,
        });
      }
      next();
    } catch (e) {
      console.error("requirePremium xatosi:", e.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  };
}

// Muddati o'tgan obunalarni 'expired' deb belgilash (vaqti-vaqti bilan chaqirish mumkin)
async function expireOldSubscriptions() {
  try {
    const r = await pool.query(
      `UPDATE subscriptions SET status = 'expired', updated_at = NOW()
       WHERE status = 'active' AND expires_at <= NOW()
       RETURNING id`
    );
    if (r.rows.length > 0) {
      console.log(`[Premium] ${r.rows.length} ta obuna muddati o'tdi → expired`);
    }
  } catch (e) {
    console.error("expireOldSubscriptions xatosi:", e.message);
  }
}

// Obuna yaratish/uzaytirish (dev/admin yoki keyin payment callback chaqiradi)
// Mavjud aktiv obuna bo'lsa — muddatini uzaytiradi (yangi qator emas).
async function grantSubscription(userId, plan, days) {
  const validPlans = ["student_premium", "parent_premium", "teacher_pro", "center_pro"];
  if (!validPlans.includes(plan)) throw new Error("Noto'g'ri plan: " + plan);
  const d = parseInt(days);
  if (isNaN(d) || d < 1 || d > 3650) throw new Error("Noto'g'ri kun soni");

  // Mavjud aktiv obuna bormi?
  const existing = await pool.query(
    `SELECT id, expires_at FROM subscriptions
     WHERE user_id = $1 AND plan = $2 AND status = 'active'
     LIMIT 1`,
    [userId, plan]
  );

  if (existing.rows.length > 0) {
    // Uzaytiramiz: agar hali amal qilsa — joriy muddatdan, o'tgan bo'lsa — hozirdan
    const cur = existing.rows[0];
    const base = new Date(cur.expires_at) > new Date() ? new Date(cur.expires_at) : new Date();
    const newExpiry = new Date(base.getTime() + d * 86400000);
    const r = await pool.query(
      `UPDATE subscriptions SET expires_at = $1, status = 'active', updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [newExpiry, cur.id]
    );
    return r.rows[0];
  }

  // Yangi obuna
  const expiresAt = new Date(Date.now() + d * 86400000);
  const r = await pool.query(
    `INSERT INTO subscriptions (user_id, plan, status, started_at, expires_at)
     VALUES ($1, $2, 'active', NOW(), $3) RETURNING *`,
    [userId, plan, expiresAt]
  );
  return r.rows[0];
}

module.exports = {
  PLAN_GROUPS,
  getUserPlan,
  isPremium,
  requirePremium,
  expireOldSubscriptions,
  grantSubscription,
};