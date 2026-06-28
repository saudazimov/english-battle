# Guruh B — Xavfsizlik to'plami (server.js o'zgarishlari)

Bu paket audit'dagi **4 ta xavfsizlik riskini** yopadi:
- Parent connect-code RAW saqlanardi → endi HASH
- Exam cheksiz qayta urinish mumkin edi → cooldown + eligibility re-check
- Ban qilingan user socketda o'ynay olardi → socketda ban tekshiruvi
- Production'da OTP console'ga tushardi → SMS majburlash

---

## Yangi fayllar

```
parentCode.js                       ← parent kod hash/generatsiya moduli
migrations/003_parent_code_hash.sql ← parent_connect_code_hash ustuni
```

## `.env` ga qo'shing (1 qator)

```
PARENT_CODE_PEPPER=<uzun-tasodifiy-maxfiy-satr>
```
> Bu parent kod hashlash uchun maxfiy "qalampir". Masalan 32+ belgi tasodifiy satr.
> Agar qo'ymasangiz, kod `JWT_SECRET`'dan foydalanadi (baribir ishlaydi, lekin alohida pepper toza).

---

## server.js — 5 ta o'zgarish

### O'zgarish 1: import qo'shish (10-qator atrofida)

`battleRecovery` import'idan keyin:
```js
const { recoverActiveBattles } = require("./battleRecovery");
const parentCode = require("./parentCode");   // ← YANGI
```

---

### O'zgarish 2: SMS production majburlash (boot — eng past, server.listen ichida)

**Qator ~8519**, `server.listen` ni quyidagiga almashtiring:
```js
server.listen(PORT, async () => {
  console.log("Server ishga tushdi: http://localhost:3000");

  // PRODUCTION'da SMS kredensiali majburiy — OTP console'ga tushib qolmasin
  if (process.env.NODE_ENV === "production" && (!process.env.ESKIZ_EMAIL || !process.env.ESKIZ_PASSWORD)) {
    console.error("‼️ XAVFSIZLIK: NODE_ENV=production, lekin ESKIZ_EMAIL/ESKIZ_PASSWORD yo'q!");
    console.error("   OTP kodlar SMS o'rniga konsolga chiqadi — bu xavfli. Server to'xtatildi.");
    process.exit(1);
  }
  if (!process.env.ESKIZ_EMAIL || !process.env.ESKIZ_PASSWORD) {
    console.warn("⚠️  DIQQAT: SMS kredensiali yo'q — DEV rejim (OTP konsolga chiqadi). Production'da .env to'ldiring.");
  }

  await recoverActiveBattles();
});
```

---

### O'zgarish 3: Socketda ban tekshiruvi (registerUser ichida, ~1261-qator)

`const normalizedUserId = String(trustedUserId);` qatoridan **keyin**, `socket.userId = ...` dan **oldin** qo'shing:

```js
const normalizedUserId = String(trustedUserId);

// XAVFSIZLIK: ban qilingan foydalanuvchi socketga ulanmasin (jang/chat qila olmasin)
try {
  const banChk = await pool.query("SELECT is_banned FROM users WHERE id = $1", [normalizedUserId]);
  if (banChk.rows[0] && banChk.rows[0].is_banned) {
    socket.emit("accountBanned", { message: "Hisobingiz bloklangan." });
    socket.disconnect(true);
    return;
  }
} catch (e) { /* DB xatosi — ulanishga ruxsat (fail-open), lekin loglanadi */ console.error("ban check xato:", e.message); }

socket.userId = normalizedUserId;
```

---

### O'zgarish 4: Parent kod — HASH bilan yaratish va qidirish

Bu eng katta o'zgarish. **3 ta joyni** almashtiramiz.

#### 4a. `assignNewParentCode` funksiyasini almashtiring (~7035-qator)

ESKI (`genParentCodeString` + `assignNewParentCode` butun bloki, 7028–7055) o'rniga:

```js
// Unique kod yaratib o'quvchiga yozadi — RAW faqat qaytariladi, DB'da HASH saqlanadi
async function assignNewParentCode(studentId) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const rawCode = parentCode.generateRawCode();
    const codeHash = parentCode.hashCode(rawCode);
    try {
      const r = await pool.query(
        `UPDATE users
         SET parent_connect_code_hash = $1,
             parent_connect_code = NULL,
             parent_connect_code_created_at = NOW(),
             parent_connect_code_expires_at = NOW() + INTERVAL '${parentCode.PARENT_CODE_TTL_HOURS} hours'
         WHERE id = $2
         RETURNING parent_connect_code_created_at, parent_connect_code_expires_at`,
        [codeHash, studentId]
      );
      // RAW kodni faqat shu yerda qaytaramiz (DB'da yo'q!)
      return {
        rawCode: rawCode,
        created_at: r.rows[0].parent_connect_code_created_at,
        expires_at: r.rows[0].parent_connect_code_expires_at,
      };
    } catch (e) {
      if (e.code === "23505") continue; // hash collision (deyarli imkonsiz) — qayta urinamiz
      throw e;
    }
  }
  throw new Error("Kod yaratib bo'lmadi (collision)");
}
```

