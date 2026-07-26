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

// Teacher Pro tekshiruvi (qulaylik uchun)
async function isTeacherPro(userId) {
  return await isPremium(userId, "teacher");
}

// ===== FREE TEACHER LIMITLARI =====
// Free teacher: 1 sinf, 15 o'quvchi (umumiy), oyiga 3 topshiriq.
// Teacher Pro: cheksiz (limit tekshiruvi o'tkazib yuboriladi).
const TEACHER_FREE_LIMITS = {
  max_classes: 1,
  max_students: 15,      // teacher bo'yicha JAMI active o'quvchi
  max_assignments_per_month: 3,
};

// Limit yetdimi tekshirish (DB count'ga asoslangan, fail-closed emas — limit muhim).
// feature: "classes" | "students" | "assignments"
// Qaytaradi: { allowed: bool, current: int, limit: int, is_pro: bool }
async function checkTeacherLimit(userId, feature) {
  // Pro bo'lsa — har doim ruxsat
  const pro = await isTeacherPro(userId);
  if (pro) return { allowed: true, is_pro: true, current: 0, limit: null };

  let current = 0;
  let limit = 0;
  try {
    if (feature === "classes") {
      limit = TEACHER_FREE_LIMITS.max_classes;
      const r = await pool.query(
        "SELECT COUNT(*)::int AS c FROM classes WHERE teacher_id = $1 AND archived_at IS NULL",
        [userId]
      );
      current = r.rows[0].c;
    } else if (feature === "students") {
      limit = TEACHER_FREE_LIMITS.max_students;
      // Teacher'ning barcha active sinflaridagi JAMI active o'quvchi (distinct)
      const r = await pool.query(
        `SELECT COUNT(DISTINCT cs.student_id)::int AS c
         FROM class_students cs
         JOIN classes c ON c.id = cs.class_id
         WHERE c.teacher_id = $1 AND c.archived_at IS NULL AND cs.status = 'active'`,
        [userId]
      );
      current = r.rows[0].c;
    } else if (feature === "assignments") {
      limit = TEACHER_FREE_LIMITS.max_assignments_per_month;
      // Joriy oyda yaratilган (arxivlanmagan) topshiriqlar
      const r = await pool.query(
        `SELECT COUNT(*)::int AS c FROM assignments
         WHERE teacher_id = $1 AND created_at >= date_trunc('month', NOW()) AND status != 'archived'`,
        [userId]
      );
      current = r.rows[0].c;
    } else {
      return { allowed: true, is_pro: false, current: 0, limit: null }; // noma'lum feature — bloklamaymiz
    }
  } catch (e) {
    console.error("checkTeacherLimit xatosi (" + feature + "):", e.message);
    // Xatoда — bloklaмaymiz (teacher ishlay olsin, lekin log qoladi)
    return { allowed: true, is_pro: false, current: 0, limit: limit, error: true };
  }

  return { allowed: current < limit, is_pro: false, current: current, limit: limit };
}

