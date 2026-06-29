# AI V1 — Stage 3, 4 o'rnatish (AI Service + Parent Weekly Report endpoint)

Bu paket AI'ning o'zini va parent endpoint'ni qo'shadi. Kalit yo'q bo'lsa —
real-data fallback ishlaydi (crash yo'q). Kalit kelganda — `.env` ga qo'shasiz,
AI darhol ishlaydi.

---

## Yangi fayl (loyihaga qo'shing)

```
aiService.js   ← AI chaqiruvi (OpenAI/Anthropic) + fallback + JSON validatsiya
```

## `.env` (kalit kelganda qo'shasiz — hozir shart emas)

```
AI_PROVIDER=openai                    # yoki: anthropic
AI_REPORTS_ENABLED=true
OPENAI_API_KEY=sk-...                 # OpenAI tanlasangiz
# ANTHROPIC_API_KEY=sk-ant-...        # Anthropic tanlasangiz
# OPENAI_MODEL=gpt-4o-mini            # (ixtiyoriy, default shu)
# ANTHROPIC_MODEL=claude-3-5-haiku-20241022  # (ixtiyoriy)
```

> Kalit yo'q bo'lsa ham hammasi ishlaydi — fallback report chiqadi.

---

## server.js — 2 ta qo'shimcha

### 1. Import (premium import'idan keyin)

```js
const premium = require("./premium");
const aiService = require("./aiService");                        // ← YANGI
const aiSnapshot = require("./aiSnapshot");                       // ← YANGI
```

### 2. Parent Weekly Report endpoint

`/me/subscription` blokining yonига (yoki `server.listen` dan oldin) qo'shing:

```js
// ============ AI: PARENT WEEKLY REPORT ============

// Parent farzandi uchun haftalik AI hisobot (premium parent).
// Oqim: guard → cache tekshir → snapshot qur → AI/fallback → DB saqla → qaytar
app.post("/ai/reports/parent/children/:studentId/weekly",
  authMiddleware, requireParent, premium.requirePremium("parent"),
  async (req, res) => {
  try {
    const parentId = req.user.id;
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(studentId)) return res.status(400).json({ error: "Noto'g'ri ID" });

    // 1. ACCESS GUARD: parent shu childga ulanganmi (active)?
    const link = await pool.query(
      "SELECT id FROM parent_links WHERE parent_id=$1 AND student_id=$2 AND status='active'",
      [parentId, studentId]
    );
    if (link.rows.length === 0) {
      return res.status(403).json({ error: "Bu farzandga ruxsatingiz yo'q" });
    }

    // 2. Joriy hafta davri
    const period = aiSnapshot.currentWeekPeriod();

    // 3. CACHE: shu hafta uchun hisobot allaqachon bormi?
    const cached = await pool.query(
      `SELECT id, ai_output, confidence, status, created_at
       FROM ai_reports
       WHERE target_student_id=$1 AND report_type='parent_weekly_report'
         AND period_start=$2
       ORDER BY created_at DESC LIMIT 1`,
      [studentId, period.start]
    );
    if (cached.rows.length > 0 && req.query.refresh !== "1") {
      const c = cached.rows[0];
      return res.json({
        report: c.ai_output,
        cached: true,
        confidence: c.confidence,
        status: c.status,
        created_at: c.created_at,
      });
    }

    // 4. SNAPSHOT: real data quramiz (faqat shu child)
    const snapshot = await aiSnapshot.buildStudentWeeklySnapshot(studentId, period.start, period.end);

    // 5. AI yoki fallback (kam data → insufficient_data)
    const result = await aiService.generateParentWeeklyReport(snapshot);

    // 6. DB'ga saqlaymiz (cache + tarix)
    const saved = await pool.query(
      `INSERT INTO ai_reports
        (user_id, target_student_id, report_type, audience, period_start, period_end,
         input_snapshot, ai_output, confidence, status)
       VALUES ($1,$2,'parent_weekly_report','parent',$3,$4,$5,$6,$7,$8)
       RETURNING id, created_at`,
      [parentId, studentId, period.start, period.end,
       JSON.stringify(snapshot), JSON.stringify(result.report),
       result.confidence, result.status]
    );

    // 7. Token/narx logи (agar AI ishlatilgan bo'lsa)
    if (result.usage) {
      pool.query(
        `INSERT INTO ai_usage_logs (user_id, report_id, model, input_tokens, output_tokens)
         VALUES ($1,$2,$3,$4,$5)`,
        [parentId, saved.rows[0].id, result.model, result.usage.input, result.usage.output]
      ).catch((e) => console.error("AI usage log xato:", e.message));
    }

    res.json({
      report: result.report,
      data_quality: snapshot.data_quality,
      cached: false,
      confidence: result.confidence,
      status: result.status,
      created_at: saved.rows[0].created_at,
    });
  } catch (err) {
    console.error("Parent AI report xatosi:", err.message);
    res.status(500).json({ error: "Hozir AI hisobotni tayyorlab bo'lmadi. Keyinroq urinib ko'ring." });
  }
});

// Parent: avval yaratilgan AI hisobotlar ro'yxati (bitta child uchun)
app.get("/ai/reports/parent/children/:studentId",
  authMiddleware, requireParent, premium.requirePremium("parent"),
  async (req, res) => {
  try {
    const parentId = req.user.id;
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(studentId)) return res.status(400).json({ error: "Noto'g'ri ID" });

    const link = await pool.query(
      "SELECT id FROM parent_links WHERE parent_id=$1 AND student_id=$2 AND status='active'",
      [parentId, studentId]
    );
    if (link.rows.length === 0) return res.status(403).json({ error: "Ruxsat yo'q" });

    const rows = await pool.query(
      `SELECT id, period_start, period_end, ai_output, confidence, status, created_at
       FROM ai_reports
       WHERE target_student_id=$1 AND report_type='parent_weekly_report'
       ORDER BY period_start DESC LIMIT 12`,
      [studentId]
    );
    res.json({ reports: rows.rows });
  } catch (err) {
    console.error("AI hisobotlar ro'yxati xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});
```

---

## Ishlatish

```bash
node server.js
```

(Migration shart emas — yangi jadval yo'q, faqat kod.)

---

## Test (Stage 3-4)

> **Eslatma:** Bu test uchun parent hisob + unga ulangan child kerak, va parent
> premium bo'lishi kerak. Quyidagi tartibда:

### 1. Parent'ni premium qiling (admin token bilan)
```
POST /dev/subscription/activate
{ "user_id": <PARENT_ID>, "plan": "parent_premium", "days": 30 }
```

### 2. Premium bo'lmagan parent → 402
Premium bermasdan chaqirsangiz:
```
POST /ai/reports/parent/children/<CHILD_ID>/weekly
```
→ `402 { error: "premium_required" }`

### 3. Premium parent → report
Premium berib, qayta chaqiring → AI report JSON qaytadi (kalitsiz = fallback, lekin real data bilan).

### 4. Boshqa child ID → 403
Ulanmagan child ID bilan → `403 { error: "Bu farzandga ruxsatingiz yo'q" }`

### 5. Cache ishlaydi
Bir necha marta chaqiring → 2-marta `cached: true` qaytadi (AI qayta chaqirilmaydi).

### 6. Data kam bo'lsa
Yangi/kam faol child → `status: "insufficient_data"`, "yetarli ma'lumot yo'q" xabari.

---

## Nima kafolatlanadi

| Xususiyat | Holat |
|-----------|-------|
| Parent faqat ulangan child report oladi (IDOR himoya) | ✅ |
| Premium bo'lmasa 402 | ✅ |
| Real data snapshot (fake yo'q) | ✅ |
| Data kam → insufficient_data (yolg'on yozmaydi) | ✅ |
| AI buzilsa → fallback (crash yo'q) | ✅ |
| Kalitsiz ishlaydi (fallback) | ✅ |
| Cache (haftada 1 marta generatsiya) | ✅ |
| Opponent/chat/sinfdosh report'da YO'Q | ✅ |
| Token/narx logи (cost control) | ✅ |

## Test natijalari (sof mantiq)
- aiService: 17/17 ✅ (fallback real-data, validatsiya, data gate, crash yo'q)

---

## Keyingi: Stage 5 (Parent dashboard UI)
- Parent dashboard'ga "AI haftalik hisobot" sectioni
- Holatlar: premium-locked / loading / insufficient-data / generated / error
- Cards: summary, strengths, concerns, recommendations, questions, next-week-focus, confidence badge