> Eski `const PARENT_CODE_CHARS`, `const PARENT_CODE_TTL_DAYS`, `genParentCodeString`
> qatorlarini (7025–7032) **o'chiring** — endi `parentCode.js` da.

#### 4b. `/student/parent-code` GET endpointini almashtiring (~7065)

```js
// --- Kod holatini olish: amaldagi kod BOR-YO'Qligini bildiradi, lekin RAW kodni
//     QAYTA KO'RSATMAYDI (hash'dan tiklab bo'lmaydi — xuddi parol kabi). ---
app.get("/student/parent-code", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const cur = await pool.query(
      "SELECT parent_connect_code_hash, parent_connect_code_created_at, parent_connect_code_expires_at FROM users WHERE id = $1",
      [studentId]
    );
    const row = cur.rows[0];
    const hasValidCode = row && row.parent_connect_code_hash &&
                         row.parent_connect_code_expires_at &&
                         new Date(row.parent_connect_code_expires_at) > new Date();

    if (hasValidCode) {
      // Amaldagi kod bor, lekin RAW'ni ko'rsata olmaymiz
      return res.json({
        has_active_code: true,
        code: null,                          // RAW yo'q — xavfsizlik
        created_at: row.parent_connect_code_created_at,
        expires_at: row.parent_connect_code_expires_at,
        message: "Amaldagi kod bor. Kodni qayta ko'rish mumkin emas — kerak bo'lsa yangi kod yarating."
      });
    }

    // Amaldagi kod yo'q — YANGI yaratamiz va RAW'ni BIR MARTA ko'rsatamiz
    const fresh = await assignNewParentCode(studentId);
    res.json({
      has_active_code: true,
      code: fresh.rawCode,                   // BIR MARTALIK — o'quvchi ko'chirib oladi
      created_at: fresh.created_at,
      expires_at: fresh.expires_at,
      message: "Kodni saqlab oling — qayta ko'rsatilmaydi."
    });
  } catch (err) {
    console.error("Parent kod olish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});
```

#### 4c. `/student/parent-code/regenerate` POST endpointini almashtiring (~7088)

```js
app.post("/student/parent-code/regenerate", authMiddleware, requireStudent, async (req, res) => {
  try {
    const fresh = await assignNewParentCode(req.user.id);
    res.json({
      success: true,
      code: fresh.rawCode,                   // BIR MARTALIK
      expires_at: fresh.expires_at,
      message: "Yangi kod yaratildi. Saqlab oling — qayta ko'rsatilmaydi."
    });
  } catch (err) {
    console.error("Parent kod yangilash xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});
```

#### 4d. `/parent/link` ichidagi kod qidiruvini almashtiring (~7200)

ESKI (7195–7211):
```js
  let { code, relationship } = req.body;
  code = (code || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
  ...
    const stu = await pool.query(
      `SELECT id, first_name, last_name, cefr_level, rating, role
       FROM users
       WHERE parent_connect_code = $1
         AND parent_connect_code_expires_at IS NOT NULL
         AND parent_connect_code_expires_at > NOW()`,
      [code]
    );
```

YANGI:
```js
  let { code, relationship } = req.body;
  code = (code || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
  relationship = REL_ALLOWED.includes(relationship) ? relationship : "guardian";
  if (code.length < 6 || code.length > 12) { parentLinkNoteFail(req); return res.status(400).json({ error: "Kod noto'g'ri" }); }

  try {
    const codeHash = parentCode.hashCode(code);   // ← kiritilgan kodni HASH qilamiz
    const stu = await pool.query(
      `SELECT id, first_name, last_name, cefr_level, rating, role
       FROM users
       WHERE parent_connect_code_hash = $1
         AND parent_connect_code_expires_at IS NOT NULL
         AND parent_connect_code_expires_at > NOW()`,
      [codeHash]
    );
```

#### 4e. (Muhim) Link muvaffaqiyatli bo'lgach — kodni o'chirish (bir martalik)