// Limit xato javobini tuzish (endpoint'larда ishlatish uchun)
function teacherLimitError(feature) {
  const messages = {
    classes: "Bepul tarifda faqat 1 ta sinf yaratish mumkin. Ko'proq sinflar uchun Teacher Pro kerak.",
    students: "Bepul tarifda o'qituvchida jami 15 ta o'quvchi bo'lishi mumkin. Ko'proq o'quvchilar uchun Teacher Pro kerak.",
    assignments: "Bepul tarifda oyiga 3 ta topshiriq yaratish mumkin. Cheksiz topshiriqlar uchun Teacher Pro kerak.",
  };
  const features = { classes: "more_classes", students: "more_students", assignments: "more_assignments" };
  return {
    error: "teacher_pro_required",
    feature: features[feature] || feature,
    message: messages[feature] || "Bu funksiya Teacher Pro uchun.",
    upgrade_url: "/pricing.html?plan=teacher_pro",
  };
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
async function grantSubscription(userId, plan, days, dbClient) {
  const validPlans = ["student_premium", "parent_premium", "teacher_pro", "center_pro"];
  if (!validPlans.includes(plan)) throw new Error("Noto'g'ri plan: " + plan);
  const d = parseInt(days);
  if (isNaN(d) || d < 1 || d > 3650) throw new Error("Noto'g'ri kun soni");

  const db = dbClient || pool;
  const r = await db.query(
    `INSERT INTO subscriptions (user_id, plan, status, started_at, expires_at)
     VALUES ($1, $2, 'active', NOW(), NOW() + ($3::int * INTERVAL '1 day'))
     ON CONFLICT (user_id, plan) WHERE status = 'active'
     DO UPDATE SET
       expires_at = GREATEST(subscriptions.expires_at, NOW()) + ($3::int * INTERVAL '1 day'),
       updated_at = NOW()
     RETURNING *`,
    [userId, plan, d]
  );
  return r.rows[0];
}

// Obunani bekor qilish (to'lov qaytarilganda — Payme refund/cancel-after-perform).
// IDEMPOTENT: faqat 'active' obunaga tegadi. Ikkinchi marta chaqirilsa (refund
// ikki marta kelsa) — allaqachon 'cancelled', UPDATE 0 qator → zarar yo'q.
// Qaytaradi: { revoked: <nechta obuna bekor qilindi> }.
async function revokeSubscription(userId, plan, dbClient) {
  const validPlans = ["student_premium", "parent_premium", "teacher_pro", "center_pro"];
  if (!validPlans.includes(plan)) throw new Error("Noto'g'ri plan: " + plan);

  const db = dbClient || pool;
  const r = await db.query(
    `UPDATE subscriptions
       SET status = 'cancelled', updated_at = NOW()
     WHERE user_id = $1 AND plan = $2 AND status = 'active'
     RETURNING id`,
    [userId, plan]
  );

  if (r.rows.length > 0) {
    console.log(`[Premium] Obuna bekor qilindi (refund): user ${userId}, ${plan}, ${r.rows.length} ta`);
  } else {
    console.log(`[Premium] revokeSubscription: user ${userId}, ${plan} — aktiv obuna yo'q (idempotent, zarar yo'q)`);
  }
  return { revoked: r.rows.length };
}

// Refund qilingan to'lov bergan muddatnigina qaytarib oladi. Foydalanuvchining
// boshqa to'lovlardan yig'ilgan qolgan muddati saqlanib qoladi.
async function revokeSubscriptionDays(userId, plan, days, dbClient) {
  const validPlans = ["student_premium", "parent_premium", "teacher_pro", "center_pro"];
  if (!validPlans.includes(plan)) throw new Error("Noto'g'ri plan: " + plan);
  const d = parseInt(days, 10);
  if (!Number.isInteger(d) || d < 1 || d > 3650) throw new Error("Noto'g'ri kun soni");

  const db = dbClient || pool;
  const r = await db.query(
    `UPDATE subscriptions
        SET expires_at = expires_at - ($3::int * INTERVAL '1 day'),
            status = CASE
              WHEN expires_at - ($3::int * INTERVAL '1 day') <= NOW() THEN 'cancelled'
              ELSE 'active'
            END,
            cancelled_at = CASE
              WHEN expires_at - ($3::int * INTERVAL '1 day') <= NOW() THEN NOW()
              ELSE cancelled_at
            END,
            updated_at = NOW()
      WHERE user_id = $1 AND plan = $2 AND status = 'active'
      RETURNING id, status, expires_at`,
    [userId, plan, d]
  );
  return { revoked: r.rows.length, subscription: r.rows[0] || null };
}

module.exports = {
  PLAN_GROUPS,
  TEACHER_FREE_LIMITS,
  getUserPlan,
  isPremium,
  isTeacherPro,
  checkTeacherLimit,
  teacherLimitError,
  requirePremium,
  expireOldSubscriptions,
  grantSubscription,
  revokeSubscription,
  revokeSubscriptionDays,
};