`/parent/link` ichida, `await client.query("COMMIT");` dan **keyin** (link saqlangach),
kodni kuydiramiz (qayta ishlatib bo'lmasin):

```js
      await client.query("COMMIT");
    } catch (txe) { await client.query("ROLLBACK"); throw txe; }
    finally { client.release(); }

    // BIR MARTALIK: kod ishlatildi — o'chiramiz (boshqa ota-ona shu kod bilan ulana olmasin)
    await pool.query(
      "UPDATE users SET parent_connect_code_hash = NULL, parent_connect_code_expires_at = NULL WHERE id = $1",
      [child.id]
    );

    parentLinkNoteOk(req);
```

> **Eslatma:** Bir o'quvchiga bir nechta ota-ona ulanishi kerak bo'lsa (masalan ona + ota),
> har biri uchun o'quvchi alohida kod yaratadi. Bu xavfsizroq (har ulanish alohida kod).

---

### O'zgarish 5: Exam cooldown + eligibility re-check (`/exam/submit` ichida, ~5342)

`/exam/submit` boshida, `const currentLevel = ...` aniqlangandan **keyin**, javoblarni
tekshirishdan **oldin** quyidagini qo'shing:

```js
    const currentLevel = userResult.rows[0].cefr_level;
    const nextLevel = getNextLevel(currentLevel);

    // ===== ANTI-ABUSE 1: eng yuqori darajada imtihon yo'q =====
    if (!nextLevel) {
      return res.status(400).json({ error: "Siz eng yuqori darajadasiz — imtihon yo'q." });
    }

    // ===== ANTI-ABUSE 2: COOLDOWN — oxirgi urinishdan 24 soat o'tishi kerak =====
    const lastAttempt = await pool.query(
      `SELECT taken_at, passed FROM exam_attempts
       WHERE user_id = $1 AND from_level = $2
       ORDER BY taken_at DESC LIMIT 1`,
      [userId, currentLevel]
    );
    if (lastAttempt.rows.length > 0 && !lastAttempt.rows[0].passed) {
      const hoursSince = (Date.now() - new Date(lastAttempt.rows[0].taken_at).getTime()) / 3600000;
      const COOLDOWN_HOURS = 24;
      if (hoursSince < COOLDOWN_HOURS) {
        const wait = Math.ceil(COOLDOWN_HOURS - hoursSince);
        return res.status(429).json({
          error: `Keyingi imtihongacha ${wait} soat kuting.`,
          cooldown_hours_left: wait
        });
      }
    }

    // ===== ANTI-ABUSE 3: ELIGIBILITY re-check (frontendga ishonmaymiz) =====
    const statsChk = await pool.query(
      `SELECT COUNT(*) AS battles,
              COALESCE(SUM(my_score),0) AS total_correct,
              COALESCE(SUM(total_questions),0) AS total_questions
       FROM battle_history
       WHERE user_id = $1 AND cefr_level = $2 AND mode IN ('ranked','casual')`,
      [userId, currentLevel]
    );
    const exBattles = parseInt(statsChk.rows[0].battles);
    const exTotalQ = parseInt(statsChk.rows[0].total_questions);
    const exAccuracy = exTotalQ > 0 ? Math.round((parseInt(statsChk.rows[0].total_correct) / exTotalQ) * 100) : 0;
    if (exBattles < 10 || exAccuracy < 70) {
      return res.status(403).json({
        error: "Imtihon shartlari bajarilmagan (kamida 10 jang va 70% aniqlik kerak).",
        battles: exBattles, accuracy: exAccuracy
      });
    }
```

> Bu 3 ta tekshiruv `/exam/start` da emas, **`/exam/submit`** da bo'lishi shart —
> chunki haqiqiy himoya natija yozilayotgan joyda bo'ladi (client `/exam/start` ni
> chetlab o'tib to'g'ridan-to'g'ri submit chaqira olmasin).

---

## Ishlatish

```bash
node migrate.js          # 003 parent hash migration qo'llanadi
node migrate.js status   # 003 ham "done" bo'lishi kerak
node server.js           # serverni qayta ishga tushiring
```

---

## Nima kafolatlanadi

| Muammo | Yechim | Holat |
|--------|--------|-------|
| Parent kod RAW saqlanardi | SHA-256 + pepper hash, raw bir martalik | ✅ |
| Kod cheksiz ishlatilardi | Link bo'lgach o'chadi (bir martalik) | ✅ |
| Kod 7 kun amal qilardi | 48 soat (qisqaroq xavf oynasi) | ✅ |
| Exam cheksiz qayta urinish | 24 soat cooldown | ✅ |
| Exam'ni chetlab o'tish | submit'da eligibility re-check | ✅ |
| Ban'dan keyin socket ishlardi | socketda ban tekshiruvi + disconnect | ✅ |
| Production'da OTP console'da | NODE_ENV=production'da majburlash | ✅ |

## Test natijalari
- Parent kod hash mantig'i: **10/10 ✅** (bir xillik, normalizatsiya, pepper himoyasi, unique generatsiya)